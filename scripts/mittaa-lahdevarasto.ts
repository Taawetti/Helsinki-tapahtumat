// Lähdevaraston mittaus (lib/lahdevarasto). Ajo paikallista dev-palvelinta
// vasten (oletus http://localhost:3111) tai tuotantoa vasten (BASE=…):
//
//   npx tsx scripts/mittaa-lahdevarasto.ts rakenna   — rakentaa varaston loppuun
//                                                     (kutsuu rakennaVarasto-funktiota
//                                                     suoraan, kunnes erääntyneitä ei ole)
//   npx tsx scripts/mittaa-lahdevarasto.ts vertaa    — A/B: /api/events varastosta vs.
//                                                     ?varasto=0 (suora haku) samalle
//                                                     ikkunalle: lähteiden lkm ja id-joukot
//   npx tsx scripts/mittaa-lahdevarasto.ts tila      — varaston rivit: ikä, ok, lkm
//
// Vaatii .env.local-asetukset (Supabase service-avain) rakenna- ja tila-ajoihin.

import { rakennaVarasto, TAULU } from '../lib/lahdevarasto'
import { supabaseAdmin } from '../lib/supabase'
import type { Event, SourceStatus } from '../lib/types'

const BASE = process.env.BASE ?? 'http://localhost:3111'
const komento = process.argv[2] ?? 'tila'

interface Vastaus { events: Event[]; total: number; sources: SourceStatus[]; varasto: { kaytetty: boolean; luettu: number; puuttui: number; vanhinMin: number | null; virhe?: string } | null }

async function rakenna() {
  for (let kierros = 1; kierros <= 30; kierros++) {
    const t = await rakennaVarasto({ origin: BASE, budjettiMs: 120_000, maxHaut: 60, rinnakkain: 8 })
    console.log(`kierros ${kierros}: ok=${t.ok}${t.virhe ? ' virhe=' + t.virhe : ''} palat=${t.palat} rivit=${t.rivit} erääntyneitä=${t.eraantyneita} haettu=${t.haettu} onnistui=${t.onnistui} epäonnistui=${t.epaonnistui} vapautettu=${t.vapautettu} ${t.ms} ms`)
    if (!t.ok || t.eraantyneita === 0 || t.haettu === 0) break
  }
}

async function tila() {
  if (!supabaseAdmin) { console.log('ei supabase-asetuksia'); return }
  const { data, error } = await supabaseAdmin.from(TAULU).select('lahde, alku, lkm, ok, virhe, kesto_ms, haettu, yritetty').order('alku').order('lahde')
  if (error) { console.log('virhe', error.message); return }
  const rivit = data ?? []
  const nyt = Date.now()
  const palat = [...new Set(rivit.map((r) => r.alku as string))]
  console.log(`rivejä ${rivit.length}, paloja ${palat.length}`)
  for (const alku of palat) {
    const r = rivit.filter((x) => x.alku === alku)
    const haetut = r.filter((x) => x.haettu)
    const vanhin = haetut.length ? Math.max(...haetut.map((x) => nyt - new Date(x.haettu as string).getTime())) : null
    console.log(`${alku}: ${r.length} riviä, haettu ${haetut.length}, ok ${r.filter((x) => x.ok).length}, tapahtumia ${r.reduce((s, x) => s + (x.lkm as number), 0)}, vanhin ${vanhin === null ? '-' : Math.round(vanhin / 60000) + ' min'}, viat: ${r.filter((x) => !x.ok && x.virhe).map((x) => `${x.lahde}(${x.virhe})`).join(' ') || '-'}`)
  }
}

async function hae(params: string): Promise<{ v: Vastaus; ms: number }> {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/events?${params}`, { signal: AbortSignal.timeout(120_000) })
  const v = (await res.json()) as Vastaus
  return { v, ms: Date.now() - t0 }
}

async function vertaa() {
  const tanaan = new Date().toISOString().slice(0, 10)
  const plus = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const ikkunat = [
    ['tänään', `start=${tanaan}&end=${tanaan}&page=1&municipality=helsinki`],
    ['viikko', `start=${tanaan}&end=${plus(6)}&page=1&municipality=helsinki`],
    ['kuukausi s.1', `start=${tanaan}&end=${plus(29)}&page=1&municipality=helsinki`],
  ]
  for (const [nimi, p] of ikkunat) {
    // PERÄKKÄIN, ei rinnakkain: rinnakkain ajettuna suora haku (45 lähdekutsua)
    // kuormitti dev-palvelinta niin, että osa lähteistä aikakatkesi ja ero
    // näytti systemaattiselta (mitattu 13.10.2026: stadissa 172 vs 254).
    const b = await hae(p + '&varasto=0')
    const a = await hae(p)
    const idsA = new Set(a.v.events.map((e) => e.id)), idsB = new Set(b.v.events.map((e) => e.id))
    const vainA = [...idsA].filter((id) => !idsB.has(id)), vainB = [...idsB].filter((id) => !idsA.has(id))
    const srcA = new Map(a.v.sources.map((s) => [s.name, s])), srcB = new Map(b.v.sources.map((s) => [s.name, s]))
    const erot = [...srcA.keys()].filter((n) => (srcA.get(n)!.count !== srcB.get(n)?.count) || (srcA.get(n)!.ok !== srcB.get(n)?.ok)).map((n) => `${n}: varasto ${srcA.get(n)!.count}${srcA.get(n)!.ok ? '' : '✗'} / suora ${srcB.get(n)?.count}${srcB.get(n)?.ok ? '' : '✗'}`)
    console.log(`\n== ${nimi} ==`)
    console.log(`varasto: ${a.v.events.length} tapahtumaa, ${a.ms} ms, meta ${JSON.stringify(a.v.varasto)}`)
    console.log(`suora:   ${b.v.events.length} tapahtumaa, ${b.ms} ms, meta ${JSON.stringify(b.v.varasto)}`)
    console.log(`id-erot: vain varastossa ${vainA.length}, vain suorassa ${vainB.length}${vainA.length + vainB.length ? ' → ' + [...vainA.slice(0, 5), ...vainB.slice(0, 5)].join(', ') : ''}`)
    console.log(`lähde-erot (${erot.length}): ${erot.join(' | ') || '-'}`)
  }
}

;(komento === 'rakenna' ? rakenna() : komento === 'vertaa' ? vertaa() : tila()).catch((e) => { console.error(e); process.exit(1) })
