// Valmiit illan rungot (HANDOFF-mobiili.md §7) — Suunnitelma-välilehden tyhjä
// tila mobiilissa tarjoaa enintään kolme valmista iltaa, jotka käyttäjä voi
// ottaa pohjaksi yhdellä napautuksella.
//
// RUNGOT KOOSTETAAN PÄIVÄN OIKEASTA DATASTA, ei kovakoodatuista esimerkeistä:
// tapahtumat ovat tämän päivän tulevia, kohderyhmään kuuluvia (lib/audience)
// tapahtumia, ja ravintolat/baarit valitaan oikeasta ravintoladatasta niin,
// että ne ovat lähellä tapahtumaa (≤ 2 km) ja auki suunniteltuun aikaan.
// Siirtymä- ja kellonaikalogiikka on kokonaan lib/suunnitelman sovittimen
// (ja HSL-kulkutapavalinnan) — tässä EI lasketa aikoja, vain valitaan
// askeleet. Puhdas funktio: `nyt` annetaan parametrina.
//
// Askeleet rakennetaan samoilla rakentajilla kuin paneelien keräilynapit
// (tapahtumaAskel, ravintolaAskel), joten runko on täsmälleen sama asia kuin
// käsin koottu suunnitelma — myös jaettuna.

import type { Event, Restaurant } from './types'
import type { TranslationKey } from './i18n'
import { getEventVibes } from './event-classify'
import { isOutsideTargetAudience } from './audience'
import { onVisa, onPeruttu } from './picks'
import { haversineMeters, walkMinutesBetween } from './group'
import { DUR_H, TRAVEL_BUFFER_H } from './group-scheduler'
import { isOpenAt } from './opening-hours'
import { helsinkiClock } from './arvo-ilta'
import { tuntematonAika } from './utils'
import { track } from './track'
import { tapahtumaAskel, ravintolaAskel, korvaaSuunnitelma, tunnitKloksi, type SuunnitelmaAskel } from './suunnitelma'

export interface Runko {
  id: 'dinner_gig' | 'gig_bar' | 'culture' | 'party' | 'standup' | 'sport'
  emoji: string
  otsikkoAvain: TranslationKey
  /** YYYY-MM-DD (Helsinki) — rungon päivä. */
  paiva: string
  askeleet: Omit<SuunnitelmaAskel, 'id'>[]
}

const MAX_ETAISYYS_M = 2000
/** Laatukynnys tyypeittäin: uskottava arvosana JA riittävä otos. Illallis-
 *  paikalta vaaditaan enemmän (ja vähintään €€) — "Illallinen ja keikka"
 *  ei saa tarkoittaa lähintä kebabia (mitattu 24.9.2026: Vuo Kebab ja
 *  Pizzeria oli lähin 4,3+/150+ -paikka). */
const KYNNYS: Record<'ravintola' | 'baari', { arvosana: number; arvosteluja: number; hinta: number }> = {
  ravintola: { arvosana: 4.4, arvosteluja: 250, hinta: 2 },
  baari: { arvosana: 4.3, arvosteluja: 150, hinta: 1 },
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

type Laji = 'keikka' | 'kulttuuri' | 'standup' | 'bileet' | 'urheilu'

function laji(e: Event): Laji | null {
  const v = getEventVibes(e)
  if (v.includes('standup')) return 'standup'
  if (v.includes('yoelama') || v.includes('underground')) return 'bileet'
  if (v.includes('keikka')) return 'keikka'
  if (v.includes('urheilu')) return 'urheilu'
  if (v.includes('teatteri') || v.includes('taide') || v.includes('museo')) return 'kulttuuri'
  return null
}

function tunti(e: Event): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(e.startTime))
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return g('hour') + g('minute') / 60
}

function kelloksi(paiva: string, h: number): Date {
  const d = new Date(`${paiva}T12:00:00`)
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)
  return d
}

/** Lähin laatukynnyksen ylittävä paikka, joka on auki annettuun aikaan. */
function lahinAuki(
  paikat: Restaurant[],
  tyyppi: 'ravintola' | 'baari',
  kohde: { lat?: number; lon?: number },
  paiva: string,
  klo: number,
  poissa: Set<string>,
): Restaurant | null {
  if (kohde.lat == null || kohde.lon == null) return null
  const k = KYNNYS[tyyppi]
  let paras: Restaurant | null = null
  let parasM = Infinity
  for (const r of paikat) {
    if (r.type !== tyyppi || poissa.has(r.id)) continue
    if (r.lat == null || r.lon == null) continue
    if ((r.googleRating ?? 0) < k.arvosana || (r.reviewCount ?? 0) < k.arvosteluja) continue
    // Hintataso tunnetaan vain osalle — puuttuva ei pudota.
    if (r.priceRange !== undefined && r.priceRange < k.hinta) continue
    // Aukiolo TIEDETTÄVÄ ja auki: tuntematon ei kelpaa runkoon (käsin
    // lisätessä käyttäjä näkee varoituksen, runko luvataan valmiina).
    if (isOpenAt(r.openingHours, kelloksi(paiva, klo)) !== true) continue
    const m = haversineMeters(kohde.lat, kohde.lon, r.lat, r.lon)
    if (m > MAX_ETAISYYS_M || m >= parasM) continue
    paras = r
    parasM = m
  }
  return paras
}

/**
 * Enintään kolme runkoa tämän päivän tulevista tapahtumista. Järjestys on
 * myös prioriteetti: keikkailta, kulttuuri-ilta, bileet, stand up, peli.
 * Palauttaa tyhjän listan kun päivästä ei saa yhtään uskottavaa iltaa —
 * kutsuja piilottaa silloin koko lohkon eikä näytä täytettä.
 */
export interface RunkoOpts {
  /** Tapahtuma-id:t joita EI käytetä — "Vaihda iltaa" (omistaja 24.9.2026)
   *  antaa tähän jo ehdotetut, jotta jokainen painallus tuottaa uuden illan. */
  ohita?: ReadonlySet<string>
}

export function rakennaRungot(events: Event[], restaurants: Restaurant[], nyt: Date, opts: RunkoOpts = {}): Runko[] {
  const kello = helsinkiClock(nyt)
  const paiva = kello.date
  const ohita = opts.ohita ?? new Set<string>()
  // Vähintään 45 min valmistautumisaikaa; vain tämän päivän tapahtumat.
  const raja = kello.hour + 0.75
  const ehdokkaat = events
    .filter((e) => !ohita.has(e.id))
    .filter((e) => !tuntematonAika(e.startTime) && !onVisa(e) && !onPeruttu(e) && !isOutsideTargetAudience(e))
    .filter((e) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(e.startTime)) === paiva)
    .filter((e) => tunti(e) >= raja && e.location?.lat != null && e.location?.lon != null)
    // Kuvalliset ensin — runko näkyy kortteina; sitten aikajärjestys.
    .sort((a, b) => Number(!!b.image) - Number(!!a.image) || tunti(a) - tunti(b))

  const kaytetytTapahtumat = new Set<string>()
  const kaytetytPaikat = new Set<string>()
  const ota = (l: Laji, minTunti = 0, ehto: (e: Event) => boolean = () => true): Event | null => {
    const e = ehdokkaat.find((x) => !kaytetytTapahtumat.has(x.id) && laji(x) === l && tunti(x) >= minTunti && ehto(x)) ?? null
    if (e) kaytetytTapahtumat.add(e.id)
    return e
  }
  // Kulttuuri-ilta hyväksyy myös keikka+teatteri-yhdistelmät ("Decorado –
  // Rakkautta & Anarkiaa"): laji() priorisoi keikan, mutta kun illallinen ei
  // enää ehdi, sama tapahtuma on täysin kelvollinen kulttuuri-ilta baarin kanssa.
  const otaKulttuuri = (minTunti: number): Event | null => {
    const e = ehdokkaat.find((x) => !kaytetytTapahtumat.has(x.id) && tunti(x) >= minTunti
      && getEventVibes(x).some((v) => v === 'teatteri' || v === 'taide' || v === 'museo')) ?? null
    if (e) kaytetytTapahtumat.add(e.id)
    return e
  }
  // Tapahtuman JÄLKEEN tuleva baari ei saa alkaa yli sovittimen yökaton
  // (ARC_END_CAP_H 23.5 → 'myohaan'-varoitus): tapahtuma + 2¼ h ≤ 23.5.
  const jatkotEhtii = (e: Event) => tunti(e) + 2.25 <= 23.5
  // ENNEN tapahtumaa tuleva askel on ehdittävä: sen alun pitää olla vielä
  // edessä (≥ raja) ja ruokailun/drinkkien KESTON + KÄVELYN + puskurin pitää
  // mahtua ennen tapahtumaa — täsmälleen sama kaava kuin lib/suunnitelma
  // sovitaAjat käyttää (DUR_H.food 1,5 h ≥ omistajan vähimmäisaika 1 h 15 min,
  // drinkit 1 h, TRAVEL_BUFFER_H 15 min, kävely lib/group). Ilman tätä
  // klo 17.45 ehdotettiin "illallinen 18.30 → keikka 19.00" ja jokainen runko
  // sai heti "Huomioi aika" -varoituksen (mitattu 24.9.2026). Kävely
  // tiedetään vasta kun ravintola on valittu, joten sopivuus tarkistetaan
  // ravintolan kanssa ja huono pari hylätään (seuraava tapahtuma).
  const illallisKlo = (e: Event) => clamp(tunti(e) - 2.25, 16.5, 20)
  const baariKlo = (e: Event) => clamp(tunti(e) - 1.75, 19, 22.5)
  const ehtii = (klo: number, kestoH: number, paikka: { lat?: number; lon?: number }, e: Event) => {
    if (klo < raja) return false
    const kavely = walkMinutesBetween(paikka, e.location ?? {}) ?? 0
    return klo + kestoH + kavely / 60 + TRAVEL_BUFFER_H <= tunti(e)
  }
  const ehtiiIllalliselle = (e: Event) => illallisKlo(e) >= raja && illallisKlo(e) + DUR_H.food + TRAVEL_BUFFER_H <= tunti(e)
  const ehtiiBaariin = (e: Event) => baariKlo(e) >= raja && baariKlo(e) + DUR_H.drinks + TRAVEL_BUFFER_H <= tunti(e)
  /** Valitsee ennen-askeleelle tapahtuman ja paikan niin että aika riittää
   *  kävelyineen; epäsopiva pari vapautetaan ja kokeillaan seuraavaa. */
  const ennenPari = (
    l: Laji, minTunti: number, karkea: (e: Event) => boolean, klo: (e: Event) => number, kestoH: number,
    hae: (kohde: Event, klo: number, ennen: boolean) => Omit<SuunnitelmaAskel, 'id'> | null,
  ): { e: Event; askel: Omit<SuunnitelmaAskel, 'id'> } | null => {
    for (let yritys = 0; yritys < 6; yritys++) {
      const e = ota(l, minTunti, karkea)
      if (!e) return null
      const askel = hae(e, klo(e), true)
      if (askel && ehtii(klo(e), kestoH, askel, e)) return { e, askel }
      // Ei sovi: vapauta tapahtuma ja paikka, koeta seuraavaa tapahtumaa
      // (tapahtuma jää poissa-listalle, ettei sama pari toistu).
      if (askel?.viiteId) kaytetytPaikat.delete(askel.viiteId)
    }
    return null
  }
  // Ravintola/baari ENNEN tapahtumaa: askeleen oletusKlo asetetaan laskettuun
  // aikaan, jotta suunnitelman sovitin aloittaa siitä eikä tyypin vakiosta
  // (ravintola 18.00 keikan 18.00 kanssa antoi "Huomioi aika" -varoituksen
  // heti käytöstä, mitattu 24.9.2026). Tapahtuman JÄLKEEN tuleva paikka saa
  // aikansa sovittimesta (edellisen loppu + siirtymä) → ei oletusta tarvita.
  const ravintola = (kohde: Event, klo: number, ennen: boolean) => {
    const r = lahinAuki(restaurants, 'ravintola', kohde.location!, paiva, klo, kaytetytPaikat)
    if (!r) return null
    kaytetytPaikat.add(r.id)
    return ennen ? { ...ravintolaAskel(r), oletusKlo: tunnitKloksi(klo) } : ravintolaAskel(r)
  }
  const baari = (kohde: Event, klo: number, ennen: boolean) => {
    const r = lahinAuki(restaurants, 'baari', kohde.location!, paiva, klo, kaytetytPaikat)
    if (!r) return null
    kaytetytPaikat.add(r.id)
    return ennen ? { ...ravintolaAskel(r), oletusKlo: tunnitKloksi(klo) } : ravintolaAskel(r)
  }

  const rungot: Runko[] = []

  // 1. Illallinen ja keikka: ravintola 2¼ h ennen keikkaa (16.30–20.00) → keikka.
  {
    const pari = ennenPari('keikka', 18.75, ehtiiIllalliselle, illallisKlo, DUR_H.food, ravintola)
    if (pari) rungot.push({ id: 'dinner_gig', emoji: '🎸', otsikkoAvain: 'plan.tpl_dinner_gig', paiva, askeleet: [pari.askel, tapahtumaAskel(pari.e)] })
  }
  // 1b. Keikka ja jatkot: kun illalliselle ei enää ehdi (mitattu 24.9.2026
  // klo 19: kaikki jäljellä olevat ehdokkaat olivat keikkoja ja rungot jäivät
  // tyhjiksi), keikka → baari jälkeen.
  if (!rungot.some((r) => r.id === 'dinner_gig')) {
    const keikka = ota('keikka', 17, jatkotEhtii)
    if (keikka) {
      const b = baari(keikka, Math.max(21, tunti(keikka) + 2.25), false)
      if (b) rungot.push({ id: 'gig_bar', emoji: '🍻', otsikkoAvain: 'plan.tpl_gig_bar', paiva, askeleet: [tapahtumaAskel(keikka), b] })
      else kaytetytTapahtumat.delete(keikka.id)
    }
  }
  // 2. Kulttuuri-ilta: teatteri/taide/museo (illalla) → baari jälkeen.
  {
    const k = otaKulttuuri(17)
    if (k) {
      const b = baari(k, Math.max(21, tunti(k) + 2.25), false)
      const askeleet = [tapahtumaAskel(k), b].filter((a): a is Omit<SuunnitelmaAskel, 'id'> => !!a)
      if (askeleet.length >= 2) rungot.push({ id: 'culture', emoji: '🎭', otsikkoAvain: 'plan.tpl_culture', paiva, askeleet })
      else kaytetytTapahtumat.delete(k.id)
    }
  }
  // 3. Bileisiin: baari 1¾ h ennen (19.00–22.30) → klubi myöhään.
  if (rungot.length < 3) {
    const pari = ennenPari('bileet', 21, ehtiiBaariin, baariKlo, DUR_H.drinks, baari)
    if (pari) rungot.push({ id: 'party', emoji: '🪩', otsikkoAvain: 'plan.tpl_party', paiva, askeleet: [pari.askel, tapahtumaAskel(pari.e)] })
  }
  // 4. Naurua ja drinkit: stand up → baari.
  if (rungot.length < 3) {
    const s = ota('standup', 17)
    if (s) {
      const b = baari(s, Math.max(21, tunti(s) + 2), false)
      const askeleet = [tapahtumaAskel(s), b].filter((a): a is Omit<SuunnitelmaAskel, 'id'> => !!a)
      if (askeleet.length >= 2) rungot.push({ id: 'standup', emoji: '😂', otsikkoAvain: 'plan.tpl_standup', paiva, askeleet })
      else kaytetytTapahtumat.delete(s.id)
    }
  }
  // 5. Peli ja oluet: ottelu → baari.
  if (rungot.length < 3) {
    const p = ota('urheilu', 16)
    if (p) {
      const b = baari(p, Math.max(20.5, tunti(p) + 2.25), false)
      const askeleet = [tapahtumaAskel(p), b].filter((a): a is Omit<SuunnitelmaAskel, 'id'> => !!a)
      if (askeleet.length >= 2) rungot.push({ id: 'sport', emoji: '⚽', otsikkoAvain: 'plan.tpl_sport', paiva, askeleet })
    }
  }

  return rungot.slice(0, 3)
}

/** Rungon tapahtuma-id:t — "Vaihda iltaa" ohittaa nämä seuraavalla kerralla. */
export function rungonTapahtumat(runko: Runko): string[] {
  return runko.askeleet.flatMap((a) => (a.tyyppi === 'tapahtuma' && a.viiteId ? [a.viiteId] : []))
}

/** Ottaa rungon suunnitelman pohjaksi (korvaa suunnitelman). */
export function kaytaRunko(runko: Runko, otsikko: string, lahde: 'runko' | 'runko-vaihto' = 'runko'): void {
  korvaaSuunnitelma({
    otsikko,
    paiva: runko.paiva,
    askeleet: runko.askeleet.map((a, i) => ({ ...a, id: `runko${i}` })),
  })
  // Sama mittari kuin keräilynapeilla; meta kertoo että lähde oli runko
  // (tai "Vaihda iltaa" -painallus).
  track('plan_add', { label: runko.id, meta: lahde })
}

/** Seuraava ilta "Vaihda iltaa" -napille: mieluiten samaa lajia kuin nykyinen,
 *  muuten mikä tahansa uusi; jos ohituslista on syönyt kaikki, aloitetaan
 *  alusta ohittaen vain nykyisen illan tapahtumat. null = päivästä ei saa
 *  yhtään runkoa. */
export function seuraavaRunko(
  events: Event[], restaurants: Restaurant[], nyt: Date,
  nykyinen: Runko['id'] | null, ohita: ReadonlySet<string>, nykyisenTapahtumat: ReadonlySet<string>,
): { runko: Runko; ohita: Set<string> } | null {
  const valitse = (lista: Runko[]) => lista.find((r) => r.id === nykyinen) ?? lista[0] ?? null
  let r = valitse(rakennaRungot(events, restaurants, nyt, { ohita }))
  let uusiOhita = new Set(ohita)
  if (!r) {
    uusiOhita = new Set(nykyisenTapahtumat)
    r = valitse(rakennaRungot(events, restaurants, nyt, { ohita: uusiOhita }))
    if (!r) return null
  }
  for (const id of rungonTapahtumat(r)) uusiOhita.add(id)
  return { runko: r, ohita: uusiOhita }
}
