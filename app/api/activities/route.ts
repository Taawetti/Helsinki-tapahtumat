import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import type { Activity } from '@/lib/types'
import { fetchImagesCached, getEventImage } from '@/lib/venue-images'
import { supabase } from '@/lib/supabase'
// Kuolleet kuvaosoitteet — sama harava kuin ravintolapuolella, ks.
// scripts/sweep-dead-images.ts. Aktiviteettien kuvat tulevat samasta
// venue_ratings-taulusta ja lahoavat samaa tahtia (Sompasauna oli 403).
import deadImageData from '@/data/dead-images.json'
// Tekemisen syyt: näyttelyt (museot.fi), toimituslistat (Time Out, MyHelsinki,
// Kotimaassa, Happens, Venuu) ja OSM:n uudet paikat. Haetaan viikoittain
// (scripts/fetch-activity-reasons.ts). Uutiset tulevat tunneittain samasta
// putkesta kuin ravintoloille. Peruskohteet (Linnanmäki ym.) nousevat VAIN
// uutisella tai näyttelyllä — omistajan linjaus.
import activityReasonData from '@/data/activity-reasons.json'
import { matchReasons, filterReasonsForBasics, isTouristBasic } from '@/lib/restaurant-reasons'
import type { ReasonFile, RestaurantReason } from '@/lib/restaurant-reasons'
import { credibilityScore } from '@/lib/credibility'
import { fetchRestaurantNews } from '@/lib/restaurant-news'
import { matchNewsToRestaurants, toNewsReason } from '@/lib/restaurant-news-match'
// OSM-OTOS (23.10.2026): Overpassia EI kutsuta enää pyynnön aikana. Kysely
// kesti 20–40 s, ensimmäinen peili alkoi vastata 403 ja oppaiden reitti
// (maxDuration 30) kaatui joka pyynnöllä 504:ään — saunaopas ja ilmaiset
// museot olivat tyhjiä. Otoksen päivittää päivittäin /api/cron/osm-otos
// Supabase Storageen; tämä reitti lukee sen, tai jos sitä ei ole, repoon
// committoidun pohjaotoksen (scripts/hae-osm-otos.ts). Overpass-kysely ja
// tagien tulkinta: lib/osm-aktiviteetit.ts.
import { lueOtosVarastosta, type OsmOtos } from '@/lib/osm-aktiviteetit'
import pohjaOtosData from '@/data/aktiviteetit-osm.json'

const DEAD_IMAGES = new Set<string>((deadImageData as { dead?: string[] }).dead ?? [])
const POHJA_OTOS = pohjaOtosData as unknown as OsmOtos

// Paikat, jotka ovat OSM:ssä relaatioita (eivät solmuja/alueita) tai jäävät
// muuten kyselyn ulkopuolelle. Lisätään aina, ellei OSM jo tuonut samannimistä.
const SUPPLEMENT: Activity[] = [
  { id: 'supplement-suomenlinna',    name: 'Suomenlinna',           description: 'Merilinnoitus',   category: 'nahtavyys', address: 'Suomenlinna',              city: 'Helsinki', lat: 60.1454, lon: 24.9881, www: 'https://www.suomenlinna.fi',        phone: null, image: null, fee: false,     outdoor: true  },
  { id: 'supplement-loyly',          name: 'Löyly',                 description: 'Julkinen sauna',  category: 'sauna',     address: 'Hernesaarenranta 4',       city: 'Helsinki', lat: 60.1551, lon: 24.9140, www: 'https://loylyhelsinki.fi',          phone: null, image: null, fee: true      },
  { id: 'supplement-allas',          name: 'Allas Sea Pool',        description: 'Merikylpylä',     category: 'uimaranta', address: 'Katajanokanlaituri 2a',    city: 'Helsinki', lat: 60.1671, lon: 24.9563, www: 'https://allasseapool.fi',           phone: null, image: null, fee: true      },
  { id: 'supplement-kansallismuseo', name: 'Kansallismuseo',        description: 'Museo',           category: 'museo',     address: 'Mannerheimintie 34',       city: 'Helsinki', lat: 60.1733, lon: 24.9316, www: 'https://www.kansallismuseo.fi',     phone: null, image: null, fee: true      },
  { id: 'supplement-ham',            name: 'HAM Helsinki',          description: 'Taidegalleria',   category: 'galleria',  address: 'Eteläinen Rautatiekatu 8', city: 'Helsinki', lat: 60.1635, lon: 24.9332, www: 'https://hamhelsinki.fi',            phone: null, image: null, fee: true      },
]

export interface ActivitiesTila {
  activities: Activity[]
  /** Mistä otos luettiin ja milloin se haettiin Overpassista — näkyy
   *  /api/activities-vastauksessa, jotta vanhentunut otos huomataan. */
  otos: { fetchedAt: string; lahde: 'varasto' | 'pohja' }
}

async function _fetchActivities(): Promise<ActivitiesTila> {
  // Otos Storagesta; ilman sitä repoon committoitu pohjaotos. Kumpikaan ei
  // kutsu Overpassia, joten tämä kestää sekunteja eikä minuuttia.
  const varasto = await lueOtosVarastosta()
  const otos = varasto ?? POHJA_OTOS
  const lahde = varasto ? 'varasto' as const : 'pohja' as const
  // Kopiot: rikastus kirjoittaa riveihin paikallaan (kuva, aukiolot, arvosana),
  // eikä moduulitason pohjaotosta eikä välimuistin oliota saa muuttaa.
  const results: Activity[] = otos.activities.map((a) => ({ ...a }))

  // Täydennyspaikat (OSM-relaatiot / kyselyn ulkopuoliset), ellei jo mukana
  const nameSet = new Set(results.map(r => r.name.toLowerCase()))
  for (const s of SUPPLEMENT) {
    if (!nameSet.has(s.name.toLowerCase())) results.push({ ...s })
  }

  // Järjestys: Wikipedia/Wikidata-kohteet ensin (tunnetuimmat), sitten nimi
  results.sort((a, b) => {
    const aScore = (a.wikipedia ? 2 : 0) + (a.wikidata ? 1 : 0) + (a.www ? 1 : 0)
    const bScore = (b.wikipedia ? 2 : 0) + (b.wikidata ? 1 : 0) + (b.www ? 1 : 0)
    if (aScore !== bScore) return bScore - aScore
    return a.name.localeCompare(b.name, 'fi')
  })

  // Kuvat: Wikipedia ensin, sitten Supabase (DataForSEO) täydentää
  const { venues: venueMap } = await fetchImagesCached()
  for (const act of results) {
    act.image = getEventImage(act.name, [act.category], venueMap, {})
  }

  // Täytä puuttuvat kuvat + Google-aukiolot Supabasen DataForSEO-rikastuksesta.
  // Sivutettu: Supabase katkaisee SELECTin 1000 riviin, ja act:-rivejä voi
  // rikastuksen jälkeen olla yli sen — sivuttamaton luku tiputtaisi osan.
  if (supabase) {
    // Ulkokohteet (rannat, puistot, näköpaikat, nähtävyydet) ovat aina
    // saavutettavissa — niille EI aseteta Google-aukioloa, ettei "aina auki"
    // -logiikka rikkoudu (Google listaa niille usein rajatun "käyntiajan").
    const OUTDOOR_ALWAYS_OPEN = new Set(['uimaranta', 'puisto', 'nakopaikka', 'nahtavyys'])
    const PAGE = 1000
    const actImageMap: Record<string, string> = {}
    const actHoursMap: Record<string, string> = {}
    const actDescMap: Record<string, string> = {}
    const actRateMap: Record<string, { rating: number; reviews: number }> = {}
    for (let page = 0; ; page++) {
      const { data: rows, error } = await supabase
        .from('venue_ratings')
        .select('venue_key, main_image, google_hours, description, google_rating, review_count')
        .like('venue_key', 'act:%')
        .order('venue_key')  // deterministinen sivutus — ilman tätä rivi voi jäädä väliin >1000 kohdalla
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (error || !rows || rows.length === 0) break
      for (const row of rows as { venue_key: string; main_image: string | null; google_hours: string | null; description: string | null; google_rating: number | null; review_count: number | null }[]) {
        const key = row.venue_key.replace('act:', '')
        if (row.main_image && !DEAD_IMAGES.has(row.main_image)) actImageMap[key] = row.main_image
        if (row.google_hours) actHoursMap[key] = row.google_hours
        if (row.description) actDescMap[key] = row.description
        if (typeof row.google_rating === 'number') actRateMap[key] = { rating: row.google_rating, reviews: row.review_count ?? 0 }
      }
      if (rows.length < PAGE) break
    }
    for (const act of results) {
      const key = act.name.toLowerCase().trim()
      if (!act.image && actImageMap[key]) act.image = actImageMap[key]
      // Google-aukiolot ovat tuoreempia kuin OSM → suositaan niitä, PAITSI
      // ulkokohteille joiden "aina auki" -takuu säilytetään
      if (actHoursMap[key] && !OUTDOOR_ALWAYS_OPEN.has(act.category)) act.openingHours = actHoursMap[key]
      // Google-kuvaus on laadukas suomenkielinen esittely → suositaan sitä
      if (actDescMap[key]) act.description = actDescMap[key]
      const rt = actRateMap[key]
      if (rt) { act.rating = rt.rating; act.reviewCount = rt.reviews }
    }
  }

  console.log(`[activities] otos ${lahde} (${otos.fetchedAt}): ${results.length} kohdetta`)
  return { activities: results, otos: { fetchedAt: otos.fetchedAt, lahde } }
}

// v3: paluuarvo on { activities, otos } — vanha avain piti pelkkää listaa.
const _fetchActivitiesTilaCached = unstable_cache(_fetchActivities, ['activities-osm-v3'], {
  revalidate: 86400,
  tags: ['activities'],
})

/** Lista + otoksen alkuperä (GET-vastaukseen). */
export const fetchActivitiesTila = (): Promise<ActivitiesTila> => _fetchActivitiesTilaCached()

/** Pelkkä lista — oppaat (lib/guide-data) ja muut kutsujat. */
export const fetchActivitiesCached = async (): Promise<Activity[]> => (await _fetchActivitiesTilaCached()).activities

// Otoksen luku + kuvat + Google-rikastus + uutiset kestävät kylmänä muutaman
// sekunnin; 60 s on varaa uutisputken hitaimmalle päivälle.
export const maxDuration = 60

export async function GET() {
  // Heittävä haku ei saa kaataa reittiä: tämä pyyntö palvellaan tyhjänä
  // (EI välimuistiin), seuraava yrittää uudelleen.
  let hakuEpaonnistui = false
  let otos: ActivitiesTila['otos'] | null = null
  const base = await fetchActivitiesTila().then((t) => { otos = t.otos; return t.activities }).catch((e): Activity[] => {
    console.error('[activities] haku ohitettu tältä pyynnöltä:', e)
    hakuEpaonnistui = true
    return []
  })
  const today = new Date()
  const reasonFile = activityReasonData as unknown as ReasonFile

  const nameCounts = new Map<string, number>()
  for (const a of base) {
    const k = a.name.toLowerCase().trim()
    nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1)
  }

  // Näyttely kiinnittyy vain paikkaan joka voi PITÄÄ näyttelyn — museot.fi:n
  // nimiosuma samannimiseen puistoon on väärä kohde (mitattu: Tamminiemen
  // PUISTO sai museorakennuksen näyttelymerkin).
  const EXHIBITION_CATS = new Set(['museo', 'galleria', 'nahtavyys', 'muu'])

  // 1) Ulkoiset syyt: näyttelyt, toimituslistat, uudet paikat. Peruskohteilta
  //    (Linnanmäki, Suomenlinna…) jäävät voimaan vain uutinen ja näyttely.
  let activities: Activity[] = base.map((a) => {
    const rs = filterReasonsForBasics(
      a.name,
      matchReasons({ name: a.name, reviewCount: a.reviewCount ?? undefined }, reasonFile.byName, {
        uniqueName: nameCounts.get(a.name.toLowerCase().trim()) === 1,
      }),
    ).filter((r) => r.kind !== 'nayttely' || EXHIBITION_CATS.has(a.category))
    return rs.length ? { ...a, reasons: rs } : a
  })

  // Linnanmäen huvipuistoalue: laitteet ovat OSM:ssä omina kohteinaan, eikä
  // peruskohdesääntö nimellä tavoita niitä. Osa kantaa Googlen nimiosumana
  // koko puiston arvostelumassaa (mitattu: Namipyörä/Riemupyörä/Hurjakuru
  // 4,5 / 28 398 = puiston oma luku), joten huippuarvio ohittaa kaiken tällä
  // alueella. Uutinen ja näyttely nostavat silti — sama linja kuin puistolla
  // itsellään.
  const LMK = { latMin: 60.1852, latMax: 60.1908, lonMin: 24.933, lonMax: 24.9468 }
  const inLinnanmaki = (a: Activity) =>
    typeof a.lat === 'number' && typeof a.lon === 'number' &&
    a.lat >= LMK.latMin && a.lat <= LMK.latMax && a.lon >= LMK.lonMin && a.lon <= LMK.lonMax

  // 2) Huippuarvio: kategorian arvostetuimmat oman arvosteludatan perusteella —
  //    sama Wilson-kaava kuin ravintoloissa. Vain paikoille joilla ei jo ole
  //    ulkoista syytä, eikä koskaan turistiperuskohteille ("Suomenlinna on
  //    Helsingin arvostetuimpia" ei kerro paikalliselle mitään).
  const TOP_PER_CATEGORY: Record<string, number> = {
    sauna: 8, museo: 8, galleria: 8, nakopaikka: 6, uimaranta: 6, urheilu: 8, nahtavyys: 6,
  }
  const HUIPPU_MIN = 0.85
  {
    const byCat = new Map<string, { i: number; c: number }[]>()
    activities.forEach((a, i) => {
      if (a.reasons?.length) return
      const cap = TOP_PER_CATEGORY[a.category]
      if (!cap) return
      if (isTouristBasic(a.name)) return
      if (inLinnanmaki(a)) return
      const c = credibilityScore(a.rating, a.reviewCount)
      if (c < HUIPPU_MIN) return
      const list = byCat.get(a.category)
      if (list) list.push({ i, c })
      else byCat.set(a.category, [{ i, c }])
    })
    const chosen = new Set<number>()
    for (const [cat, list] of byCat) {
      list.sort((a, b) => b.c - a.c)
      for (const x of list.slice(0, TOP_PER_CATEGORY[cat])) chosen.add(x.i)
    }
    if (chosen.size) {
      activities = activities.map((a, i) =>
        chosen.has(i)
          ? { ...a, reasons: [{ kind: 'huippuarvio' as const, label: 'Helsingin arvostetuimpia', source: 'Google-arvostelut' }] }
          : a,
      )
    }
  }

  // 3) Uutiset: tuore juttu nostaa MINKÄ TAHANSA paikan — myös Linnanmäen
  //    ("uutinen saa nostaa Linnanmäen", omistajan linjaus). Uutisputken
  //    kaatuminen ei koskaan kaada tekemistä-listaa.
  try {
    const news = await fetchRestaurantNews()
    const matches = matchNewsToRestaurants(news, activities)
    if (matches.length) {
      const byId = new Map(matches.map((m) => [m.restaurantId, m]))
      activities = activities.map((a) => {
        const m = byId.get(a.id)
        if (!m) return a
        const reason = toNewsReason(m, today)
        if (!reason) return a
        const rs: RestaurantReason[] = [...(a.reasons ?? []), reason]
        return { ...a, reasons: rs }
      })
    }
  } catch { /* ei uutisia tällä kertaa */ }

  // Build category counts
  const categoryCount: Record<string, number> = {}
  for (const a of activities) {
    categoryCount[a.category] = (categoryCount[a.category] ?? 0) + 1
  }

  return NextResponse.json({
    activities,
    total: activities.length,
    categoryCount,
    otos,
  }, {
    headers: {
      // Sama reunavälimuisti kuin ravintola-API:ssa: Vercelin reuna palvelee
      // millisekunneissa ja päivittää taustalla; selain saa käyttää kopiotaan.
      // OSM-katkon tyhjä varavastaus EI saa tarttua mihinkään välimuistiin
      // (mitattu 5.9.2026: tyhjä 200 lähti max-age=300:lla ja selain piti
      // tyhjää listaa 5 min vaikka data oli jo kunnossa).
      'Cache-Control': hakuEpaonnistui
        ? 'no-store'
        : 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
