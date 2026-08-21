// SANASTON GENEROINTI auditointia varten (scripts/audit-compounds.ts).
//
// fixtures/vocab-helsinki.json on tilannekuva siitä sanastosta jota Helsingin
// tapahtumalähteet oikeasti käyttävät. Auditointi vertaa VIBES-avainsanoja
// siihen: jos avainsana osuu jonkin sanan SISÄÄN ilman hyväksyntää, build
// kaatuu. Sanaston on siis pysyttävä tuoreena — uusi lähde tuo uutta sanastoa,
// ja tuntematon sana on tuntematon miina.
//
// Aja:  npx tsx scripts/build-vocab.ts                    (hakee tuotannosta)
//       npx tsx scripts/build-vocab.ts a.json b.json      (paikallisista JSONeista)
//
// UNIONI: uudet tokenit lisätään, vanhoja ei koskaan poisteta — päivitys ei voi
// vahingossa kapeuttaa auditoinnin kattavuutta (ja siten avata miinaa).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const OUT = 'fixtures/vocab-helsinki.json'
const BASE = process.env.VOCAB_BASE_URL || 'https://helsinki-tapahtumat.vercel.app'
const MIN_LEN = 4 // lyhyempi token ei voi kantaa yhdyssanamiinaa

type Ev = { title?: string; shortDescription?: string; categories?: string[] }

function tokenize(text: string): string[] {
  const n = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return n ? n.split(' ') : []
}

async function collect(): Promise<Ev[]> {
  const files = process.argv.slice(2)
  if (files.length > 0) {
    const out: Ev[] = []
    for (const f of files) out.push(...(JSON.parse(readFileSync(f, 'utf8')).events ?? []))
    return out
  }
  // Neljä aikaväliä → kausivaihtelu mukaan (kesäfestarit vs talven sisätapahtumat)
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const ranges = [0, 30, 60, 90].map((offset) => {
    const s = new Date(today.getTime() + offset * 86400000)
    const e = new Date(s.getTime() + 9 * 86400000)
    return { start: iso(s), end: iso(e) }
  })
  const out: Ev[] = []
  for (const { start, end } of ranges) {
    const url = `${BASE}/api/events?start=${start}&end=${end}&page=1&municipality=helsinki`
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180000) })
      if (!r.ok) { console.warn(`  ohitettu ${start}: HTTP ${r.status}`); continue }
      const j = await r.json()
      out.push(...(j.events ?? []))
      console.log(`  ${start}..${end}: ${(j.events ?? []).length} tapahtumaa`)
    } catch (err) {
      console.warn(`  ohitettu ${start}: ${(err as Error).message}`)
    }
  }
  return out
}

const events = await collect()
if (events.length === 0) { console.error('Ei tapahtumia — sanastoa ei päivitetty.'); process.exit(1) }

const existing: Record<string, string> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
const merged: Record<string, string> = { ...existing }
let added = 0
for (const e of events) {
  const text = [e.title ?? '', e.shortDescription ?? '', ...(e.categories ?? [])].join(' ')
  for (const t of tokenize(text)) {
    if (t.length < MIN_LEN || merged[t]) continue
    merged[t] = (e.title ?? '').slice(0, 70)
    added++
  }
}
const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]))
writeFileSync(OUT, JSON.stringify(sorted, null, 0) + '\n')
console.log(`Sanasto: ${Object.keys(existing).length} → ${Object.keys(sorted).length} tokenia (+${added} uutta, ${events.length} tapahtumasta)`)
console.log('Aja seuraavaksi: npm run audit:compounds  — uudet sanat voivat paljastaa hyväksymättömiä osumia.')
