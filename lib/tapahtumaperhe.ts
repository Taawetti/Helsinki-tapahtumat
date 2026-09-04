// Tapahtumaperheet: saman tapahtuman eri riviversiot eri lähteistä.
//
// MIKSI (mitattu 4.9.2026): Helsinki Nerdlesque Festival oli datassa NELJÄNÄ
// rivinä — Korjaamon skrape ("SOLD OUT: Helsinki Nerdlesque Festival"),
// stadissa ("Helsinki Nerdlesque Festival") ja lippu.fi:n kaksi lipputyyppiä
// ("… K-18 - 1PV PERJANTAI" ja "… K-18 - 2PV PE-LA"). Yleinen kaksoispoisto
// ei tunnista näitä samaksi, koska otsikot eroavat — ja heron viidestä
// nostosta useampi oli sama festivaali.
//
// Perhesääntö: SAMA PAIKKA + SAMA HELSINKI-PÄIVÄ + otsikoiden sanapäällekkäisyys
// ≥ 60 % lyhyemmän otsikon sanoista. Lipputyyppihännät ("2PV PE-LA") ja
// etuliitteet ("SOLD OUT:") eivät riko osumaa, mutta saman paikan kaksi eri
// konserttia (esim. "HKO - Sibelius" vs "HKO - Mahler") eivät yhdisty, koska
// yhteisiä sanoja on liian vähän.
//
// Tätä käytetään NÄYTTÖKERROKSESSA (hero + poimintaruudukko) — lähdedataa ei
// muuteta, joten haku ja kategorialistat näyttävät yhä kaikki lipputyypit.

import type { Event } from './types'

/** Otsikon vertailusanat: pienennettynä, diakriitit riisuttuna, vain ≥3
 *  merkin sanat ("K-18" hajoaa alle minimin ja putoaa pois itsestään). */
function sanat(otsikko: string): string[] {
  return [...new Set(
    otsikko.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9åäö ]/gi, ' ').split(/\s+/).filter((w) => w.length >= 3),
  )]
}

function helsinkiPaiva(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

/** Ovatko kaksi riviä saman tapahtuman versioita (sama paikka, sama päivä,
 *  otsikot samaa perhettä). */
export function samaTapahtumaPerhe(a: Event, b: Event): boolean {
  const pa = a.location?.name?.toLowerCase().trim()
  const pb = b.location?.name?.toLowerCase().trim()
  if (!pa || !pb || pa !== pb) return false
  if (helsinkiPaiva(a.startTime) !== helsinkiPaiva(b.startTime)) return false
  const sa = sanat(a.title)
  const sb = sanat(b.title)
  if (!sa.length || !sb.length) return false
  const joukko = new Set(sb)
  const yhteiset = sa.filter((w) => joukko.has(w)).length
  return yhteiset / Math.min(sa.length, sb.length) >= 0.6
}

/** Pudottaa listasta myöhemmät perhekaksoset — säilyttää järjestyksen, eli
 *  pisteillä lajitellusta listasta jää perheen paras edustaja. */
export function karsiTapahtumaPerheet(events: Event[]): Event[] {
  const pidetyt: Event[] = []
  for (const e of events) {
    if (!pidetyt.some((p) => samaTapahtumaPerhe(p, e))) pidetyt.push(e)
  }
  return pidetyt
}

/** Saman esityksen ERI PÄIVIEN näytökset (sama paikka + otsikkoperhe,
 *  päivästä riippumatta). Viikkopoiminnoissa torstain ja perjantain näytös
 *  ei saa viedä kahta korttia (mitattu 4.9.2026: Häppy Hour – Helsinki
 *  Circus Festival kahdesti) — kategorialistat sen sijaan näyttävät joka
 *  päivän, joten tämä on vain poimintojen ja heron sääntö. */
export function samaTapahtumaSarja(a: Event, b: Event): boolean {
  const pa = a.location?.name?.toLowerCase().trim()
  const pb = b.location?.name?.toLowerCase().trim()
  if (!pa || !pb || pa !== pb) return false
  const sa = sanat(a.title)
  const sb = sanat(b.title)
  if (!sa.length || !sb.length) return false
  const joukko = new Set(sb)
  const yhteiset = sa.filter((w) => joukko.has(w)).length
  return yhteiset / Math.min(sa.length, sb.length) >= 0.6
}

/** Keep-first-karsinta sarjasäännöllä (poiminnat + hero). */
export function karsiTapahtumaSarjat(events: Event[]): Event[] {
  const pidetyt: Event[] = []
  for (const e of events) {
    if (!pidetyt.some((p) => samaTapahtumaSarja(p, e))) pidetyt.push(e)
  }
  return pidetyt
}
