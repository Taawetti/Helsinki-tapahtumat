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
import { haversineMeters } from './group'
import { isOpenAt } from './opening-hours'
import { helsinkiClock } from './arvo-ilta'
import { tuntematonAika } from './utils'
import { track } from './track'
import { tapahtumaAskel, ravintolaAskel, korvaaSuunnitelma, tunnitKloksi, type SuunnitelmaAskel } from './suunnitelma'

export interface Runko {
  id: 'dinner_gig' | 'culture' | 'party' | 'standup' | 'sport'
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
export function rakennaRungot(events: Event[], restaurants: Restaurant[], nyt: Date): Runko[] {
  const kello = helsinkiClock(nyt)
  const paiva = kello.date
  // Vähintään 45 min valmistautumisaikaa; vain tämän päivän tapahtumat.
  const raja = kello.hour + 0.75
  const ehdokkaat = events
    .filter((e) => !tuntematonAika(e.startTime) && !onVisa(e) && !onPeruttu(e) && !isOutsideTargetAudience(e))
    .filter((e) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(e.startTime)) === paiva)
    .filter((e) => tunti(e) >= raja && e.location?.lat != null && e.location?.lon != null)
    // Kuvalliset ensin — runko näkyy kortteina; sitten aikajärjestys.
    .sort((a, b) => Number(!!b.image) - Number(!!a.image) || tunti(a) - tunti(b))

  const kaytetytTapahtumat = new Set<string>()
  const kaytetytPaikat = new Set<string>()
  const ota = (l: Laji, minTunti = 0, maxTunti = 30): Event | null => {
    const e = ehdokkaat.find((x) => !kaytetytTapahtumat.has(x.id) && laji(x) === l && tunti(x) >= minTunti && tunti(x) <= maxTunti) ?? null
    if (e) kaytetytTapahtumat.add(e.id)
    return e
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
    const keikka = ota('keikka', 18.75)
    if (keikka) {
      const r = ravintola(keikka, clamp(tunti(keikka) - 2.25, 16.5, 20), true)
      const askeleet = [r, tapahtumaAskel(keikka)].filter((a): a is Omit<SuunnitelmaAskel, 'id'> => !!a)
      if (askeleet.length >= 2) rungot.push({ id: 'dinner_gig', emoji: '🎸', otsikkoAvain: 'plan.tpl_dinner_gig', paiva, askeleet })
      else kaytetytTapahtumat.delete(keikka.id)
    }
  }
  // 2. Kulttuuri-ilta: teatteri/taide/museo (illalla) → baari jälkeen.
  {
    const k = ota('kulttuuri', 17)
    if (k) {
      const b = baari(k, Math.max(21, tunti(k) + 2.25), false)
      const askeleet = [tapahtumaAskel(k), b].filter((a): a is Omit<SuunnitelmaAskel, 'id'> => !!a)
      if (askeleet.length >= 2) rungot.push({ id: 'culture', emoji: '🎭', otsikkoAvain: 'plan.tpl_culture', paiva, askeleet })
      else kaytetytTapahtumat.delete(k.id)
    }
  }
  // 3. Bileisiin: baari 1¾ h ennen (19.00–22.30) → klubi myöhään.
  if (rungot.length < 3) {
    const klubi = ota('bileet', 21)
    if (klubi) {
      const b = baari(klubi, clamp(tunti(klubi) - 1.75, 19, 22.5), true)
      const askeleet = [b, tapahtumaAskel(klubi)].filter((a): a is Omit<SuunnitelmaAskel, 'id'> => !!a)
      if (askeleet.length >= 2) rungot.push({ id: 'party', emoji: '🪩', otsikkoAvain: 'plan.tpl_party', paiva, askeleet })
      else kaytetytTapahtumat.delete(klubi.id)
    }
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

/** Ottaa rungon suunnitelman pohjaksi (korvaa tyhjän suunnitelman). */
export function kaytaRunko(runko: Runko, otsikko: string): void {
  korvaaSuunnitelma({
    otsikko,
    paiva: runko.paiva,
    askeleet: runko.askeleet.map((a, i) => ({ ...a, id: `runko${i}` })),
  })
  // Sama mittari kuin keräilynapeilla; meta kertoo että lähde oli runko.
  track('plan_add', { label: runko.id, meta: 'runko' })
}
