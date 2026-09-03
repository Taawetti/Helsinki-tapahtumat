// "Pöydät nyt" — kellonaikaan sidotut päiväpoiminnat ravintolasivulle.
//
// MIKSI. Ravintolasivu oli hakemisto: sama ruudukko aamulla, illalla ja
// ensi viikolla. Etusivu taas vastaa kysymykseen "mitä tänä iltana?" ja
// juuri siksi se toimii. Tämä moduuli tuo saman idean ravintoloihin:
// kärkeen nousee kellonaikaan sopiva, JUURI NYT AUKI oleva valikoima,
// joka vaihtuu päivittäin — syy avata sivu tänään ja taas huomenna.
//
// PERIAATTEET:
//  1. Vain auki olevia — suljettu suositus on ei-suositus.
//  2. Laatukynnys: ulkopuolinen syy (Michelin, 50 parasta, Time Out, uusi…)
//     TAI vahva näyttö (arvosana + riittävä arvostelumäärä). Sama filosofia
//     kuin lib/restaurant-reasons: kärkeen ei nosteta arvailua.
//  3. Päiväkierto on determinististä: sama päivä → sama lista (siemen
//     päivämäärästä), eri päivä → eri painotus. Ei arpaa latauksen välillä.
//  4. Monimuotoisuus: sama keittiö enintään kahdesti, sama nimi kerran —
//     kymmenen sushipaikan rivi ei ole valikoima.
//
// Puhdasta logiikkaa ilman Reactia — säännöt lukittu testeissä
// scripts/test-categories.ts.

import type { Restaurant } from './types'
import { isOpenAt, openIntervalsForDate } from './opening-hours'
import { credibilityScore } from './credibility'
import { reasonsWeight } from './restaurant-reasons'

export type PoimintaSlot = 'aamu' | 'lounas' | 'paiva' | 'ilta' | 'myohainen'

/** Poimintoja enintään — ruudukko: 2 saraketta mobiilissa, 4 työpöydällä. */
export const POIMINTOJA = 8

/** Vuorokaudenjakso Helsinki-kellosta (Date jonka lokaaligetterit ovat
 *  Helsingin aikaa, ks. helsinkiNow). Rajat valittu ruokailurytmin mukaan:
 *  lounas alkaa 10.45, päiväkahvit 14, illallinen 16.30, myöhäinen 22. */
export function slotFor(now: Date): PoimintaSlot {
  const h = now.getHours() + now.getMinutes() / 60
  if (h >= 6 && h < 10.75) return 'aamu'
  if (h >= 10.75 && h < 14) return 'lounas'
  if (h >= 14 && h < 16.5) return 'paiva'
  if (h >= 16.5 && h < 22) return 'ilta'
  return 'myohainen'
}

/** Mitkä paikkatyypit kuuluvat kuhunkin jaksoon. `taytto` otetaan mukaan
 *  vasta jos ensisijaisista ei riitä — aamulla kahvilat, ei baareja. */
const SLOT_TYPES: Record<PoimintaSlot, { ensisijaiset: Restaurant['type'][]; taytto: Restaurant['type'][] }> = {
  aamu:      { ensisijaiset: ['kahvila'], taytto: ['ravintola'] },
  lounas:    { ensisijaiset: ['ravintola'], taytto: ['kahvila'] },
  paiva:     { ensisijaiset: ['kahvila', 'ravintola'], taytto: [] },
  ilta:      { ensisijaiset: ['ravintola'], taytto: ['baari'] },
  // Yöllä baarit ja klubit ensin: klo 23.30 kysymys on "missä ilta jatkuu",
  // ei "mihin fine dining -pöytään ehtisi puoleksi tunniksi". Ravintolat
  // täydentävät (yökeittiöt kuten Fat Tony's nousevat aukiolonsa ansiosta).
  myohainen: { ensisijaiset: ['baari', 'yokerho'], taytto: ['ravintola'] },
}

/** Deterministinen 0–1-luku merkkijonosta (FNV-sekoitus + loppusekoitus).
 *  Sama syöte → sama luku kaikilla laitteilla; ei Math.randomia, jotta
 *  lista ei vaihdu sivulatausten välillä saman päivän sisällä. */
export function siemenLuku(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h = Math.imul(h ^ (h >>> 15), h | 1)
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

/** Päiväsiemen: kiertoon vaikuttaa päivä JA jakso — illan lista saa olla
 *  eri kuin saman päivän lounaslista. */
function paivaAvain(now: Date, slot: PoimintaSlot): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}|${slot}`
}

export function poimiPoydat(
  ravintolat: Restaurant[],
  now: Date,
): { slot: PoimintaSlot; poiminnat: Restaurant[] } {
  const slot = slotFor(now)
  const siemen = paivaAvain(now, slot)
  const { ensisijaiset, taytto } = SLOT_TYPES[slot]

  const kelpaa = (r: Restaurant, kevennetty: boolean): boolean => {
    if (!r.image) return false
    if (isOpenAt(r.openingHours, now) !== true) return false
    if ((r.reasons?.length ?? 0) > 0) return true
    return kevennetty
      ? (r.googleRating ?? 0) >= 4.0 && (r.reviewCount ?? 0) >= 50
      : (r.googleRating ?? 0) >= 4.3 && (r.reviewCount ?? 0) >= 80
  }

  // Pooli: ensisijaiset tyypit tiukalla kynnyksellä; täydennys muista
  // tyypeistä ja lopuksi kevennetyllä kynnyksellä, jos rivi jäisi vajaaksi
  // (esim. arkiaamu — auki olevia laatukahviloita on rajallinen määrä).
  const idt = new Set<string>()
  const pool: Restaurant[] = []
  const lisaa = (tyypit: Restaurant['type'][], kevennetty: boolean) => {
    for (const r of ravintolat) {
      if (!idt.has(r.id) && tyypit.includes(r.type) && kelpaa(r, kevennetty)) {
        idt.add(r.id)
        pool.push(r)
      }
    }
  }
  lisaa(ensisijaiset, false)
  if (pool.length < POIMINTOJA + 4) lisaa(taytto, false)
  if (pool.length < 6) lisaa([...ensisijaiset, ...taytto], true)
  // Alle neljän rivi näyttäisi tyhjältä hyllyltä — parempi ei riviä lainkaan.
  if (pool.length < 4) return { slot, poiminnat: [] }

  // Pisteytys: syypaino + uskottavuus (Wilson) + pieni päiväkohtainen
  // kierto. Kierron amplitudi 0,25 riittää vaihtamaan saman tason paikkoja
  // keskenään, muttei nosta keskinkertaista Michelinin ohi.
  //
  // SULKEUTUU PIAN -SAKKO (0,3 > kierron 0,25): puolen tunnin päästä
  // sulkeutuva paikka on heikko suositus mihin vuorokaudenaikaan tahansa —
  // klo 23.30 rivi oli pelkkiä "sulkeutuu pian" -Michelinejä, vaikka
  // tuntikausia auki olevia laatupaikkoja oli tarjolla.
  const piste = new Map<string, number>()
  for (const r of pool) {
    piste.set(
      r.id,
      (r.reasons ? reasonsWeight(r.reasons, now) : 0) +
        credibilityScore(r.googleRating, r.reviewCount) +
        siemenLuku(`${r.name}|${siemen}`) * 0.25 -
        (aukioloTieto(r.openingHours, now).pian ? 0.3 : 0),
    )
  }
  // Jakson ensisijaiset tyypit AINA ennen täydennystyyppejä: aamurivin kärki
  // on kahviloita ja yörivin baareja, vaikka täydennykseksi otetulla
  // ravintolalla olisi kovempi syypaino.
  const prio = (r: Restaurant) => (ensisijaiset.includes(r.type) ? 0 : 1)
  const jarjestys = [...pool].sort((a, b) => prio(a) - prio(b) || piste.get(b.id)! - piste.get(a.id)!)

  // Monimuotoisuus: sama keittiö enintään 2, sama nimi (ketju) kerran.
  const poiminnat: Restaurant[] = []
  const nimet = new Set<string>()
  const keittiot = new Map<string, number>()
  for (const r of jarjestys) {
    if (poiminnat.length >= POIMINTOJA) break
    const nimi = r.name.toLowerCase().trim()
    if (nimet.has(nimi)) continue
    const keittio = r.cuisineCategories[0] ?? r.type
    if ((keittiot.get(keittio) ?? 0) >= 2) continue
    poiminnat.push(r)
    nimet.add(nimi)
    keittiot.set(keittio, (keittiot.get(keittio) ?? 0) + 1)
  }
  // Jos keittiöraja jätti rivin vajaaksi, täydennetään järjestyksessä —
  // vajaa rivi on huonompi kuin kolmas sushipaikka.
  for (const r of jarjestys) {
    if (poiminnat.length >= POIMINTOJA) break
    const nimi = r.name.toLowerCase().trim()
    if (nimet.has(nimi)) continue
    poiminnat.push(r)
    nimet.add(nimi)
  }
  return { slot, poiminnat }
}

// ── Aukiolotieto korttimerkkiin ─────────────────────────────────────────────

export interface AukioloTieto {
  tila: 'auki' | 'kiinni' | 'tuntematon'
  /** auki: sulkeutumisaika "23:00" (jos tiedossa). kiinni: tämän päivän
   *  seuraava avautuminen "17:00" (jos on). */
  klo?: string
  /** auki ja sulkeutuu ≤ 45 min — "sulkeutuu pian". */
  pian?: boolean
}

function fmtKlo(h: number): string {
  // Keskiyön sulkeutuminen näytetään "24:00" (ks. getTodayHours); yön yli
  // menevä (26 → 02:00) palautetaan oikeaan vuorokaudenaikaan.
  if (h === 24) return '24:00'
  const norm = h > 24 ? h - 24 : h
  const tunnit = Math.floor(norm)
  const minuutit = Math.round((norm - tunnit) * 60)
  return `${String(tunnit).padStart(2, '0')}:${String(minuutit).padStart(2, '0')}`
}

/** Kortin aukiolomerkin tieto: auki → milloin sulkeutuu, kiinni → milloin
 *  avautuu tänään. `now` on Helsinki-kello (helsinkiNow). */
export function aukioloTieto(hours: string | null | undefined, now: Date): AukioloTieto {
  const auki = isOpenAt(hours, now)
  if (auki === undefined) return { tila: 'tuntematon' }
  const f = now.getHours() + now.getMinutes() / 60

  if (auki) {
    if (hours!.trim() === '24/7') return { tila: 'auki' }
    const ivs = openIntervalsForDate(hours, now)
    let to = ivs?.find((iv) => f >= iv.from && f < iv.to)?.to
    if (to === undefined) {
      // Aamuyö: aukiolo alkoi eilen (18:00–02:00) — eilisen ikkunan häntä.
      const eilen = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0)
      const yli = openIntervalsForDate(hours, eilen)?.find((iv) => iv.to > 24 && f + 24 >= iv.from && f + 24 < iv.to)
      if (yli) to = yli.to - 24
    }
    if (to === undefined) return { tila: 'auki' }
    const jaljella = (to > 24 ? to - 24 : to) >= f ? (to > 24 ? to - 24 : to) - f : to - f
    return { tila: 'auki', klo: fmtKlo(to), pian: jaljella <= 0.75 && jaljella >= 0 }
  }

  const seuraava = openIntervalsForDate(hours, now)?.find((iv) => iv.from > f)
  return seuraava ? { tila: 'kiinni', klo: fmtKlo(seuraava.from) } : { tila: 'kiinni' }
}
