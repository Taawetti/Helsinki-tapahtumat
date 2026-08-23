// DataForSEO: yhden paikan Google-kortti (kuva, osoite, arvosana, aukiolot).
// Jaettu kirjasto — käyttäjät: scripts/fetch-new-openings.ts (luparekisterin
// avaukset) ja scripts/enrich-new-places.ts (OSM:n uudet paikat).
//
// Siirretty scripts/fetch-new-openings.ts:stä SELLAISENAAN 25.8.2026 —
// logiikka on tuotannossa todennettu, älä muuta ilman mittausta.
//
// VAATII: DATAFORSEO_TOKEN (base64 "login:password").

export interface Business {
  found: boolean
  /** Googlen oma nimi paikalle — nimivartijaa varten (osuiko haku oikeaan). */
  title?: string
  address?: string
  city?: string
  lat?: number
  lon?: number
  image: string | null
  www: string | null
  phone: string | null
  category: string | null
  categories: string[]
  workTime?: unknown
  priceLevel: string | null
  rating: number | null
  reviewCount: number | null
}

/**
 * "Ei hakutuloksia" (40102) EI OLE LUOTETTAVA VASTAUS. Mitattu: Weckström
 * Roastery, Omu Raisu ja Shanghai Taste palauttivat 40102 erässä, mutta
 * TÄSMÄLLEEN sama hakusana löysi ne heti perään. Palvelu on skrape, ja skrape
 * epäonnistuu välillä hiljaa. Jos tyhjä vastaus uskottaisiin, paikkoja katoaisi
 * satunnaisesti — juuri se vika jota tässä projektissa vältetään kaikkein
 * eniten. Siksi tyhjä yritetään uudelleen, ja vasta kolme peräkkäistä tyhjää
 * kirjataan osumattomaksi.
 */
export const EMPTY_RETRIES = 3
const RETRY_PAUSE_MS = 1500

export async function lookupWithRetry(query: string): Promise<Business | null> {
  let last: Business | null = null
  for (let i = 0; i < EMPTY_RETRIES; i++) {
    const r = await lookup(query)
    if (r === null) return null            // tekninen virhe → ei kirjata mitään
    if (r.found) return r
    last = r
    if (i < EMPTY_RETRIES - 1) await new Promise((s) => setTimeout(s, RETRY_PAUSE_MS))
  }
  return last
}

/** null = tekninen virhe (yritetään uudelleen). `found:false` = ei Googlessa. */
export async function lookup(query: string): Promise<Business | null> {
  const token = process.env.DATAFORSEO_TOKEN
  if (!token) throw new Error('DATAFORSEO_TOKEN puuttuu')
  let data: {
    tasks?: { status_code?: number; result?: { items?: Record<string, unknown>[] }[] }[]
  }
  const empty = {
    found: false, image: null, www: null, phone: null, category: null,
    categories: [], priceLevel: null, rating: null, reviewCount: null,
  }
  try {
    const res = await fetch(
      'https://api.dataforseo.com/v3/business_data/google/my_business_info/live',
      {
        method: 'POST',
        headers: { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          keyword: query,
          location_name: 'Helsinki,Helsinki,Uusimaa,Finland',
          language_name: 'Finnish',
        }]),
        signal: AbortSignal.timeout(60_000),   // mitattu ~25 s onnistuessaankin
      },
    )
    if (!res.ok) return null
    data = await res.json()
  } catch {
    return null
  }
  const task = data?.tasks?.[0]
  if (!task) return null
  if (task.status_code === 40102) return empty        // "No Search Results"
  if (task.status_code !== 20000) return null

  const item = task.result?.[0]?.items?.[0] as Record<string, unknown> | undefined
  if (!item) return empty

  const info = item.address_info as { city?: string } | undefined
  const cats: string[] = []
  if (typeof item.category === 'string') cats.push(item.category)
  if (Array.isArray(item.additional_categories)) cats.push(...(item.additional_categories as string[]))

  return {
    found: true,
    title: typeof item.title === 'string' ? item.title : undefined,
    address: typeof item.address === 'string' ? item.address : undefined,
    city: info?.city,
    lat: typeof item.latitude === 'number' ? item.latitude : undefined,
    lon: typeof item.longitude === 'number' ? item.longitude : undefined,
    image: typeof item.main_image === 'string' ? item.main_image : null,
    www: typeof item.url === 'string' ? item.url : null,
    phone: typeof item.phone === 'string' ? item.phone : null,
    category: typeof item.category === 'string' ? item.category : null,
    categories: cats,
    workTime: item.work_time,
    priceLevel: typeof item.price_level === 'string' ? item.price_level : null,
    rating: (item.rating as { value?: number } | undefined)?.value ?? null,
    reviewCount: (item.rating as { votes_count?: number } | undefined)?.votes_count ?? null,
  }
}

/** Sanatason nimivertailu hakuosuman vartijaksi: osuus yhteisiä sanoja
 *  lyhyemmän nimen sanoista. Diakriitit riisutaan ja alle 3 merkin sanat
 *  ohitetaan. "Yhteiskerhotila Talas, sauna" ↔ "Talas" → 1,0.
 *
 *  Pitkille sanoille (≥5 merkkiä) sallitaan YHDEN muokkauksen ero — sama
 *  toleranssi kuin katunimissä (sameStreet). Mitattu: OSM:n "Walhala" ja
 *  Googlen "Ravintola Walhalla" ovat sama paikka, ja hylkäys esti kortin
 *  jonka arvostelumäärä olisi paljastanut paikan vanhaksi. */
export function nameOverlap(a: string, b: string): number {
  const tok = (s: string) =>
    [...new Set(
      s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3),
    )]
  const ta = tok(a), tb = tok(b)
  if (!ta.length || !tb.length) return 0
  let shared = 0
  for (const w of ta) {
    if (tb.some((x) => x === w || (w.length >= 5 && x.length >= 5 && withinOneEdit(w, x)))) shared++
  }
  return shared / Math.min(ta.length, tb.length)
}

/** Ovatko sanat enintään yhden lisäyksen/poiston/vaihdon päässä toisistaan. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  let i = 0, j = 0, edits = 0
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (short.length === long.length) { i++; j++ }   // vaihto
    else j++                                          // lisäys pidempään
  }
  return edits + (long.length - j) <= 1
}
