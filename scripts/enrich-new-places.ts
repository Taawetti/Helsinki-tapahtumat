// Rikastaa OSM:n UUDET PAIKAT (data/activity-reasons.json → newPlaces)
// Google-kortilla ja kirjoittaa data/new-places-enriched.json. Ajetaan
// viikoittain samassa GitHub Actions -jobissa, tekemisen syiden jälkeen.
//
//     npx tsx scripts/enrich-new-places.ts           # hae ja kirjoita
//     npx tsx scripts/enrich-new-places.ts --dry     # näytä, älä kirjoita
//     npx tsx scripts/enrich-new-places.ts --limit 5
//
// MIKSI. Uutta Helsingissä -sivun OSM-rivit olivat luurankoja: pelkkä nimi ja
// päivä (omistaja: sivusta "pitää saada näyttävä"). Google-kortti antaa kuvan,
// osoitteen ja arvosanan — sama palvelu ja sama kutsu jota luparekisterin
// avaukset jo käyttävät (lib/dataforseo.ts). Maksaa vain uusista: jo haetut
// säilyvät tiedostossa, kortit virkistetään 60 päivän välein ja ohilyönnit
// yritetään uudelleen 30 päivän välein.
//
// KAKSI VARTIJAA — kumpikin pakollinen, koska haku nimellä voi osua VÄÄRÄÄN
// liikkeeseen (esim. "Mansikka" on monen yrityksen nimi):
//   1. ETÄISYYS: Googlen koordinaatit enintään 500 m OSM-pisteestä. OSM-piste
//      on luotettava — se on sama merkintä josta koko rivi on peräisin.
//   2. NIMI: Googlen title ja OSM-nimi jakavat vähintään puolet sanoistaan
//      ("Yhteiskerhotila Talas, sauna" ↔ "Talas" hyväksytään).
// Vartijan hylkäämä osuma kirjataan ohilyönniksi, EI kortiksi — väärän
// yrityksen kuva olisi pahempi kuin ei kuvaa.
//
// VAATII: DATAFORSEO_TOKEN

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { lookupWithRetry, nameOverlap } from '../lib/dataforseo'
import { kotiutaKuva } from '../lib/kuvavarasto'
import type { ReasonFile, RestaurantReason } from '../lib/restaurant-reasons'

const OUT = join(process.cwd(), 'data', 'new-places-enriched.json')
const SRC = join(process.cwd(), 'data', 'activity-reasons.json')

const DRY = process.argv.includes('--dry')
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit')
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity
})()

const CONCURRENCY = 4
/** Kortti virkistetään tämän ikäisenä — kuva ja arvosana elävät. */
const REFRESH_DAYS = 60
/** Ohilyönti yritetään uudelleen tämän ikäisenä — uusi paikka voi ilmestyä
 *  Googleen viikkojen viiveellä. */
const MISS_RETRY_DAYS = 30
/** Googlen osuman on oltava näin lähellä OSM-pistettä. */
const MAX_DISTANCE_M = 500

export interface PlaceCard {
  /** Nimi OSM:ssä (rivin näyttönimi tulee yhä OSM:stä). */
  name: string
  /** Googlen oma nimi — talletetaan näytöksi vartijan päätöksestä. */
  title: string
  image: string | null
  address: string | null
  www: string | null
  phone: string | null
  category: string | null
  rating: number | null
  reviewCount: number | null
  lat: number | null
  lon: number | null
  fetchedAt: string
}

export interface EnrichedFile {
  fetchedAt: string
  /** Avain = OSM-osoite (https://www.openstreetmap.org/node/…) — vakaa. */
  cards: Record<string, PlaceCard>
  misses: { url: string; name: string; at: string; reason: string }[]
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function loadPrevious(): EnrichedFile {
  if (!existsSync(OUT)) return { fetchedAt: '', cards: {}, misses: [] }
  try {
    const f = JSON.parse(readFileSync(OUT, 'utf8')) as EnrichedFile
    return { fetchedAt: f.fetchedAt ?? '', cards: f.cards ?? {}, misses: f.misses ?? [] }
  } catch {
    return { fetchedAt: '', cards: {}, misses: [] }
  }
}

async function main() {
  const reasonFile = JSON.parse(readFileSync(SRC, 'utf8')) as ReasonFile
  const places = (reasonFile.newPlaces ?? []).filter((p) => p.venue && p.url)
  console.log(`  OSM:n uusia paikkoja: ${places.length}`)

  const prev = loadPrevious()
  const now = new Date()
  const nowIso = now.toISOString()
  const freshLimit = new Date(now.getTime() - REFRESH_DAYS * 86_400_000).toISOString()
  const missLimit = new Date(now.getTime() - MISS_RETRY_DAYS * 86_400_000).toISOString()
  const missAt = new Map(prev.misses.map((m) => [m.url, m.at]))

  // Sama paikka voi olla listassa kahdesti (solmu + alue) — käsitellään kerran.
  const seen = new Set<string>()
  const todo: RestaurantReason[] = []
  for (const p of places) {
    if (seen.has(p.url!)) continue
    seen.add(p.url!)
    const card = prev.cards[p.url!]
    if (card && card.fetchedAt > freshLimit) continue        // tuore kortti
    const missedAt = missAt.get(p.url!)
    if (missedAt && missedAt > missLimit) continue           // äskettäin ohi
    todo.push(p)
  }
  console.log(`  haettavia (uudet + virkistettävät + uusintayritykset): ${todo.length}`)

  const cards: Record<string, PlaceCard> = { ...prev.cards }
  const misses: EnrichedFile['misses'] = prev.misses.filter((m) => !todo.some((t) => t.url === m.url))
  let done = 0
  let hits = 0
  const queue = todo.slice(0, LIMIT)

  async function worker() {
    for (;;) {
      const p = queue.shift()
      if (!p) return
      const biz = await lookupWithRetry(p.venue!)
      done++
      if (biz === null) {
        // tekninen virhe: ei kortiksi eikä ohilyönniksi — yritetään ensi ajolla
        console.log(`  ~ ${p.venue}: tekninen virhe, ohitetaan tällä ajolla`)
        continue
      }
      if (!biz.found) {
        misses.push({ url: p.url!, name: p.venue!, at: nowIso, reason: 'ei googlessa' })
        continue
      }
      // VARTIJA 1: etäisyys. Ilman kumman tahansa koordinaatteja ei hyväksytä —
      // pelkkä nimiosuma voi olla väärä yritys toisella puolella kaupunkia.
      if (typeof p.lat !== 'number' || typeof p.lon !== 'number' ||
          typeof biz.lat !== 'number' || typeof biz.lon !== 'number') {
        misses.push({ url: p.url!, name: p.venue!, at: nowIso, reason: 'ei koordinaatteja' })
        continue
      }
      const dist = haversineM(p.lat, p.lon, biz.lat, biz.lon)
      if (dist > MAX_DISTANCE_M) {
        misses.push({ url: p.url!, name: p.venue!, at: nowIso, reason: `väärä sijainti (${Math.round(dist)} m)` })
        continue
      }
      // VARTIJA 2: nimi.
      const overlap = nameOverlap(p.venue!, biz.title ?? '')
      if (overlap < 0.5) {
        misses.push({ url: p.url!, name: p.venue!, at: nowIso, reason: `eri nimi ("${biz.title ?? ''}")` })
        continue
      }
      cards[p.url!] = {
        name: p.venue!,
        title: biz.title ?? p.venue!,
        // Kuva heti omaan varastoon (lib/kuvavarasto); epäonnistuessa lainalinkki.
        image: biz.image ? (await kotiutaKuva(p.venue!.toLowerCase().trim(), biz.image)) ?? biz.image : null,
        address: biz.address ?? null,
        www: biz.www,
        phone: biz.phone,
        category: biz.category,
        rating: biz.rating,
        reviewCount: biz.reviewCount,
        lat: biz.lat,
        lon: biz.lon,
        fetchedAt: nowIso,
      }
      hits++
      console.log(`  ✓ ${p.venue} → "${biz.title}" (${Math.round(dist)} m, ★${biz.rating ?? '–'}/${biz.reviewCount ?? 0}${biz.image ? ', kuva' : ''})`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`  valmis: ${done} hakua, ${hits} korttia, ${misses.length} ohilyöntiä kirjattuna`)

  // ROMAHDUSVAHTI: jos syötettä oli kunnolla mutta kortteja ei kertynyt
  // lainkaan, palvelu oli nurin — vanha tiedosto on parempi kuin tyhjennetty.
  if (places.length >= 10 && Object.keys(cards).length < 5) {
    console.error('  EI KIRJOITETA — alle 5 korttia viittaa palveluvikaan')
    process.exit(1)
  }

  if (DRY) { console.log('  --dry: ei kirjoiteta'); return }
  const file: EnrichedFile = { fetchedAt: nowIso, cards, misses }
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
  console.log(`  kirjoitettu ${OUT} (${Object.keys(cards).length} korttia)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
