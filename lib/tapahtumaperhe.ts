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
// ── Festivaalisarjat eri paikoissa ────────────────────────────────────────
// Helsinki Comedy Festival 2026 (mitattu 23.9.2026): lippu.fi listaa jokaisen
// näytöksen omana rivinään — 11 näytöstä samana päivänä 11 eri paikassa,
// KAIKILLA sama festivaalikuva ja sama yleiskuvaus. Ne ovat aidosti eri
// näytöksiä (dedup jättää oikein erilleen), mutta ruudukossa ne ovat seinä
// samaa korttia, ja herossa jokainen sai festivaalipisteet eri paikasta.
//
// Sarjan tunnistus vaatii KAKSI asiaa: yhteinen otsikon etuliite ("HCF 2026")
// JA yhteinen kuva tai kuvaus. Pelkkä etuliite ei riitä — "Tietovisa – X"
// toistuu 15 kertaa päivässä eri paikkojen omina iltoina eri kuvauksin, eikä
// niitä saa niputtaa.

/** Otsikon sarjaetuliite ennen ensimmäistä erotinta (" - ", " – ", " | ",
 *  ": "), normalisoituna. null jos erotinta ei ole tai etuliite on liian
 *  lyhyt ollakseen nimi. */
export function sarjaEtuliite(otsikko: string): string | null {
  const m = /^(.{4,60}?)\s+[-–|]\s+.+$|^(.{4,60}?):\s+.+$/.exec(otsikko.trim())
  const raaka = (m?.[1] ?? m?.[2] ?? '').trim()
  if (!raaka) return null
  const norm = raaka.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ')
  return sanat(norm).length ? norm : null
}

/** Sama kuva (ei-tyhjä) tai sama PITKÄ kuvaus. Kuvausraja on 100 merkkiä
 *  mitatusta syystä: pubivisat-lähde kirjoittaa joka visalle saman 43 merkin
 *  vakiotekstin ("Viikoittainen tietovisa. Lähde: pubivisat.fi"), ja 80
 *  merkin raja niputti 15 eri baarin visat yhdeksi kortiksi (23.9.2026).
 *  Lähteen vakioteksti ei ole jaettua sisältöä; festivaalin oikea esittely
 *  (HCF: ~190 merkkiä) on. */
export function jaettuSisalto(a: Event, b: Event): boolean {
  if (a.image && b.image && a.image === b.image) return true
  const da = (a.description || '').trim()
  const db = (b.description || '').trim()
  return da.length >= 100 && da.slice(0, 120) === db.slice(0, 120)
}

/** Sama festivaalisarja paikasta riippumatta: yhteinen etuliite + yhteinen
 *  kuva tai kuvaus. */
export function samaSarjaEriPaikoissa(a: Event, b: Event): boolean {
  const ea = sarjaEtuliite(a.title)
  return !!ea && ea === sarjaEtuliite(b.title) && jaettuSisalto(a, b)
}

export interface Sarjaryhma {
  tyyppi: 'sarja'
  /** Ryhmän avain (etuliite + päivä) — React-key ja hakusana. */
  avain: string
  /** Näytettävä nimi: lyhin alkuperäinen etuliite sellaisenaan. */
  nimi: string
  tapahtumat: Event[]
}

/** Ruudukon ryhmittely: samana Helsinki-päivänä ≥ minKoko saman sarjan
 *  näytöstä → yksi Sarjaryhma alkuperäisen ensimmäisen kohdalle; muut rivit
 *  sellaisinaan. Järjestys säilyy. */
export function ryhmitaSarjat(events: Event[], minKoko = 3): Array<Event | Sarjaryhma> {
  const avaimet = events.map((e) => {
    const et = sarjaEtuliite(e.title)
    return et ? `${et}|${helsinkiPaiva(e.startTime)}` : null
  })
  const ehdokkaat = new Map<string, Event[]>()
  events.forEach((e, i) => { const k = avaimet[i]; if (k) (ehdokkaat.get(k) ?? ehdokkaat.set(k, []).get(k)!).push(e) })
  // Ryhmä kelpaa vain jos sisältö on jaettu KAIKKIEN kesken ensimmäisen kanssa.
  const ryhmat = new Map<string, Event[]>()
  for (const [k, rivit] of ehdokkaat) {
    const jaetut = rivit.filter((r) => r === rivit[0] || jaettuSisalto(rivit[0], r))
    if (jaetut.length >= minKoko) ryhmat.set(k, jaetut)
  }
  const out: Array<Event | Sarjaryhma> = []
  const tehty = new Set<string>()
  events.forEach((e, i) => {
    const k = avaimet[i]
    const r = k ? ryhmat.get(k) : undefined
    if (!r || !r.includes(e)) { out.push(e); return }
    if (tehty.has(k!)) return
    tehty.add(k!)
    const alkuperainen = /^(.{4,60}?)\s+[-–|]\s+.+$|^(.{4,60}?):\s+.+$/.exec(e.title.trim())
    out.push({ tyyppi: 'sarja', avain: k!, nimi: (alkuperainen?.[1] ?? alkuperainen?.[2] ?? e.title).trim(), tapahtumat: r })
  })
  return out
}

export function samaTapahtumaSarja(a: Event, b: Event): boolean {
  // Festivaalisarja eri paikoissa on sama sarja (HCF 2026 -oppi, ks. yllä).
  if (samaSarjaEriPaikoissa(a, b)) return true
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
