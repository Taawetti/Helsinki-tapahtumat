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
// MITTAUS: avaus kirjautuu pinnalla 'promo' ja lippuklikki external_clickinä
// samalla pinnalla. Kampanjan raportti luetaan admin-näkymän Tapahtuman
// seuranta -osiosta (avaukset, eri kävijät, lippukauppaklikit, jaetun sivun
// avaukset) ja "Mistä kortti avattiin" -listan promo-rivistä.

import type { Event } from './types'
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

/** Yhdistää määritykset koosteen tapahtumiin otsikon, päivän ja paikan perusteella. */
export function yhdistaNostot(maaritykset: readonly NostoMaaritys[], events: readonly Event[]): Nosto[] {
  const out: Nosto[] = []
  for (const n of maaritykset) {
    const e = events.find((ev) => osuukoKorjaus(ev, { id: n.id, osuma: n.osuma, aseta: {} }))
    if (e) out.push({ id: n.id, mainos: n.mainos, event: e, koukku: n.koukku, todiste: n.todiste, jakokuva: n.jakokuva })
  }
  return out
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
