// "Uutta Helsingissä" — yksi aikajana siitä, mitä kaupunkiin on auennut ja
// mitä on aukeamassa. Jokainen rivi tulee nimetystä lähteestä:
//
//   anniskeluluparekisteri   uudet ravintolat ja baarit, avauspäivineen
//                            (data/new-openings.json + Google-kortti)
//   OpenStreetMap            uudet kahvilat, leipomot, saunat, putiikit…
//                            (data/activity-reasons.json → newPlaces)
//   museot.fi                alkavat ja juuri alkaneet näyttelyt
//                            (data/activity-reasons.json → byName/nayttely)
//   uutisputki               avautumisjutut kiinnittyvät riveihin, ja jutut
//                            joille ei löydy riviä nousevat omaan kaistaansa
//
// PUHDAS FUNKTIO: buildNewInHelsinki ei hae mitään — sivu (app/
// uutta-helsingissa) kokoaa syötteet ja testit ajavat saman logiikan
// kiinteillä syötteillä.

import { reasonKey } from './restaurant-reasons'
import type { RestaurantReason } from './restaurant-reasons'
import { matchNewsToRestaurants } from './restaurant-news-match'
import type { NewsLike } from './restaurant-news-match'
import { NEIGHBORHOODS } from './types'

/** Suodatinluokat sivulla. */
export type NewKind = 'ravintola' | 'baari' | 'kahvila' | 'kauppa' | 'tekeminen' | 'nayttely'

export interface NewItemNews {
  title: string
  url: string
  source: string
  date: string
}

export interface NewItem {
  id: string
  name: string
  kind: NewKind
  /** ISO-päivä: avauspäivä tai näyttelyn alku. */
  date: string
  /**
   * true = päivä on OSM-merkinnän luontipäivä, EI todennettu avauspäivä —
   * ovi on voinut aueta aiemmin. Näkymä sanoo silloin "Uusi elokuussa"
   * eikä "Avattu 19.8." (rehellisyys ennen täsmällisyyttä).
   */
  dateApprox?: boolean
  /** true = ei vielä auennut/alkanut. */
  upcoming: boolean
  address?: string
  neighborhood?: string
  lat?: number
  lon?: number
  image?: string
  www?: string
  rating?: number
  reviews?: number
  /** Näyttelyllä museo + ajanjakso; muilla ei käytössä. */
  note?: string
  /** Mistä tieto on peräisin — näytetään merkkinä rivillä. */
  sources: { label: string; url?: string }[]
  /** Tuorein lehtijuttu juuri tästä paikasta. */
  news?: NewItemNews
}

export interface NewsRailItem {
  title: string
  url: string
  source: string
  date: string
}

export interface MonthGroup {
  /** "2026-08" — vakaa ryhmittelyavain. */
  key: string
  /** "Elokuu" tai "Joulukuu 2025" kun vuosi ei ole kuluva. */
  label: string
  items: NewItem[]
}

export interface NewInHelsinki {
  upcoming: NewItem[]
  months: MonthGroup[]
  newsRail: NewsRailItem[]
  total: number
}

/** Kuinka pitkälle taaksepäin aikajana ulottuu. Rekisterihaku kattaa
 *  käytännössä saman ikkunan, joten pidempi ei toisi rivejä lisää. */
export const TIMELINE_DAYS = 180

/** Näyttely on "uutta" kun sen alusta on enintään tämän verran — pitkään
 *  pyörinyt näyttely kuuluu tekemistä-sivulle, ei uutuusaikajanalle. */
export const EXHIBITION_NEW_DAYS = 60

/**
 * OSM:n version==1 EI takaa uutta paikkaa — joku voi kartoittaa vanhan
 * (mitattu: Palace ja Ihana Kahvila saivat uutuusrivin). Sama arvostelukatto
 * kuin muuallakin: satojen arvostelujen paikka ei ole juuri avattu.
 */
export const MAX_REVIEWS_FOR_NEW = 150

const MONTHS_FI = [
  'Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu',
  'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu',
]

/** Avautumisjutun tunnistus uutisotsikosta. 'avautu' kattaa avautuu/avautui,
 *  'avajais' avajaiset/avajaisiaan. Tiukka mieluummin kuin arvaileva. */
export const OPENING_HEADLINE = /avautu|avataan|aukeaa|avaa ovensa|avasi ovensa|avajais/i

// ── LUOKITTELU ──────────────────────────────────────────────────────────────

/** OSM:n päätagi → sivun suodatinluokka. */
export function kindFromVenueType(venueType: string): NewKind {
  if (/^(restaurant)$/.test(venueType)) return 'ravintola'
  if (/^(bar|pub|biergarten)$/.test(venueType)) return 'baari'
  if (/^(cafe|ice_cream|bakery|pastry|confectionery|chocolate|coffee)$/.test(venueType)) return 'kahvila'
  if (/^(deli|cheese|wine|books|music|second_hand)$/.test(venueType)) return 'kauppa'
  return 'tekeminen'
}

/** Googlen kategoria (uudet avaukset) → suodatinluokka. Googlen kategoriat
 *  ovat kirjavia ("Gruusialainen ravintola", "Viinibaari") — luokka luetaan
 *  avainsanasta, oletus ravintola koska lähde on anniskeluluparekisteri. */
export function kindFromGoogleCategory(category: string): NewKind {
  const c = category.toLowerCase()
  if (/kahvila/.test(c)) return 'kahvila'
  if (/baari|yökerho|pubi|panimo/.test(c)) return 'baari'
  if (/myymälä|kauppa|putiikki/.test(c)) return 'kauppa'
  return 'ravintola'
}

// ── KAUPUNGINOSA ────────────────────────────────────────────────────────────

/** Koordinaatit → tunnettu kaupunginosa (NEIGHBORHOODS-rajaukset) tai
 *  osoitteen kaupunki. Rajausten ulkopuolinen Helsinki jää ilman merkkiä —
 *  parempi tyhjä kuin väärä. */
export function neighborhoodOf(lat?: number, lon?: number, address?: string): string | undefined {
  if (typeof lat === 'number' && typeof lon === 'number') {
    for (const n of NEIGHBORHOODS) {
      const [minLon, minLat, maxLon, maxLat] = n.bbox.split(',').map(Number)
      if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) return n.name
    }
  }
  const m = address?.match(/\b(Espoo|Vantaa|Kauniainen)\b/i)
  if (m) return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
  return undefined
}

// ── SYÖTTEET ────────────────────────────────────────────────────────────────

/** Google-kortti OSM-paikalle (scripts/enrich-new-places.ts). */
export interface PlaceCardInput {
  image?: string | null
  address?: string | null
  www?: string | null
  rating?: number | null
  reviewCount?: number | null
}

export interface OpeningInput {
  name: string
  address?: string
  lat?: number
  lon?: number
  image?: string | null
  www?: string | null
  category?: string
  googleRating?: number | null
  reviewCount?: number | null
  openedAt: string
}

export interface BuildInput {
  /** data/new-openings.json → openings */
  openings: OpeningInput[]
  /** data/activity-reasons.json → newPlaces (OSM, kind 'uusi') */
  newPlaces: RestaurantReason[]
  /** data/activity-reasons.json → byName-osion nayttely-syyt */
  exhibitions: RestaurantReason[]
  /** Tuoreet uutiset (lib/restaurant-news). */
  news: NewsLike[]
  /**
   * lowercase-nimi → Google-arvostelumäärä (venue_ratings). OSM-rivin
   * uutuusväitteen vartija. `undefined` = tietoa ei saatu → OSM-rivit
   * jätetään pois, koska väitettä ei voida tarkistaa (mieluummin
   * suppeampi sivu kuin väärä "uusi paikka").
   */
  reviewCounts?: Map<string, number>
  /**
   * OSM-osoite → Google-kortti (data/new-places-enriched.json). Antaa
   * OSM-riville kuvan, osoitteen ja arvosanan — ja kortin oma
   * arvostelumäärä on TUOREEMPI uutuusvartija kuin venue_ratings, joten
   * kortillinen rivi kelpaa vaikka venue_ratings ei vastaisi.
   */
  placeCards?: Map<string, PlaceCardInput>
  today: Date
}

// ── KOKOAMINEN ──────────────────────────────────────────────────────────────

export function buildNewInHelsinki(input: BuildInput): NewInHelsinki {
  const { today } = input
  const todayIso = today.toISOString().slice(0, 10)
  const oldestIso = new Date(today.getTime() - TIMELINE_DAYS * 86_400_000).toISOString().slice(0, 10)

  const byKey = new Map<string, NewItem>()
  const items: NewItem[] = []
  const push = (key: string, item: NewItem) => {
    byKey.set(key, item)
    items.push(item)
  }

  // 1) LUPAREKISTERIN AVAUKSET — rikkain lähde (kuva, osoite, arvosana),
  //    joten se kirjataan ensin ja voittaa päällekkäisyydet. Sama
  //    arvostelukatto kuin ravintolasivulla: tuore lupa + sadat arvostelut
  //    = luvan uusiminen tai omistajanvaihdos, EI avaus (mitattu:
  //    tiedostossa on 261 arvostelun paikka tuoreella luvalla).
  for (const o of input.openings) {
    if (!o.openedAt || o.openedAt < oldestIso) continue
    if ((o.reviewCount ?? 0) > MAX_REVIEWS_FOR_NEW) continue
    const key = reasonKey(o.name)
    if (byKey.has(key)) continue
    push(key, {
      id: `avaus:${key}`,
      name: o.name,
      kind: kindFromGoogleCategory(o.category ?? ''),
      date: o.openedAt,
      upcoming: o.openedAt > todayIso,
      address: o.address,
      neighborhood: neighborhoodOf(o.lat, o.lon, o.address),
      lat: o.lat,
      lon: o.lon,
      image: o.image ?? undefined,
      www: o.www ?? undefined,
      rating: o.googleRating ?? undefined,
      reviews: o.reviewCount ?? undefined,
      sources: [{ label: 'anniskeluluparekisteri' }],
    })
  }

  // 2) OSM:N UUDET PAIKAT — kattaa sen minkä luparekisteri ohittaa (kahvilat,
  //    leipomot, saunat, putiikit). Sama paikka molemmissa → rekisterikortti
  //    voittaa ja OSM lisätään lähdemerkiksi.
  //
  //    UUTUUSVARTIJA kahdesta lähteestä: Google-kortin arvostelumäärä
  //    (tuorein tieto) tai venue_ratings. Ilman kumpaakaan riviä ei näytetä —
  //    väitettä "uusi" ei silloin voida tarkistaa.
  {
    const seenUrl = new Set<string>()
    for (const p of input.newPlaces) {
      if (!p.venue || !p.date || p.date < oldestIso) continue
      if (p.url && seenUrl.has(p.url)) continue   // sama paikka solmuna ja alueena
      if (p.url) seenUrl.add(p.url)
      const card = p.url ? input.placeCards?.get(p.url) : undefined
      const cardReviews = card?.reviewCount ?? undefined
      const vrReviews = input.reviewCounts?.get(p.venue.toLowerCase().trim())
      if (cardReviews !== undefined) {
        if (cardReviews > MAX_REVIEWS_FOR_NEW) continue        // vanha paikka, vasta kartoitettu
      } else if (input.reviewCounts) {
        if (vrReviews !== undefined && vrReviews > MAX_REVIEWS_FOR_NEW) continue
      } else {
        continue                                               // ei vartijaa → ei väitettä
      }
      const key = reasonKey(p.venue)
      const existing = byKey.get(key)
      if (existing) {
        existing.sources.push({ label: 'OpenStreetMap', url: p.url })
        continue
      }
      push(key, {
        id: `osm:${key}`,
        name: p.venue,
        kind: kindFromVenueType(p.venueType ?? ''),
        date: p.date,
        // OSM-päivä on karttamerkinnän luontipäivä, ei todennettu avauspäivä.
        dateApprox: true,
        upcoming: false,                          // OSM-merkintä syntyy vasta kun paikka on olemassa
        address: card?.address ?? undefined,
        neighborhood: neighborhoodOf(p.lat, p.lon, card?.address ?? undefined),
        lat: p.lat,
        lon: p.lon,
        image: card?.image ?? undefined,
        www: card?.www ?? undefined,
        rating: card?.rating ?? undefined,
        reviews: cardReviews ?? vrReviews,
        sources: [{ label: 'OpenStreetMap', url: p.url }],
      })
    }
  }

  // 3) NÄYTTELYT — nimi ja ajanjakso museon omasta kalenterista. Aikajanalle
  //    vain juuri alkaneet; tulossa-osioon kaikki alkamattomat.
  const seenExhibit = new Set<string>()
  for (const e of input.exhibitions) {
    if (!e.date || !e.note || !e.url || seenExhibit.has(e.url)) continue
    seenExhibit.add(e.url)
    const startInDays = (Date.parse(e.date) - today.getTime()) / 86_400_000
    if (startInDays <= 0 && -startInDays > EXHIBITION_NEW_DAYS) continue
    const title = e.note.replace(/\s*\([^)]*\)\s*$/, '')
    const period = /\(([^)]*)\)\s*$/.exec(e.note)?.[1]
    items.push({
      id: `nayttely:${e.url}`,
      name: title,
      kind: 'nayttely',
      date: e.date,
      upcoming: e.date > todayIso,
      note: [e.venue, period].filter(Boolean).join(' · '),
      image: e.image,
      sources: [{ label: 'museot.fi', url: e.url }],
    })
  }

  // 4) UUTISET RIVEILLE — sanarajallinen nimiosuma (samat vartijat kuin
  //    ravintolakorteissa). Ikkuna on tässä 30 pv: juttu avauksesta on
  //    uutuusrivillä ajankohtainen pidempään kuin ravintolakortilla.
  const usedLinks = new Set<string>()
  const matches = matchNewsToRestaurants(input.news, items.map((i) => ({ id: i.id, name: i.name })))
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const m of matches) {
    const ageDays = (today.getTime() - Date.parse(m.pubDate)) / 86_400_000
    if (Number.isNaN(ageDays) || ageDays > 30) continue
    const item = byId.get(m.restaurantId)
    if (!item) continue
    item.news = { title: m.headline, url: m.link, source: m.source, date: m.pubDate }
    usedLinks.add(m.link)
  }

  // 5) UUTISKAISTA — avautumisjutut joille ei löytynyt riviä (hotellit,
  //    kaupat, paikat joita rekisterit eivät vielä tunne). Otsikko ja linkki
  //    ovat lähteen omia; emme väitä mitään mitä otsikko ei sano.
  const newsRail: NewsRailItem[] = []
  for (const n of input.news) {
    if (usedLinks.has(n.link)) continue
    if (!OPENING_HEADLINE.test(n.title)) continue
    const ageDays = (today.getTime() - Date.parse(n.pubDate)) / 86_400_000
    if (Number.isNaN(ageDays) || ageDays > 30) continue
    newsRail.push({ title: n.title, url: n.link, source: n.source, date: n.pubDate })
    if (newsRail.length >= 8) break               // syöte on jo tuorein ensin
  }

  // ── RYHMITTELY ────────────────────────────────────────────────────────────
  const upcoming = items
    .filter((i) => i.upcoming)
    .sort((a, b) => a.date.localeCompare(b.date))  // lähin ensin

  const monthMap = new Map<string, NewItem[]>()
  for (const i of items) {
    if (i.upcoming) continue
    const key = i.date.slice(0, 7)
    const list = monthMap.get(key)
    if (list) list.push(i)
    else monthMap.set(key, [i])
  }
  const thisYear = String(today.getUTCFullYear())
  const months: MonthGroup[] = [...monthMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => {
      const [year, month] = key.split('-')
      const name = MONTHS_FI[Number(month) - 1] ?? key
      return {
        key,
        label: year === thisYear ? name : `${name} ${year}`,
        items: list.sort((a, b) => b.date.localeCompare(a.date)),
      }
    })

  return { upcoming, months, newsRail, total: items.length }
}
