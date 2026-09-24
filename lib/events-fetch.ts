// Tapahtumahaun kaksi vaihetta RINNAKKAIN + armonaika, ja hakuavaimen
// rakentaminen yhdestä paikasta.
//
// ONGELMA (omistaja 24.9.2026, kuvakaappaus Viikonloppu → Stand up "· 3" →
// hetken päästä "· 19"): päivävalinnan vaihto haki ensin PIKAVAIHEEN (vain
// LinkedEvents, vain aikavälin ensimmäinen päivä) ja piirsi sen kuin
// valmiina; TÄYSI haku (46 lähdettä, koko väli) käynnistyi vasta pikavaiheen
// jälkeen ja korvasi listan 0,4–15 s myöhemmin. Mitattu tuotannosta 24.9.:
// täysi haku lämpimänä 0,3–0,7 s (viikko 2,8 s), kylmänä 8–15 s.
//
// RATKAISU TÄSSÄ: molemmat pyynnöt lähtevät samalla hetkellä. Jos täysi
// tulos ehtii ARMONAJASSA (0,8 s), pikatulosta ei näytetä lainkaan — lista
// ilmestyy kerralla oikeana eikä hypi. Muuten pikatulos näytetään väliaikana
// ja käyttöliittymä kertoo että haku on kesken (HomeClient: "Haetaan kaikista
// lähteistä…" + skeleton-kortit), kunnes täysi tulos korvaa sen.
//
// Puhdas funktio ilman Reactia: ajastin ja hakufunktiot annetaan parametrina,
// jotta logiikka on testattavissa ilman selainta (scripts/test-categories.ts).

import { CATEGORIES, type DateFilter } from './types'
import { getDateRange } from './utils'

/** Armonaika: kuinka kauan täyttä tulosta odotetaan ennen pikatuloksen
 *  näyttämistä. Lämpimän täyden haun p95 oli mitatusti alle 0,8 s;
 *  pikahaku itse kesti lämpimänä 0,2–0,8 s, joten tätä pidempi odotus ei
 *  juuri lisäisi "kerralla oikein" -tapauksia mutta viivästyttäisi kylmän
 *  haun ensimmäistä maalausta. */
export const ARMONAIKA_MS = 800

type Tulos<T> = { ok: true; data: T } | { ok: false; error: unknown }

async function turvallisesti<T>(p: () => Promise<T>): Promise<Tulos<T>> {
  try {
    return { ok: true, data: await p() }
  } catch (error) {
    return { ok: false, error }
  }
}

export type VaiheLopputulos =
  /** Täysi tulos ehti armonajassa — pikatulosta ei näytetty. */
  | 'taysi-heti'
  /** Pikatulos näytettiin väliaikana, täysi korvasi sen. */
  | 'pika-sitten-taysi'
  /** Pikahaku epäonnistui, täysi tulos näytettiin kun se saapui. */
  | 'vain-taysi'
  /** Täysi haku epäonnistui — pikatulos jäi näkyviin. */
  | 'vain-pika'
  /** Molemmat epäonnistuivat. */
  | 'epaonnistui'
  /** Haku peruttiin (uusi suodatin) — mitään ei sovellettu perumisen jälkeen. */
  | 'peruttu'

export interface KaksivaiheOpts<T> {
  pika: () => Promise<T>
  taysi: () => Promise<T>
  /** Näytä pikatulos (haku jatkuu → kutsuja asettaa fetchingFull=true). */
  naytaPika: (data: T) => void
  /** Näytä täysi tulos (haku valmis). */
  naytaTaysi: (data: T) => void
  /** Täysi haku epäonnistui pikatuloksen jälkeen — kutsuja lopettaa "haku kesken" -tilan. */
  taysiEpaonnistui: () => void
  /** Kumpikaan ei tuottanut mitään. */
  epaonnistui: (error: unknown) => void
  /** Onko haku peruttu (AbortController) — tarkistetaan ennen jokaista sovellusta. */
  peruttu: () => boolean
  armonaikaMs?: number
  /** Ajastin — testeissä korvattava. */
  odota?: (ms: number) => Promise<void>
}

const oletusOdota = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function haeKahdessaVaiheessa<T>(o: KaksivaiheOpts<T>): Promise<VaiheLopputulos> {
  const odota = o.odota ?? oletusOdota
  const armonaika = o.armonaikaMs ?? ARMONAIKA_MS

  // Molemmat lähtevät heti — ennen tätä täysi haku odotti pikahaun valmistumista.
  const taysiP = turvallisesti(o.taysi)
  const pikaP = turvallisesti(o.pika)

  const eka = await Promise.race([
    taysiP.then((r) => ({ lahde: 'taysi' as const, r })),
    odota(armonaika).then(() => ({ lahde: 'aika' as const })),
  ])
  if (o.peruttu()) return 'peruttu'

  if (eka.lahde === 'taysi' && eka.r.ok) {
    o.naytaTaysi(eka.r.data)
    return 'taysi-heti'
  }

  // Armonaika kului (tai täysi kaatui heti): näytetään pikatulos väliaikana.
  const pika = await pikaP
  if (o.peruttu()) return 'peruttu'
  if (pika.ok) o.naytaPika(pika.data)

  const taysi = await taysiP
  if (o.peruttu()) return 'peruttu'
  if (taysi.ok) {
    o.naytaTaysi(taysi.data)
    return pika.ok ? 'pika-sitten-taysi' : 'vain-taysi'
  }
  if (pika.ok) {
    o.taysiEpaonnistui()
    return 'vain-pika'
  }
  o.epaonnistui(taysi.error ?? pika.error)
  return 'epaonnistui'
}

// ── Hakuavain ────────────────────────────────────────────────────────────────
// Sama rakentaja hakua, välimuistin tarkistusta JA esilatausta varten. Kolme
// erillistä URLSearchParams-rakennusta (fetchEvents, filter-effekti, esilataus)
// eivät saa ajautua eri järjestykseen — muuten esiladattu tulos jää
// käyttämättä, koska avain on eri merkkijono.

export interface HakuAvainOpts {
  dateFilter: DateFilter
  customDate?: string
  customDateEnd?: string
  page: number
  municipality: string
  bbox?: string
  activeCategories?: string[]
}

export function kategoriaAvainsanat(activeCategories: string[] = []): string {
  return activeCategories
    .flatMap((id) => CATEGORIES.find((c) => c.id === id)?.keywords ?? [])
    .join(',')
}

export function tapahtumaHakuParams(o: HakuAvainOpts): URLSearchParams {
  const { start, end, startAfter } = getDateRange(o.dateFilter, o.customDate, o.customDateEnd)
  const params = new URLSearchParams({ start, end, page: String(o.page), municipality: o.municipality })
  if (startAfter) params.set('startAfter', startAfter)
  if (o.bbox) params.set('bbox', o.bbox)
  // keyword EI mene palvelimelle (ks. hooks/useEvents): LinkedEventsin text-haku
  // ei tunne esiintyjänimiä ja pudotti mitatusti koko aineiston.
  const kws = kategoriaAvainsanat(o.activeCategories)
  if (kws) params.set('categories', kws)
  return params
}

/** Esiladattavat naapuri-ikkunat kun etusivun Tänään-haku on valmis:
 *  ne joihin päivächipit vievät ja jotka mahtuvat yhteensä alle 1 MB:iin.
 *  Viikko (1,8 MB, mitattu 24.9.2026) jätetään pois. */
export const ESILADATTAVAT: readonly DateFilter[] = ['tonight', 'tomorrow', 'weekend']

/** CDN:n lämmitys (app/api/warm): ne ikkunat joihin päivächipit vievät.
 *  Sama avainrakentaja kuin selaimen haussa — lämmitetty osoite on merkki
 *  merkiltä sama kuin käyttäjän pyyntö, muuten CDN-osuma ei synny. */
export const LAMMITETTAVAT: readonly DateFilter[] = ['today', 'tonight', 'tomorrow', 'weekend', 'week']

export function lammitettavatParams(municipality = 'helsinki'): { filter: DateFilter; params: URLSearchParams }[] {
  return LAMMITETTAVAT.map((filter) => ({ filter, params: tapahtumaHakuParams({ dateFilter: filter, page: 1, municipality }) }))
}
