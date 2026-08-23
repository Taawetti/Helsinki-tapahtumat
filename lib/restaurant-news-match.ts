// Yhdistää ravintolauutiset ravintoloihin: otsikko → paikka.
//
// MIKSI. Uutinen on syy jota emme keksi itse: TOIMITTAJA päätti kirjoittaa
// paikasta — avajaiset, tarjous, erikoisillallinen, isänpäivälounas. Se on
// aitoa kuratointia ja tuoretta, ja omistajan sanoin "tuo vaihtuvuutta ja
// asiakas näkee ravintolan jossa on jokin tapahtuma, tarjous". Osuma näkyy
// paikan kortissa ja nostaa sen kärkeen niin kauan kuin juttu on tuore.
//
// NIMIOSUMA ON VAARALLINEN, koska kone erehtyy uskottavasti: "Teller" osuisi
// sanaan "bestseller" ja "Olo" lähes mihin tahansa. Alla olevat vartijat ovat
// siksi tiukkoja, ja mieluummin pudotetaan oikea osuma kuin näytetään väärä.

import type { RestaurantReason } from './restaurant-reasons'

/** Lyhyet nimet ovat tavallisia sanoja. Mitattu: Olo (3) ja Muru (4) osuisivat
 *  jatkuvasti; Palace, Teller, Figaro ja Pumpui (6) ovat jo turvallisia. */
const MIN_NAME_CHARS = 6

/** Yleissanat jotka sattuvat olemaan myös ravintoloiden nimiä. Näitä ei
 *  koskaan käytetä osumaan, koska ne esiintyvät joka toisessa otsikossa. */
const GENERIC_NAMES = new Set([
  'ravintola', 'kahvila', 'baari', 'pizzeria', 'bistro', 'konditoria', 'grilli',
  'lounas', 'kioski', 'terassi', 'sushi', 'buffet', 'pub', 'cafe', 'kafe',
  'ravintolat', 'kahvilat', 'burger', 'pizza', 'kebab', 'lounasravintola',
  'olohuone', 'keittio', 'ruokala', 'kellari', 'sali', 'kulma', 'torppa',
])

export interface NewsLike {
  title: string
  link: string
  source: string
  pubDate: string
}

export interface RestaurantLike {
  id: string
  name: string
}

export interface NewsMatch {
  restaurantId: string
  /** Tuorein otsikko — kortilla näytetään tämä. */
  headline: string
  link: string
  source: string
  pubDate: string
  /** Montako juttua tästä paikasta löytyi. Useampi = enemmän puhetta. */
  articleCount: number
}

/** Normalisointi joka SÄILYTTÄÄ sanarajat: välimerkit muuttuvat välilyönneiksi,
 *  jotta "Fat Tony's" ja "Fat Tonys" osuvat toisiinsa mutta "Teller" ei osu
 *  sanaan "bestseller". */
function norm(s: string): string {
  return s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchNewsToRestaurants(
  news: NewsLike[],
  restaurants: RestaurantLike[],
): NewsMatch[] {
  if (!Array.isArray(news) || !Array.isArray(restaurants)) return []

  // Toimipisteiden määrä nimeä kohti → ketjut pois. Otsikko ei kerro MIKÄ
  // toimipiste on kyseessä, joten ketjuosuma olisi arvaus. Mitattu:
  // Bastard Burgers 2 toimipistettä ja Fazer Café 11 → molemmat pois; kaikki
  // kiinnostavat yksittäiset (Rogue Rouge, Pumpui, Figaro…) läpäisevät.
  const outlets = new Map<string, number>()
  for (const r of restaurants) {
    const k = norm(r?.name ?? '')
    if (k) outlets.set(k, (outlets.get(k) ?? 0) + 1)
  }

  const candidates: { key: string; r: RestaurantLike }[] = []
  const takenKeys = new Set<string>()
  for (const r of restaurants) {
    const key = norm(r?.name ?? '')
    if (!key || takenKeys.has(key)) continue
    if (key.replace(/\s/g, '').length < MIN_NAME_CHARS) continue
    if (GENERIC_NAMES.has(key)) continue
    if ((outlets.get(key) ?? 0) !== 1) continue
    takenKeys.add(key)
    candidates.push({ key, r })
  }
  // Pisin nimi ensin: jos sekä "Palace" että "Ravintola Palace" ovat listalla,
  // tarkempi voittaa eikä lyhyempi kaappaa osumaa.
  candidates.sort((a, b) => b.key.length - a.key.length)

  const byRestaurant = new Map<string, { r: RestaurantLike; arts: NewsLike[] }>()
  for (const item of news) {
    const title = typeof item?.title === 'string' ? item.title : ''
    if (!title) continue
    const hay = ` ${norm(title)} `
    for (const c of candidates) {
      if (!hay.includes(` ${c.key} `)) continue
      const e = byRestaurant.get(c.r.id) ?? { r: c.r, arts: [] }
      e.arts.push(item)
      byRestaurant.set(c.r.id, e)
      break // yksi osuma per otsikko — tarkin nimi voitti jo järjestyksessä
    }
  }

  const ts = (d: string) => { const t = Date.parse(d); return Number.isNaN(t) ? 0 : t }
  const out: NewsMatch[] = []
  for (const { r, arts } of byRestaurant.values()) {
    const sorted = [...arts].sort((a, b) => ts(b.pubDate) - ts(a.pubDate))
    const newest = sorted[0]
    out.push({
      restaurantId: r.id,
      headline: newest.title,
      link: newest.link,
      source: newest.source,
      pubDate: newest.pubDate,
      articleCount: arts.length,
    })
  }
  // Tuorein ensin; tasatilanteessa se josta on kirjoitettu eniten.
  return out.sort((a, b) => ts(b.pubDate) - ts(a.pubDate) || b.articleCount - a.articleCount)
}

// ── OSUMA → SYY ─────────────────────────────────────────────────────────────

/** Kuinka kauan uutinen nostaa korttia. Tarjoukset ja erikoisillalliset ovat
 *  ajankohtaisia — kahden viikon takainen juttu ei enää auta päätöstä. */
export const NEWS_MAX_AGE_DAYS = 14

/**
 * Osuma → kortin syy, tai null jos juttu on jo liian vanha. Otsikko kulkee
 * `note`-kentässä ja kortti näyttää sen omana rivinään; merkissä lukee vain
 * lähde, koska kokonainen otsikko ei mahdu pilleriin.
 */
export function toNewsReason(match: NewsMatch, today: Date): RestaurantReason | null {
  const t = Date.parse(match.pubDate)
  if (Number.isNaN(t)) return null
  const ageDays = (today.getTime() - t) / 86_400_000
  if (ageDays > NEWS_MAX_AGE_DAYS || ageDays < -1) return null
  return {
    kind: 'uutinen',
    label: `Uutisissa · ${match.source || 'lehdistö'}`,
    source: match.source || 'lehdistö',
    url: match.link,
    date: new Date(t).toISOString().slice(0, 10),
    note: match.headline,
  }
}
