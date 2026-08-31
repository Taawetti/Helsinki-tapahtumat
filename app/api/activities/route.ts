import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import type { Activity, ActivityCategory } from '@/lib/types'
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

const DEAD_IMAGES = new Set<string>((deadImageData as { dead?: string[] }).dead ?? [])


interface OSMElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// ── Category mapping from OSM tags ───────────────────────

function osmCategory(tags: Record<string, string>): ActivityCategory {
  const tourism = tags.tourism
  const leisure = tags.leisure
  const natural = tags.natural
  const amenity = tags.amenity

  if (leisure === 'sauna' || amenity === 'sauna') return 'sauna'
  if (tourism === 'museum') return 'museo'
  if (tourism === 'gallery') return 'galleria'
  if (tourism === 'viewpoint') return 'nakopaikka'
  if (natural === 'beach' || leisure === 'swimming_area' || leisure === 'swimming_pool') return 'uimaranta'
  if (leisure === 'park' || leisure === 'garden' || leisure === 'nature_reserve') return 'puisto'
  if (amenity === 'marketplace') return 'markkina'
  if (leisure === 'sports_centre' || leisure === 'pitch' || leisure === 'fitness_centre') return 'urheilu'
  if (tourism === 'attraction') return 'nahtavyys'
  if (tourism === 'zoo' || leisure === 'amusement_park' || amenity === 'library') return 'muu'
  return 'muu'
}

function osmDescription(tags: Record<string, string>, cat: ActivityCategory): string {
  // Return a human-readable category label in Finnish
  const labels: Record<ActivityCategory, string> = {
    // kirpputori ei tule OSM:stä vaan data/secondhand.json:sta (MapView
    // yhdistää sen karttakerrokseen) — tyyppi vaatii silti rivin tähän.
    kirpputori: 'Kirpputori',
    sauna:      'Julkinen sauna',
    museo:      'Museo',
    nahtavyys:  'Nähtävyys',
    galleria:   'Taidegalleria',
    nakopaikka: 'Näköalapaikka',
    uimaranta:  'Uimaranta / uimapaikka',
    puisto:     'Puisto / luontoalue',
    markkina:   'Kauppahalli / tori',
    urheilu:    'Urheilupaikka',
    muu:        'Aktiviteetti',
  }
  // Append sauna fuel info
  if (cat === 'sauna' && tags['sauna:fuel']) {
    const fuel = tags['sauna:fuel']
    const fuelFi = fuel === 'wood' ? 'puusauna' : fuel === 'electric' ? 'sähkösauna' : fuel
    return `Julkinen sauna — ${fuelFi}`
  }
  // Append specific attraction subtype if available
  if (tags.historic) return `Historiallinen kohde (${tags.historic})`
  return labels[cat]
}

function osmAddress(tags: Record<string, string>): string {
  const street = tags['addr:street'] ?? ''
  const num = tags['addr:housenumber'] ?? ''
  return street ? `${street}${num ? ` ${num}` : ''}` : ''
}

// ── OSM Overpass query ────────────────────────────────────
// Helsinki+Espoo+Vantaa bbox: south,west,north,east

const BBOX = '60.09,24.58,60.41,25.26'

// Fetch nodes AND ways (museums, parks etc. are often mapped as closed ways)
const OSM_QUERY = `[out:json][timeout:35][bbox:${BBOX}];
(
  node["leisure"~"^(sauna|swimming_area|swimming_pool|park|garden|nature_reserve|sports_centre|fitness_centre|amusement_park)$"]["name"];
  node["amenity"~"^(sauna|marketplace|library)$"]["name"];
  node["tourism"~"^(museum|attraction|gallery|viewpoint|zoo)$"]["name"];
  node["natural"="beach"]["name"];
  way["tourism"~"^(museum|attraction|gallery|zoo)$"]["name"];
  way["leisure"~"^(park|garden|nature_reserve|sports_centre|amusement_park)$"]["name"];
  way["amenity"~"^(marketplace|library)$"]["name"];
  way["natural"="beach"]["name"];
);
out center;`

const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const OSM_HEADERS = {
  'User-Agent': 'Helsinki-Tapahtumat/1.0 (https://github.com/Taawetti/Helsinki-tapahtumat)',
  'Accept': 'application/json',
}

// Places that are OSM relations (not nodes/ways) or otherwise missed by the query.
// These are always injected unless the OSM query already returned them by name.
const SUPPLEMENT: Activity[] = [
  { id: 'supplement-suomenlinna',    name: 'Suomenlinna',           description: 'Merilinnoitus',   category: 'nahtavyys', address: 'Suomenlinna',              city: 'Helsinki', lat: 60.1454, lon: 24.9881, www: 'https://www.suomenlinna.fi',        phone: null, image: null, fee: false,     outdoor: true  },
  { id: 'supplement-loyly',          name: 'Löyly',                 description: 'Julkinen sauna',  category: 'sauna',     address: 'Hernesaarenranta 4',       city: 'Helsinki', lat: 60.1551, lon: 24.9140, www: 'https://loylyhelsinki.fi',          phone: null, image: null, fee: true      },
  { id: 'supplement-allas',          name: 'Allas Sea Pool',        description: 'Merikylpylä',     category: 'uimaranta', address: 'Katajanokanlaituri 2a',    city: 'Helsinki', lat: 60.1671, lon: 24.9563, www: 'https://allasseapool.fi',           phone: null, image: null, fee: true      },
  { id: 'supplement-kansallismuseo', name: 'Kansallismuseo',        description: 'Museo',           category: 'museo',     address: 'Mannerheimintie 34',       city: 'Helsinki', lat: 60.1733, lon: 24.9316, www: 'https://www.kansallismuseo.fi',     phone: null, image: null, fee: true      },
  { id: 'supplement-ham',            name: 'HAM Helsinki',          description: 'Taidegalleria',   category: 'galleria',  address: 'Eteläinen Rautatiekatu 8', city: 'Helsinki', lat: 60.1635, lon: 24.9332, www: 'https://hamhelsinki.fi',            phone: null, image: null, fee: true      },
]

async function _fetchActivities(): Promise<Activity[]> {
  const url = `?data=${encodeURIComponent(OSM_QUERY)}`

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror + url, {
        headers: OSM_HEADERS,
        signal: AbortSignal.timeout(40000),
      })
      if (!res.ok) continue

      const data: { elements: OSMElement[] } = await res.json()
      const seen = new Set<string>()
      const results: Activity[] = []

      for (const el of data.elements ?? []) {
        const tags = el.tags ?? {}
        const name = (tags.name || tags['name:fi'] || '').trim()
        if (!name) continue

        const lat = el.type === 'node' ? el.lat : el.center?.lat
        const lon = el.type === 'node' ? el.lon : el.center?.lon
        if (!lat || !lon) continue

        // Deduplicate by name + rough location
        const key = `${name.toLowerCase()}|${Math.round(lat * 1000)}|${Math.round(lon * 1000)}`
        if (seen.has(key)) continue
        seen.add(key)

        const cat = osmCategory(tags)

        // Skip non-public swimming pools
        if ((tags.leisure === 'swimming_pool' || tags.amenity === 'swimming_pool') && tags.access === 'private') continue
        // Skip private saunas
        if (cat === 'sauna' && tags.access === 'private') continue

        results.push({
          id: `act-${el.type[0]}${el.id}`,
          name,
          description: osmDescription(tags, cat),
          category: cat,
          address: osmAddress(tags),
          city: tags['addr:city'] ?? '',
          lat,
          lon,
          www: tags.website ?? tags.url ?? tags['contact:website'] ?? null,
          phone: tags.phone ?? tags['contact:phone'] ?? null,
          openingHours: tags.opening_hours ?? undefined,
          image: null,
          fee: tags.fee === 'yes' ? true : tags.fee === 'no' ? false : undefined,
          charge: tags.charge ?? tags.entrance_fee ?? undefined,
          wheelchair: tags.wheelchair === 'yes' ? true : tags.wheelchair === 'no' ? false : undefined,
          saunaFuel: tags['sauna:fuel'] ?? undefined,
          outdoor: tags.indoor === 'no' ? true : undefined,
          wikidata: tags.wikidata ?? undefined,
          wikipedia: tags.wikipedia ?? undefined,
        })
      }

      // Inject supplement places (OSM relations / hard-to-query) unless already present
      const nameSet = new Set(results.map(r => r.name.toLowerCase()))
      for (const s of SUPPLEMENT) {
        if (!nameSet.has(s.name.toLowerCase())) results.push(s)
      }

      // Sort: wikipedia/wikidata entries first (more notable), then by name
      results.sort((a, b) => {
        const aScore = (a.wikipedia ? 2 : 0) + (a.wikidata ? 1 : 0) + (a.www ? 1 : 0)
        const bScore = (b.wikipedia ? 2 : 0) + (b.wikidata ? 1 : 0) + (b.www ? 1 : 0)
        if (aScore !== bScore) return bScore - aScore
        return a.name.localeCompare(b.name, 'fi')
      })

      // Assign images: Wikipedia first, then Supabase (DataForSEO) as supplement
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

      console.log(`[activities] OSM: ${results.length} results from ${mirror}`)
      return results
    } catch (err) {
      console.warn(`[activities] OSM mirror ${mirror} failed:`, (err as Error).message)
    }
  }

  console.error('[activities] All OSM mirrors failed')
  return []
}

export const fetchActivitiesCached = unstable_cache(_fetchActivities, ['activities-osm-v2'], {
  revalidate: 86400,
  tags: ['activities'],
})

export async function GET() {
  const base = await fetchActivitiesCached()
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
  })
}
