// Kohderyhmämittaus tuotantodataa vasten — toistettava tarkistus sille, mitä
// lib/audience ja lib/venue-blocklist tekevät oikeille tapahtumille.
//
//     TZ=UTC npx tsx scripts/mittaa-kohderyhma.ts            (30 pv tästä päivästä)
//     TZ=UTC npx tsx scripts/mittaa-kohderyhma.ts 2026-10-01 14   (alkupäivä, päiviä)
//
// Tulostaa: (1) paljonko kooste sisältää estettyjen paikkatyyppien
// tapahtumia (deployn jälkeen 0), (2) paljonko suosituksista putoaa ja mistä
// syystä, (3) HEIKON lapsisignaalin tapahtumat, jotka jäävät suosituksiin
// (yleisötagi "lapsiperheet/perheet/nuoret" ilman lapsille tehty -signaalia)
// — juuri tämä lista kannattaa lukea silmällä, kun sääntöä muutetaan tai
// lähde muuttaa tagejaan, (4) otos vahvan signaalin tapahtumista, joilla
// signaali tulee vain kategoriasta tai ysosta (ei otsikosta).
//
// Testit (scripts/test-categories.ts) lukitsevat säännön KOODIN; tämä
// skripti näyttää, mitä sääntö tekee tämän hetken DATALLE. Kumpaakin tarvitaan.
import { isOutsideTargetAudience, lapsiSignaali, TOUR_TITLE_REGEX } from '../lib/audience'
import { onEstettyPaikka } from '../lib/venue-blocklist'
import { getEventVibes } from '../lib/event-classify'
import type { Event } from '../lib/types'

const BASE = process.env.BASE ?? 'https://mitatanaan.fi'

async function hae(start: string, end: string): Promise<Event[]> {
  const kaikki: Event[] = []
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${BASE}/api/events?start=${start}&end=${end}&page=${page}&municipality=helsinki`).then((x) => x.json() as Promise<{ events?: Event[] }>)
    if (!r.events?.length) break
    kaikki.push(...r.events)
  }
  return [...new Map(kaikki.map((e) => [e.id, e])).values()]
}

function ryhma<T>(lista: T[], avain: (t: T) => string, k = 12): string {
  const c = new Map<string, number>()
  for (const t of lista) c.set(avain(t), (c.get(avain(t)) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([a, b]) => `${a} ${b}`).join(' | ')
}

;(async () => {
  const alku = process.argv[2] ?? new Date().toISOString().slice(0, 10)
  const paivia = Number(process.argv[3] ?? 30)
  const loppu = new Date(Date.parse(alku) + paivia * 86400000).toISOString().slice(0, 10)
  const evs = (await hae(alku, loppu)).map((e) => ({ ...e, vibes: e.vibes ?? getEventVibes(e) }))
  console.log(`Ikkuna ${alku}–${loppu}: ${evs.length} tapahtumaa`)

  const estetyt = evs.filter((e) => onEstettyPaikka(e))
  console.log(`\n1) Estettyjen paikkatyyppien tapahtumia koosteessa: ${estetyt.length} (deployn jälkeen 0)`)
  if (estetyt.length) console.log('   paikoittain:', ryhma(estetyt, (e) => e.location?.name ?? '-', 8))

  const ulkona = evs.filter((e) => isOutsideTargetAudience(e))
  const syy = (e: Event) => TOUR_TITLE_REGEX.test(e.title) ? 'kierros' : lapsiSignaali(e) === 'vahva' ? 'lapset/nuoret' : 'seniorit/kerhot/yhteisötalot'
  console.log(`\n2) Suosituksista putoaa: ${ulkona.length} / ${evs.length} (${(ulkona.length / evs.length * 100).toFixed(1)} %) —`, ryhma(ulkona, syy, 4))

  const heikot = evs.filter((e) => !isOutsideTargetAudience(e) && lapsiSignaali(e) === 'heikko')
  console.log(`\n3) HEIKKO lapsisignaali, jää suosituksiin ("sopii myös perheille"): ${heikot.length} riviä`)
  console.log('   paikoittain:', ryhma(heikot, (e) => e.location?.name || '(ei paikkaa)', 8))
  const nahdyt = new Set<string>()
  for (const e of heikot) {
    const k = e.title.slice(0, 50); if (nahdyt.has(k)) continue; nahdyt.add(k)
    console.log(`   - ${k.padEnd(50)} @ ${(e.location?.name ?? '-').slice(0, 24).padEnd(24)} kat: ${e.categories.join(', ').slice(0, 60)}`)
  }
  console.log(`   (${nahdyt.size} eri otsikkoa)`)

  const vainRakenne = ulkona.filter((e) => lapsiSignaali(e) === 'vahva' && lapsiSignaali({ ...e, categories: [], ysoIds: [] }) !== 'vahva')
  console.log(`\n4) VAHVA signaali vain kategoriasta/ysosta (otsikko ei kerro lapsista): ${vainRakenne.length} riviä, otos:`)
  const n2 = new Set<string>()
  for (const e of vainRakenne) {
    const k = e.title.slice(0, 50); if (n2.has(k)) continue; n2.add(k); if (n2.size > 10) break
    console.log(`   - ${k.padEnd(50)} @ ${(e.location?.name ?? '-').slice(0, 24).padEnd(24)} kat: ${e.categories.join(', ').slice(0, 50)} yso: ${(e.ysoIds ?? []).join(',').slice(0, 40)}`)
  }
})()
