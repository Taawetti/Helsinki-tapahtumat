// Hakee YLEISTEN SAUNOJEN Google-kortit (kuva, osoite, hinta, arvosana) ja
// kirjoittaa data/sauna-cards.json. Ajetaan viikoittain samassa GitHub
// Actions -jobissa kuin muutkin rikastukset.
//
//     npx tsx scripts/fetch-sauna-cards.ts           # hae ja kirjoita
//     npx tsx scripts/fetch-sauna-cards.ts --dry     # näytä, älä kirjoita
//
// MIKSI. /saunat-sivu on saunakulttuurin referenssi (omistajan linjaus:
// saunat ovat se osa tekemistä-dataa, jolle ei ole hyvää paikkaa netissä),
// mutta OSM-datassa vain 5/41 saunalla oli kuva. Sama DataForSEO-kutsu ja
// samat vartijat kuin scripts/enrich-new-places.ts:ssä:
//   1. ETÄISYYS ≤ 500 m OSM-pisteestä (haku nimellä voi osua väärään
//      yritykseen — OSM-piste on luotettava)
//   2. NIMIVASTAAVUUS (nameOverlap ≥ 0.5, yhden muokkauksen toleranssi)
// Maksaa vain uusista: jo haetut säilyvät, kortit virkistetään 60 pv välein.
//
// VAATII: DATAFORSEO_TOKEN. Saunalista luetaan tuotannon /api/activities-
// vastauksesta (tai ACTIVITIES_URL-ympäristömuuttujasta).

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { lookupWithRetry, nameOverlap } from '../lib/dataforseo'

const OUT = join(process.cwd(), 'data', 'sauna-cards.json')
const ACTIVITIES_URL = process.env.ACTIVITIES_URL || 'https://helsinki-tapahtumat.vercel.app/api/activities'

const DRY = process.argv.includes('--dry')
const CONCURRENCY = 4
const REFRESH_DAYS = 60
const MISS_RETRY_DAYS = 30
const MAX_DISTANCE_M = 500

export interface SaunaCard {
  /** Avain: saunan nimi pienaakkosin (sama kuin /api/activities-nimi). */
  name: string
  title: string
  image: string | null
  address: string | null
  www: string | null
  phone: string | null
  priceLevel: string | null
  rating: number | null
  reviewCount: number | null
  fetchedAt: string
}

export interface SaunaCardFile {
  fetchedAt: string
  cards: Record<string, SaunaCard>
  misses: { name: string; at: string; reason: string }[]
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function loadPrevious(): SaunaCardFile {
  if (!existsSync(OUT)) return { fetchedAt: '', cards: {}, misses: [] }
  try {
    const f = JSON.parse(readFileSync(OUT, 'utf8')) as SaunaCardFile
    return { fetchedAt: f.fetchedAt ?? '', cards: f.cards ?? {}, misses: f.misses ?? [] }
  } catch {
    return { fetchedAt: '', cards: {}, misses: [] }
  }
}

async function main() {
  console.log(`  saunalista: ${ACTIVITIES_URL}`)
  const res = await fetch(ACTIVITIES_URL, { signal: AbortSignal.timeout(240_000) })
  if (!res.ok) throw new Error(`aktiviteetit: HTTP ${res.status}`)
  const data = await res.json() as { activities?: { name: string; category: string; lat?: number; lon?: number }[] }
  const saunas = (data.activities ?? []).filter((a) => a.category === 'sauna' && typeof a.lat === 'number' && typeof a.lon === 'number')
  console.log(`  saunoja: ${saunas.length}`)
  if (saunas.length < 10) throw new Error('epäilyttävän vähän saunoja — ei haeta')

  const prev = loadPrevious()
  const now = new Date()
  const nowIso = now.toISOString()
  const freshLimit = new Date(now.getTime() - REFRESH_DAYS * 86_400_000).toISOString()
  const missLimit = new Date(now.getTime() - MISS_RETRY_DAYS * 86_400_000).toISOString()
  const missAt = new Map(prev.misses.map((m) => [m.name, m.at]))

  const seen = new Set<string>()
  const todo: typeof saunas = []
  for (const s of saunas) {
    const key = s.name.toLowerCase().trim()
    if (seen.has(key)) continue
    seen.add(key)
    const card = prev.cards[key]
    if (card && card.fetchedAt > freshLimit) continue
    const missedAt = missAt.get(key)
    if (missedAt && missedAt > missLimit) continue
    todo.push(s)
  }
  console.log(`  haettavia: ${todo.length}`)

  const cards: Record<string, SaunaCard> = { ...prev.cards }
  const misses: SaunaCardFile['misses'] = prev.misses.filter((m) => !todo.some((t) => t.name.toLowerCase().trim() === m.name))
  let hits = 0
  const queue = [...todo]

  async function worker() {
    for (;;) {
      const s = queue.shift()
      if (!s) return
      const key = s.name.toLowerCase().trim()
      const biz = await lookupWithRetry(s.name)
      if (biz === null) { console.log(`  ~ ${s.name}: tekninen virhe, ohitetaan`); continue }
      if (!biz.found) { misses.push({ name: key, at: nowIso, reason: 'ei googlessa' }); continue }
      if (typeof biz.lat !== 'number' || typeof biz.lon !== 'number') {
        misses.push({ name: key, at: nowIso, reason: 'ei koordinaatteja' }); continue
      }
      const dist = haversineM(s.lat!, s.lon!, biz.lat, biz.lon)
      if (dist > MAX_DISTANCE_M) {
        misses.push({ name: key, at: nowIso, reason: `väärä sijainti (${Math.round(dist)} m)` }); continue
      }
      if (nameOverlap(s.name, biz.title ?? '') < 0.5) {
        misses.push({ name: key, at: nowIso, reason: `eri nimi ("${biz.title ?? ''}")` }); continue
      }
      cards[key] = {
        name: s.name,
        title: biz.title ?? s.name,
        image: biz.image,
        address: biz.address ?? null,
        www: biz.www,
        phone: biz.phone,
        priceLevel: biz.priceLevel,
        rating: biz.rating,
        reviewCount: biz.reviewCount,
        fetchedAt: nowIso,
      }
      hits++
      console.log(`  ✓ ${s.name} → "${biz.title}" (${Math.round(dist)} m${biz.image ? ', kuva' : ''})`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`  valmis: ${hits} uutta/virkistettyä korttia, ${misses.length} ohilyöntiä`)

  // ROMAHDUSVAHTI: jos kortteja ei kerry lainkaan, palvelu oli nurin.
  if (Object.keys(cards).length < 5) {
    console.error('  EI KIRJOITETA — alle 5 korttia viittaa palveluvikaan')
    process.exit(1)
  }

  if (DRY) { console.log('  --dry: ei kirjoiteta'); return }
  const file: SaunaCardFile = { fetchedAt: nowIso, cards, misses }
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
  console.log(`  kirjoitettu ${OUT} (${Object.keys(cards).length} korttia)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
