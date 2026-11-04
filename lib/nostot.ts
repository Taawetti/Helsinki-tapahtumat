// "✦ TULOSSA" — etusivun kärjen nostot tulevista tapahtumista (omistaja
// 27.10.2026). Tämä on sovelluksen ansaintamalli: mainostaja ostaa
// tapahtumalleen kärkipaikan jaksoksi, ja nosto näkyy jokaiselle etusivun
// avaajalle ennen "Illan nostoja". Illan nostot säilyvät ennallaan — ne ovat
// sovelluksen lupaus (mitä tänään); tämä on sen päälle tuleva paikka.
//
// MAKSETTU NOSTO MERKITÄÄN "Mainos". Kuluttajansuojalaki (2 luku 4 §) vaatii,
// että markkinoinnin kaupallinen tarkoitus käy ilmi, ja kuluttaja-asiamiehen
// linjan mukaan merkki on "Mainos" tai "Kaupallinen yhteistyö" — "Suositellaan"
// tai "Yhteistyössä" ei riitä. Otsikko "Tulossa" saa olla toimituksellinen,
// koska paikassa voi olla myös maksuttomia toimituksen nostoja (mainos: false).
//
// OSUMA, EI TUNNISTE: sama kuvio kuin data/tapahtumakorjaukset.json — otsikko
// + Helsinki-päivä + paikka, jotka pysyvät vaikka lähde ja tunniste vaihtuisi.
// Tapahtuman tiedot (kuva, lippulinkki, kuvaus) tulevat koosteesta, jolloin
// kortti on aina sama kuin muuallakin sovelluksessa. Nosto, jolle ei löydy
// tapahtumaa, jää pois: mieluummin ei korttia kuin kortti ilman tietoja.
//
// OTSIKKO KUUKAUDEN MUKAAN (omistaja 4.11.2026): "Joulukuun nosto" kertoo,
// että tämä on valittu, ja tekee paikasta tuotteen jota voi myydä kuukausi
// kerrallaan ("Marraskuun nosto", …). Otsikko LASKETAAN tapahtuman
// Helsinki-kuukaudesta, ei kirjoiteta käsin: marraskuun tapahtuma saa oman
// otsikkonsa itsestään, ja kun jonossa on nostoja eri kuukausille, kukin
// kuukausi on oma ryhmänsä omalla otsikollaan (ryhmitteleKuukausittain).
//
// MITTAUS: juliste ruudulla kirjautuu promo_view'na (kerran per sivulataus,
// 4.11.2026 alkaen), avaus pinnalla 'promo' ja lippuklikki external_clickinä
// samalla pinnalla. Kampanjan raportti luetaan admin-näkymän Tapahtuman
// seuranta -osiosta (näyttökerrat, avaukset, eri kävijät, lippukauppaklikit,
// suosikit, jaetun sivun avaukset) ja "Mistä kortti avattiin" -listan
// promo-rivistä.

import type { Event } from './types'
import { shareUrlFor } from './event-links'
import { helsinkiDateOf } from './helsinki-time'
import { tapahtumaHakuParams } from './events-fetch'
import { osuukoKorjaus } from './tapahtumakorjaukset'

export interface NostoMaaritys {
  /** Lyhyt tunniste lokiin ja diffiin. */
  id: string
  osuma: { otsikko: string; paiva: string; paikka?: string }
  /** Kampanjan ensimmäinen ja viimeinen päivä (Helsinki), molemmat mukana. */
  alku: string
  loppu: string
  /** true = maksettu → kortissa "Mainos"-merkki. */
  mainos: boolean
  asiakas?: string
  /** Pienempi ensin, kun nostoja on useita. */
  jarjestys?: number
  /** Koukkurivi otsikon alle, esim. esiintyjät — kortin myyntivaltti. */
  koukku?: string
  /** Sosiaalinen todiste, esim. "Viime vuoden konsertti myytiin loppuun".
   *  Vain tosia väitteitä järjestäjän omasta tiedotteesta. */
  todiste?: string
  /** Jakolinkin esikatselukuva (1200×630) WhatsAppiin, Facebookiin ja X:ään:
   *  polku public-kansiosta ("/nostot/…-jako.jpg") tai https-osoite. Ilman
   *  tätä esikatselussa on tapahtuman oma kuva, ja pystyjuliste rajautuu
   *  keskeltä niin että otsikko jää pois. Käytössä vain kampanjan aikana. */
  jakokuva?: string
  muistiinpano?: string
}

export interface NostoTiedosto { nostot: NostoMaaritys[] }

export interface Nosto { id: string; mainos: boolean; event: Event; koukku?: string; todiste?: string; jakokuva?: string }

const PAIVA = /^\d{4}-\d{2}-\d{2}$/

/** Tänään voimassa olevat nostot, joiden tapahtuma ei ole vielä mennyt. */
export function aktiivisetNostot(maaritykset: readonly NostoMaaritys[], tanaan: string): NostoMaaritys[] {
  return maaritykset
    .filter((n) => PAIVA.test(n.alku) && PAIVA.test(n.loppu) && PAIVA.test(n.osuma.paiva))
    .filter((n) => n.alku <= tanaan && tanaan <= n.loppu && n.osuma.paiva >= tanaan)
    .sort((a, b) => (a.jarjestys ?? 99) - (b.jarjestys ?? 99))
}

/** Noston tapahtuman Helsinki-kuukausi muodossa YYYY-MM. Lähteen aikaleima voi
 *  olla UTC:nä, jolloin 30.11. klo 22:30Z on jo joulukuuta Helsingissä. */
export function nostonKuukausi(n: Pick<Nosto, 'event'>): string {
  return helsinkiDateOf(n.event.startTime).slice(0, 7)
}

/** Ryhmittelee nostot tapahtuman kuukauden mukaan. Ryhmien järjestys on
 *  ensimmäisen esiintymän järjestys, eli omistajan `jarjestys` ratkaisee
 *  kumpi kuukausi näkyy ylempänä — ei kalenteri. */
export function ryhmitteleKuukausittain<N extends Pick<Nosto, 'event'>>(nostot: readonly N[]): { kuukausi: string; nostot: N[] }[] {
  const ryhmat: { kuukausi: string; nostot: N[] }[] = []
  for (const n of nostot) {
    const kuukausi = nostonKuukausi(n)
    const ryhma = ryhmat.find((r) => r.kuukausi === kuukausi)
    if (ryhma) ryhma.nostot.push(n)
    else ryhmat.push({ kuukausi, nostot: [n] })
  }
  return ryhmat
}

const KUUKAUDET_FI = ['tammikuun', 'helmikuun', 'maaliskuun', 'huhtikuun', 'toukokuun', 'kesäkuun', 'heinäkuun', 'elokuun', 'syyskuun', 'lokakuun', 'marraskuun', 'joulukuun']
const KUUKAUDET_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Osion otsikko kuukauden ryhmälle: "Joulukuun nosto", useammalle
 *  "Joulukuun nostot"; englanniksi "December pick" / "December picks".
 *  Null, jos kuukausi ei ole kelvollinen — kutsuja näyttää silloin yleisen
 *  otsikon (i18n promo.title). */
export function kuukausiOtsikko(kuukausi: string, maara: number, lang: 'fi' | 'en'): string | null {
  const i = Number(kuukausi.slice(5, 7)) - 1
  if (!/^\d{4}-\d{2}$/.test(kuukausi) || !(i >= 0 && i < 12)) return null
  if (lang === 'en') return `${KUUKAUDET_EN[i]} ${maara > 1 ? 'picks' : 'pick'}`
  const kk = KUUKAUDET_FI[i]
  return `${kk[0].toUpperCase()}${kk.slice(1)} ${maara > 1 ? 'nostot' : 'nosto'}`
}

/** Yhdistää määritykset koosteen tapahtumiin otsikon, päivän ja paikan perusteella. */
export function yhdistaNostot(maaritykset: readonly NostoMaaritys[], events: readonly Event[]): Nosto[] {
  const out: Nosto[] = []
  for (const n of maaritykset) {
    const e = events.find((ev) => osuukoKorjaus(ev, { id: n.id, osuma: n.osuma, aseta: {} }))
    if (e) out.push({ id: n.id, mainos: n.mainos, event: e, koukku: n.koukku, todiste: n.todiste, jakokuva: n.jakokuva })
  }
  return out
}

/** Nostopäivän lämmitysosoitteet (app/api/warm, omistaja 3.11.2026: Jannan
 *  jakosivu aukesi hiljaisen jakson jälkeen 7–10 s). Päiväikkuna on SAMA
 *  osoite kuin selaimen päivähaku ja jaetun sivun kooste (lib/jaettu-tapahtuma
 *  haeKoosteesta), jotta reunaosuma syntyy; jakosivu löytyy vain jos nosto
 *  osuu ikkunan tapahtumiin. Puhdas funktio. */
export function nostonLammitysOsoitteet(n: NostoMaaritys, events: readonly Event[], origin: string): { ikkuna: string; sivu: string | null } {
  const ikkuna = `${origin}/api/events?${tapahtumaHakuParams({ dateFilter: 'custom', customDate: n.osuma.paiva, page: 1, municipality: 'helsinki' })}`
  const osuma = yhdistaNostot([n], events)[0]
  return { ikkuna, sivu: osuma ? shareUrlFor(osuma.event, origin) : null }
}

/** Hakee aktiivisten nostojen tapahtumat koosteesta (hakusana + päivä, jotta
 *  osuma löytyy ensimmäiseltä sivulta). Ei koskaan heitä: nosto on lisä, eikä
 *  sen haun vika saa kaataa etusivua. */
export async function haeNostot(origin: string, maaritykset: readonly NostoMaaritys[], tanaan: string): Promise<Nosto[]> {
  const aktiiviset = aktiivisetNostot(maaritykset, tanaan)
  if (aktiiviset.length === 0) return []
  const tapahtumat: Event[] = []
  await Promise.all(aktiiviset.map(async (n) => {
    try {
      const params = new URLSearchParams({ start: n.osuma.paiva, end: n.osuma.paiva, page: '1', municipality: 'helsinki', keyword: n.osuma.otsikko })
      const res = await fetch(`${origin}/api/events?${params}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(20_000) })
      if (!res.ok) return
      const data = (await res.json()) as { events?: Event[] }
      tapahtumat.push(...(data.events ?? []))
    } catch { /* nosto jää pois tältä renderiltä */ }
  }))
  return yhdistaNostot(aktiiviset, tapahtumat)
}
