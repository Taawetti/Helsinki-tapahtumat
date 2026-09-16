// Open Mic Finland (openmicfinland.fi) — jamit ja open mic -illat.
//
// MIKSI TÄMÄ LÄHDE. Jamit-opas nojasi vain LinkedEventsiin, ja sen sisältö
// oli mitatusti kirjastoja, yhteisötaloja ja työväenopistoa (16 tapahtumaa /
// 30 pv). Openmicfinland.fi ylläpitää valtakunnallista open mic -kalenteria,
// josta pk-seudulle osuu 50 tapahtumaa / 30 pv, 23 viikoittaista sarjaa —
// ja 22 niistä puuttui oppaastamme kokonaan (Storyville Jam Night,
// O'Malley's Irish Jams, Lazy Fox Open Mic, Sörkan Ruusun jazz-sessio,
// Semifinalin Jamma Jamma Jamit…). Mitattu 16.9.2026.
//
// EI SKRAPAUSTA. Sivusto on WordPress + The Events Calendar, joka julkaisee
// virallisen REST-rajapinnan (/wp-json/tribe/events/v1/events) ja iCal-
// syötteen. robots.txt sallii. Tämä on sama luokka lähdettä kuin kaupungin
// LinkedEvents — rakenteista dataa, ei HTML:n parsimista.
//
// REILU PELI: "Lue lisää" vie HEIDÄN tapahtumasivulleen (raw.url), ei
// Facebook-linkkiin jonka he ovat kirjanneet website-kenttään. Haku
// välimuistitetaan 6 h — pieni yhteisösivusto, jota ei kuormiteta turhaan.
//
// LUOTTAMUS LÄHTEESEEN, EI TEKSTIPORTTIIN. Jokainen tapahtuma tässä
// kalenterissa on määritelmällisesti open mic tai jami. Oppaan JAMIT_REGEX
// ei tunnista näistä useimpia ("Storyville Jam Night", "Irish Jams", "Jazz
// Session", "Bluegrass Jam" — 8/12 testatusta ei osunut), joten näitä EI
// ajeta tekstiportin läpi. Kategoriat kertovat tyypin (Music Jams / Open Mic /
// Comedy / Spoken Word) ja ne käännetään omiksi kategoriatokeneiksi alla.

import type { Event } from './types'
import { decodeHtmlEntities } from './utils'

export const OPENMIC_API = 'https://www.openmicfinland.fi/wp-json/tribe/events/v1/events'
export const OPENMIC_SOURCE_URL = 'https://www.openmicfinland.fi/events/'

/** Rajapinnan tapahtuma — vain ne kentät joita käytetään. */
export interface OpenmicRaw {
  id: number
  title: string
  url: string
  description?: string
  /** "2026-09-16 15:00:00" UTC — luotettavampi kuin paikallinen start_date. */
  utc_start_date?: string
  utc_end_date?: string
  start_date?: string
  end_date?: string
  cost?: string
  image?: { url?: string } | false
  website?: string
  venue?: {
    venue?: string
    address?: string
    city?: string
    zip?: string
    geo_lat?: number | string | null
    geo_lng?: number | string | null
  } | []
  categories?: { name?: string; slug?: string }[]
}

/** Pääkaupunkiseutu. Sovellus on Helsinki-keskeinen, mutta 'espoo' on jo oma
 *  lähteensä, joten Espoon jamit kuuluvat samaan virtaan. Muu Suomi (Tampere,
 *  Turku, Lahti…) on tässä kalenterissa noin puolet — se karsitaan. */
const PK_SEUTU = new Set(['helsinki', 'espoo', 'vantaa', 'kauniainen'])

/** Lähteen kategoria → omat kategoriatokenit. Nimet ovat TÄSMÄLLISIÄ, koska
 *  luokittelija (SOURCE_CAT_VIBES) ja hero-portti (PROGRAM_CAT) lukevat niitä
 *  täsmätokeneina: 'elävä musiikki' → keikka, 'stand-up' → standup. Jami ON
 *  elävää musiikkia, joten merkintä on totuudenmukainen eikä pisteiden
 *  kalastelua. 'open mic' on aina mukana — se on tämän lähteen yhteinen
 *  nimittäjä ja oppaan hakusana. */
const KATEGORIAT: Record<string, string[]> = {
  'music jams':        ['open mic', 'jamit', 'elävä musiikki'],
  'open mic (general)': ['open mic', 'avoin lava'],
  'comedy':            ['open mic', 'stand-up'],
  'spoken word':       ['open mic', 'lavarunous'],
}

function riisuHtml(s: string): string {
  return decodeHtmlEntities(
    s.replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '),
  ).replace(/\s+/g, ' ').trim()
}

/** "Storyville Jam Night @ Helsinki" → "Storyville Jam Night", kun häntä on
 *  jokin annetuista nimistä (kaupunki tai paikka). Muu "@"-häntä säilyy:
 *  se voi olla osa nimeä. */
export function poistaPaikkaHanta(title: string, nimet: string[]): string {
  const m = /^(.*?)\s*@\s*([^@]+?)\s*$/.exec(title)
  if (!m) return title
  const hanta = m[2].trim().toLowerCase()
  return nimet.some((n) => n && n.trim().toLowerCase() === hanta) ? m[1].trim() : title
}

/** UTC-aikaleima "2026-09-16 15:00:00" → ISO. Rajapinta antaa myös paikallisen
 *  start_daten, mutta UTC on yksiselitteinen eikä riipu palvelimen vyöhykkeestä. */
function utcIso(s: string | undefined): string | null {
  if (!s) return null
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(s.trim())
  if (!m) return null
  const iso = `${m[1]}T${m[2]}Z`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

/** Katuosoite ilman kaupunkia ja postinumeroa: "Uramonkatu 9, Tampere" →
 *  "Uramonkatu 9". Sama muoto kuin muissa lähteissä (location.streetAddress). */
export function katuosoite(address: string | undefined): string {
  return (address ?? '').split(',')[0].replace(/\b\d{5}\b/g, '').replace(/\s+/g, ' ').trim()
}

/** Koordinaattitaulun avain: katuosoite + kaupunki pienellä. Kaupunki mukana,
 *  koska sama kadunnimi voi olla sekä Helsingissä että Espoossa. */
export function koordAvain(address: string | undefined, city: string | undefined): string {
  return `${katuosoite(address).toLowerCase()}|${(city ?? '').trim().toLowerCase()}`
}

export type Koordinaatit = Record<string, { lat: number; lon: number; name: string }>

/** Rajapinnan rivi → sovelluksen Event, tai null jos pk-seudun ulkopuolella
 *  tai kelvoton. PUHDAS funktio — testataan ilman verkkoa. */
export function mapOpenmicEvent(raw: OpenmicRaw, koordit: Koordinaatit = {}): Event | null {
  const venue = Array.isArray(raw.venue) ? undefined : raw.venue
  const city = (venue?.city ?? '').trim()
  if (!PK_SEUTU.has(city.toLowerCase())) return null

  const startTime = utcIso(raw.utc_start_date)
  if (!startTime) return null
  const endTime = utcIso(raw.utc_end_date)

  // Lähde liimaa otsikon perään " @ Helsinki" (kaupunki, joskus paikka).
  // Se on kortissa turhaa toistoa — paikka ja kaupunki näkyvät jo omalla
  // rivillään — ja se esti saman jamin yhdistymisen LinkedEvents-riviin
  // ("Big Band Jam" vs "Big Band Jam @ Helsinki" näkyivät kahtena, mitattu
  // 16.9.2026). Häntä poistetaan VAIN jos se on kaupunki tai paikan nimi.
  const title = poistaPaikkaHanta(
    decodeHtmlEntities(raw.title ?? '').replace(/\s+/g, ' ').trim(),
    [city, decodeHtmlEntities(venue?.venue ?? '')],
  )
  if (!title) return null

  // Kategoriat: tunnetut käännetään, tuntematon saa silti 'open mic'.
  const omat = new Set<string>(['open mic'])
  for (const c of raw.categories ?? []) {
    for (const t of KATEGORIAT[(c.name ?? '').toLowerCase().trim()] ?? []) omat.add(t)
  }

  // Koordinaatit: rajapinnan geo jos on (mitattu 0/50 — ei käytännössä),
  // muuten geokoodattu taulu (scripts/geokoodaa-openmic.ts).
  const geoLat = venue?.geo_lat != null && venue.geo_lat !== '' ? Number(venue.geo_lat) : NaN
  const geoLon = venue?.geo_lng != null && venue.geo_lng !== '' ? Number(venue.geo_lng) : NaN
  const vara = koordit[koordAvain(venue?.address, city)]
  const lat = Number.isFinite(geoLat) ? geoLat : vara?.lat
  const lon = Number.isFinite(geoLon) ? geoLon : vara?.lon

  // Hinta: rajapinta kirjoittaa "Free" tai tyhjän ilmaisille (mitattu 50/50).
  const cost = (raw.cost ?? '').trim()
  const isFree = cost === '' || /^(free|ilmainen|0|0\s*€)$/i.test(cost)

  const description = (raw.description ?? '').trim()
  const kuvaus = riisuHtml(description)
  const pvm = startTime.slice(0, 10).replace(/-/g, '')

  return {
    id: `openmic-${raw.id}-${pvm}`,
    title,
    // Lyhytkuvaus = kuvauksen alku puhtaana tekstinä. Kortit näyttävät VAIN
    // tämän eivätkä riisu HTML:ää (ks. lib/event-text), joten se on tehtävä
    // tässä. Tyhjä jos kuvausta ei ole — EI paikan nimeä placeholderiksi.
    shortDescription: kuvaus.length > 160 ? `${kuvaus.slice(0, 157).trimEnd()}…` : kuvaus,
    description,
    startTime,
    endTime,
    location: {
      name: decodeHtmlEntities(venue?.venue ?? '').trim() || city,
      streetAddress: katuosoite(venue?.address),
      city,
      ...(lat != null && lon != null ? { lat, lon } : {}),
    },
    image: raw.image && typeof raw.image === 'object' && raw.image.url ? raw.image.url : null,
    isFree,
    price: isFree ? null : cost,
    ticketUrl: null,
    // Heidän tapahtumasivunsa, EI website-kenttä (usein fb.me-linkki).
    infoUrl: raw.url || OPENMIC_SOURCE_URL,
    categories: [...omat],
    source: 'openmic',
  }
}

// ── Haku ────────────────────────────────────────────────────────────────────
const PER_PAGE = 50
const MAX_PAGES = 6               // 300 riviä: 90 pv:n hakuikkuna on mitattuna ~270 riviä koko Suomesta
const CACHE_TTL = 6 * 60 * 60 * 1000

let cache: { key: string; rows: OpenmicRaw[]; ts: number } | null = null

/** Raakarivit aikaväliltä [start, end] (YYYY-MM-DD). try/catch KOKO haun
 *  ympärillä (!res.ok ei kata verkkovirhettä) — lähteen alhaallaolo palauttaa
 *  vanhan välimuistin tai tyhjän, ei koskaan kaada kutsujaa. */
export async function fetchOpenmicRaw(start: string, end: string): Promise<OpenmicRaw[]> {
  const key = `${start}|${end}`
  if (cache && cache.key === key && Date.now() - cache.ts < CACHE_TTL) return cache.rows
  const rows: OpenmicRaw[] = []
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${OPENMIC_API}?per_page=${PER_PAGE}&page=${page}&start_date=${start}&end_date=${end}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MitaTanaanBot/1.0; +https://mitatanaan.fi)' },
        signal: AbortSignal.timeout(15000),
      })
      // Sivun yli menevä pyyntö palauttaa 400 — se on normaali loppu.
      if (!res.ok) break
      const data = (await res.json()) as { events?: OpenmicRaw[]; total_pages?: number }
      rows.push(...(data.events ?? []))
      if (!data.total_pages || page >= data.total_pages) break
    }
  } catch (err) {
    console.warn('[openmic] haku epäonnistui:', err instanceof Error ? err.message : err)
    return cache?.rows ?? []
  }
  cache = { key, rows, ts: Date.now() }
  return rows
}

/** Paikkarikastajan muoto — sama kuin lib/guide-data buildPlaceEnricher. */
export type PaikkaRikastaja = (name: string, address?: string | null) => { image: string | null; lat: number | null; lon: number | null } | null

/** Valmiit pk-seudun tapahtumat aikaväliltä: haku + muunnos + rikastus.
 *  KÄYTETÄÄN SEKÄ /api/openmic-reitistä ETTÄ jamit-oppaasta suoraan — opas
 *  ei saa hakea omaa API:aan HTTP:llä, koska laskeutumissivu (/jamit)
 *  esirenderöidään buildissa BASE-osoitteella https://mitatanaan.fi, eikä
 *  uusi reitti ole siellä vielä buildin aikana (mitattu 16.9.2026: /jamit
 *  jäi ilman openmic-rivejä). Suora kutsu toimii buildissa, ja rikastus on
 *  lisä joka saa puuttua. */
export async function haeOpenmicTapahtumat(
  start: string,
  end: string,
  koordit: Koordinaatit,
  rikasta?: PaikkaRikastaja | null,
): Promise<Event[]> {
  const raw = await fetchOpenmicRaw(start, end)
  const events: Event[] = []
  for (const r of raw) {
    const e = mapOpenmicEvent(r, koordit)
    if (!e || !e.location) continue
    const lisa = rikasta?.(e.location.name, e.location.streetAddress)
    if (lisa) {
      if (!e.image && lisa.image) e.image = lisa.image
      // Ravintoladatan koordinaatit ovat tuoreemmat kuin kertageokoodaus.
      if (lisa.lat != null && lisa.lon != null) { e.location.lat = lisa.lat; e.location.lon = lisa.lon }
    }
    events.push(e)
  }
  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  return events
}
