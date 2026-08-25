// Oppaiden datanhaku — JAETTU sekä SEO-sivuille (app/saunat, /terassit,
// /jamit, /kirpputorit, /ilmaiset-museot) että etusivun in-app-oppaille
// (/api/guides/[slug] → GuideInlineView). Omistaja 25.8.2026: "kaikki pysyy
// tässä etusivun näkymässä" — oppaat avautuvat etusivulla kuten kaupungin-
// osasuodatinkin, SEO-sivut säilyvät Googlelle. Logiikka on siirretty
// sivuilta TÄNNE sellaisenaan, jotta molemmat pinnat näyttävät saman datan.
import { fetchLinkedEventsAll, LE_MAX_PAGE_SIZE } from '@/lib/linked-events'
import { helsinkiDateRange } from '@/lib/helsinki-time'
import { TERRACE_REGEX } from '@/lib/nightlife'
import { fetchActivitiesCached } from '@/app/api/activities/route'
import { fetchRestaurantNews } from '@/lib/restaurant-news'
import { matchNewsToRestaurants } from '@/lib/restaurant-news-match'
import { credibilityScore } from '@/lib/credibility'
import { reasonKey } from '@/lib/restaurant-reasons'
import type { SaunaRow } from '@/components/SaunatView'
import type { GuidePlace } from '@/components/GuidePlaceList'
import saunaCardData from '@/data/sauna-cards.json'
import activityReasonData from '@/data/activity-reasons.json'
import secondhandData from '@/data/secondhand.json'

export const JAMIT_REGEX = /jamit\b|jameja\b|jamien\b|jameissa\b|jameihin\b|\bjami\b|jam[\s-]?sessio|jam session|open[\s-]?mic|open[\s-]?stage|lavamikki|avoin lava/i
export const KIRPPIS_REGEX = /kirppis|kirpputori|second\s?hand|vintage|vaatteidenvaihto|myyjäis/i

export interface GuideEvent {
  id: string
  title: string
  startTime: string
  venue: string
  isFree: boolean
  price?: string | null
  image?: string | null
}

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  start_time: string
  images?: { url: string }[]
  location?: { name?: { fi?: string; en?: string } }
  offers?: { is_free: boolean; price?: { fi?: string } }[]
  keywords?: { name: { fi?: string; en?: string } }[]
}

/** LinkedEvents-tekstihaut yhdistettynä + dedupattuna, mennyt alkupäivä pois
 *  (24 h armo — `start=` osuu myös käynnissä oleviin), regex-portti koska
 *  tekstihaku on löperö. Sama kuvio kaikilla tapahtumaoppailla. */
async function fetchGuideEvents(opts: {
  terms: string[]
  days: number
  gate: RegExp
  limit: number
  withMedia?: boolean
}): Promise<GuideEvent[]> {
  const { start, end } = helsinkiDateRange(opts.days)
  const perTerm = await Promise.all(
    opts.terms.map((text) =>
      fetchLinkedEventsAll<LEEvent>(
        (page) =>
          `https://api.hel.fi/linkedevents/v1/event/?${new URLSearchParams({
            text, format: 'json', start, end,
            page: String(page), page_size: String(LE_MAX_PAGE_SIZE),
            include: 'location,keywords', sort: '-start_time', division: 'helsinki',
          })}`,
        () => ({ next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }),
      ),
    ),
  )
  const events: GuideEvent[] = []
  const seen = new Set<string>()
  const cutoff = new Date(start).getTime() - 24 * 60 * 60 * 1000
  for (const { rows } of perTerm) {
    for (const raw of rows) {
      if (seen.has(raw.id)) continue
      seen.add(raw.id)
      if (new Date(raw.start_time).getTime() < cutoff) continue
      const haystack = [
        raw.name?.fi || '', raw.short_description?.fi || '',
        ...(raw.keywords || []).map((k) => k.name?.fi || ''),
      ].join(' ')
      if (!opts.gate.test(haystack.toLowerCase())) continue
      const offer = raw.offers?.[0]
      const isFree = offer?.is_free ?? false
      events.push({
        id: raw.id,
        title: raw.name?.fi || raw.name?.en || 'Tapahtuma',
        startTime: raw.start_time,
        venue: raw.location?.name?.fi || raw.location?.name?.en || '',
        isFree,
        ...(opts.withMedia
          ? { price: isFree ? null : (offer?.price?.fi || null), image: raw.images?.[0]?.url || null }
          : {}),
      })
    }
  }
  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  return events.slice(0, opts.limit)
}

export const fetchTerraceEvents = () =>
  fetchGuideEvents({ terms: ['terassi', 'ulkoilma'], days: 14, gate: TERRACE_REGEX, limit: 40, withMedia: true })

// withMedia myös näille: LinkedEventsissä on kuva mitatusti 24/24 jamit- ja
// kirppistapahtumalla, mutta ilman lippua kuva karsiutui hakuvaiheessa ja
// kortit jäivät kuvattomiksi (mitattu 25.8.2026).
export const fetchJamitEvents = () =>
  fetchGuideEvents({ terms: ['jamit', 'open mic', 'open stage', 'jam session'], days: 30, gate: JAMIT_REGEX, limit: 30, withMedia: true })

export const fetchKirppisEvents = () =>
  fetchGuideEvents({ terms: ['kirpputori', 'kirppis', 'vintage'], days: 30, gate: KIRPPIS_REGEX, limit: 20, withMedia: true })

// ── Paikkarikastus ravintoladatasta (kuva + arvosana + kotisivu) ───────────
// Kattoterassit ja pubivisapaikat ovat baareja, jotka ovat JO /api/restaurants
// -datassa kuvineen ja Google-arvosanoineen — oppaan reitti vain ei hakenut
// niitä. Mitattu 25.8.2026: kattoterasseista 5/5 saa kuvan ja 4/5 arvosanan,
// pubivisoista ~39/92 osuu turvallisella säännöllä.
//
// MATCHAUS ON TIUKKA, EI SUMEA. Mitatut ansat:
//  - sumea/token-overlap tuotti väärän osuman ("Helmi Grilli, Kontula" →
//    "Alin Grilli 22" kuvineen ja 4,8 tähtineen)
//  - "BISOUBISOU" on datassa kahdesti (kuvallinen kuratoitu + kuvaton OSM)
//    samassa osoitteessa → sumea haku olisi voinut valita väärän
//  - "Pub Kontula" ei osu mihinkään; se on oikea tulos, ei virhe
// Siksi: täsmällinen normalisoitu nimi, ja kun osumia on monta, ratkaisu
// tehdään VAIN katuosoitteella. Muuten kortti jää tekstijulisteeksi.

export interface PlaceEnrichment {
  image: string | null
  rating: number | null
  www: string | null
}

export const normName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
/** Katuosan vertailuavain: "Neljäs linja 17-19, 00530 Helsinki" → "neljas linja 17".
 *  Postinumeroon EI voi luottaa (lähdedatassa sama katu kahdella eri numerolla). */
export const streetKey = (s: string | null | undefined): string | null => {
  if (!s) return null
  const first = s.split(',')[0].trim().toLowerCase()
  const m = first.match(/^(.+?)\s+(\d+)/)
  if (!m) return null
  return `${m[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '')} ${m[2]}`
}

interface RestaurantLite {
  name: string
  address?: string | null
  image?: string | null
  googleRating?: number | null
  www?: string | null
}

/** Rakentaa nimi → rikastus -kartan ravintoladatasta. Palauttaa hakufunktion,
 *  joka vaatii osoiteosuman kun samannimisiä on useita. */
export async function buildPlaceEnricher(origin: string): Promise<(name: string, address?: string | null) => PlaceEnrichment | null> {
  let rows: RestaurantLite[] = []
  try {
    const r = await fetch(`${origin}/api/restaurants`, { signal: AbortSignal.timeout(20000) })
    if (r.ok) rows = ((await r.json()) as { restaurants?: RestaurantLite[] }).restaurants ?? []
  } catch { /* rikastus on lisä, ei ehto — opas toimii ilmankin */ }

  const byName = new Map<string, RestaurantLite[]>()
  for (const row of rows) {
    if (!row?.name) continue
    const k = normName(row.name)
    const list = byName.get(k)
    if (list) list.push(row)
    else byName.set(k, [row])
  }

  return (name: string, address?: string | null): PlaceEnrichment | null => {
    const candidates = byName.get(normName(name))
    if (!candidates || candidates.length === 0) return null
    let hit: RestaurantLite | undefined
    if (candidates.length === 1) {
      hit = candidates[0]
    } else {
      // Monta samannimistä → ratkaise katuosoitteella; ilman osoitetta ei arvata.
      const want = streetKey(address)
      if (!want) return null
      hit = candidates.find((c) => streetKey(c.address) === want)
    }
    if (!hit) return null
    return {
      image: hit.image ?? null,
      rating: typeof hit.googleRating === 'number' ? hit.googleRating : null,
      www: hit.www ?? null,
    }
  }
}

// ── Saunat: OSM-aktiviteetit + viikkorikastetut kortit + uutuusmerkit +
// tuoreet lehtijutut (siirretty app/saunat/page.tsx:stä sellaisenaan) ──────

interface SaunaCardEntry {
  image: string | null
  address: string | null
  www: string | null
  phone: string | null
  priceLevel: string | null
}
interface ReasonFilePlace { venue?: string; venueType?: string; date?: string }
interface ReasonFileShape { newPlaces?: ReasonFilePlace[] }

const MONTHS_INESSIVE = [
  'tammikuussa', 'helmikuussa', 'maaliskuussa', 'huhtikuussa', 'toukokuussa', 'kesäkuussa',
  'heinäkuussa', 'elokuussa', 'syyskuussa', 'lokakuussa', 'marraskuussa', 'joulukuussa',
]

/** Tuore lehtijuttu saunasta → 📰-rivi kortille. Uutisputken kaatuminen ei
 *  kaada opasta. */
async function attachSaunaNews(saunas: SaunaRow[]): Promise<void> {
  try {
    const news = await fetchRestaurantNews()
    const matches = matchNewsToRestaurants(news, saunas.map((s) => ({ id: s.id, name: s.name })))
    const byId = new Map(matches.map((m) => [m.restaurantId, m]))
    const now = Date.now()
    for (const s of saunas) {
      const m = byId.get(s.id)
      if (!m) continue
      const ageDays = (now - Date.parse(m.pubDate)) / 86_400_000
      if (Number.isNaN(ageDays) || ageDays > 30) continue
      s.news = { title: m.headline, url: m.link, source: m.source }
    }
  } catch { /* ei uutisia tällä kertaa */ }
}

export async function buildSaunaRows(): Promise<SaunaRow[]> {
  const activities = await fetchActivitiesCached()
  const cards = (saunaCardData as { cards?: Record<string, SaunaCardEntry> }).cards ?? {}

  // OSM:n uudet saunat (karttamerkintä ≤ 180 pv) → "Uusi elokuussa" -merkki.
  const reasonFile = activityReasonData as unknown as ReasonFileShape
  const newSaunaByKey = new Map<string, string>()
  for (const p of reasonFile.newPlaces ?? []) {
    if (p.venueType === 'sauna' && p.venue && p.date) {
      const m = new Date(p.date + 'T12:00:00Z').getUTCMonth()
      newSaunaByKey.set(reasonKey(p.venue), `Uusi ${MONTHS_INESSIVE[m] ?? ''}`)
    }
  }

  const saunas: SaunaRow[] = activities
    .filter((a) => a.category === 'sauna')
    .map((a) => {
      const card = cards[a.name.toLowerCase().trim()]
      return {
        id: a.id,
        name: a.name,
        address: a.address ?? card?.address?.split(',')[0] ?? null,
        lat: a.lat ?? null,
        lon: a.lon ?? null,
        image: a.image ?? card?.image ?? null,
        www: a.www ?? card?.www ?? null,
        phone: a.phone ?? card?.phone ?? null,
        openingHours: a.openingHours ?? null,
        charge: a.charge ?? null,
        priceLevel: card?.priceLevel ?? null,
        rating: a.rating ?? null,
        reviews: a.reviewCount ?? null,
        newLabel: newSaunaByKey.get(reasonKey(a.name)) ?? null,
        news: null,
      }
    })
    .sort((a, b) => credibilityScore(b.rating, b.reviews) - credibilityScore(a.rating, a.reviews))

  await attachSaunaNews(saunas)
  return saunas
}

// ── Kirpputorit: liikkeet OSM-viikkohausta (data/secondhand.json) ──────────

export function mapSecondhandShops(): GuidePlace[] {
  return (secondhandData as {
    shops: { name: string; lat: number; lon: number; address: string | null; openingHours: string | null; www: string | null }[]
  }).shops.map((s, i) => ({
    id: `shop-${i}`,
    name: s.name,
    address: s.address,
    lat: s.lat,
    lon: s.lon,
    openingHours: s.openingHours,
    www: s.www,
  }))
}

// ── Ilmaiset museot & galleriat: OSM fee=no (aina vapaa pääsy) ─────────────

export async function buildFreeMuseums(): Promise<{ museums: GuidePlace[]; galleries: GuidePlace[] }> {
  const activities = await fetchActivitiesCached()
  const seen = new Set<string>()
  const toPlace = (category: 'museo' | 'galleria'): GuidePlace[] =>
    activities
      .filter((a) => a.category === category && a.fee === false)
      .filter((a) => {
        const key = a.name.toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((a) => ({
        id: a.id,
        name: a.name,
        address: a.address ?? null,
        lat: a.lat ?? null,
        lon: a.lon ?? null,
        openingHours: a.openingHours ?? null,
        www: a.www ?? null,
        image: a.image ?? null,
        rating: a.rating ?? null,
        reviews: a.reviewCount ?? null,
        sub: a.city && a.city !== 'Helsinki' ? a.city : null,
      }))
      .sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0))
  return { museums: toPlace('museo'), galleries: toPlace('galleria') }
}
