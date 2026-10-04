// Idea-sivun "Kiinnostaa"-lista (omistaja 28.9.2026: "jos olen kiinnostunut
// tapahtumasta, sen ei tarvitse heti mennä suosikiksi"). Kiinnostava kohde
// kertyy Idea-sivun omaan listaan, josta käyttäjä avaa kortin ja lisää sen
// ITSE suunnitelmaan tai suosikkeihin. Lista elää laitteella (localStorage),
// kuten suosikit — koko kohde tallennetaan, jotta kortin voi avata ilman
// uutta hakua.
//
// PUHDAS moduuli: säilö injektoidaan (testit scripts/test-categories.ts),
// ei React-riippuvuuksia.

import type { Event } from './types'
import { tuntematonAika } from './utils'

export const KIINNOSTAVAT_AVAIN = 'idea-kiinnostavat-v1'
export const KIINNOSTAVAT_MAX = 30
/** Kiinnostavat-listan elementti-id Idea-sivulla: toastin "Näytä"
 *  (HomeClientin ToastHost → 'nayta-kiinnostavat') vierittää tähän. */
export const KIINNOSTAVAT_ELEMENTTI_ID = 'idea-kiinnostavat'
/** Alkanut tapahtuma pysyy listalla vielä tämän verran — sama 3 h
 *  "käynnissä"-sääntö kuin Idea-pakassa (lib/idea-deck). */
const KAYNNISSA_MS = 3 * 60 * 60 * 1000

/** Listalle tallennettava kohde — IdeaView'n Suggestion on tämän ylijoukko. */
export interface KiinnostavaKohde {
  id: string
  type: 'event' | 'activity'
  title: string
  image: string | null
  emoji: string
  time?: string
  address?: string
  eventRef?: Event
}

export interface Kiinnostava<K extends KiinnostavaKohde = KiinnostavaKohde> {
  id: string
  /** Päivä (YYYY-MM-DD, Helsinki) jota kohde koskee: tapahtuman päivä,
   *  paikalle (sauna, näköala) lisäyspäivä. */
  paiva: string
  /** Lisäyshetki (ms) — enimmäismäärän ylittyessä vanhin lisäys putoaa. */
  lisatty: number
  kohde: K
}

export interface Sailo {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Aikajärjestys: päivä → kellonaika (ajattomat paikat päivän viimeisiksi) → lisäysjärjestys. */
export function jarjestaKiinnostavat<K extends KiinnostavaKohde>(lista: Kiinnostava<K>[]): Kiinnostava<K>[] {
  return [...lista].sort((a, b) =>
    a.paiva.localeCompare(b.paiva)
    || (a.kohde.time || '99').localeCompare(b.kohde.time || '99')
    || a.lisatty - b.lisatty)
}

/** Lisää kohteen listalle (sama id vain kerran). Ajasta riippuvat kentät
 *  ("Auki nyt", "alkaa 20 min") EIVÄT säily: ne ovat tallennushetken tietoa
 *  ja listalta avattuna vanhentuneita. */
export function lisaaKiinnostava<K extends KiinnostavaKohde>(
  lista: Kiinnostava<K>[], kohde: K, paiva: string, nyt = Date.now(),
): Kiinnostava<K>[] {
  if (lista.some((k) => k.id === kohde.id)) return lista
  const { isOpen: _auki, minutesUntil: _min, ...pysyva } = kohde as K & { isOpen?: boolean; minutesUntil?: number }
  void _auki; void _min
  const kaikki = [...lista, { id: kohde.id, paiva, lisatty: nyt, kohde: pysyva as K }]
  // Enimmäismäärä: vanhin LISÄYS putoaa — ei aikajärjestyksen viimeinen,
  // muuten juuri lisätty tuleva tapahtuma katoaisi heti.
  const rajattu = kaikki.length > KIINNOSTAVAT_MAX
    ? [...kaikki].sort((a, b) => b.lisatty - a.lisatty).slice(0, KIINNOSTAVAT_MAX)
    : kaikki
  return jarjestaKiinnostavat(rajattu)
}

export function poistaKiinnostava<K extends KiinnostavaKohde>(lista: Kiinnostava<K>[], id: string): Kiinnostava<K>[] {
  return lista.filter((k) => k.id !== id)
}

/** Pudottaa menneet: eiliset ja aiemmat päivät sekä tapahtumat, joiden
 *  alusta on yli 3 h. Ajattoman tapahtuman (tuntematonAika) päivä ratkaisee. */
export function siivoaKiinnostavat<K extends KiinnostavaKohde>(
  lista: Kiinnostava<K>[], tanaan: string, nyt = Date.now(),
): Kiinnostava<K>[] {
  return lista.filter((k) => {
    if (k.paiva < tanaan) return false
    const alku = k.kohde.eventRef?.startTime
    if (alku && !tuntematonAika(alku)) {
      const ms = Date.parse(alku)
      if (!Number.isNaN(ms) && ms + KAYNNISSA_MS < nyt) return false
    }
    return true
  })
}

/** Lukee listan säilöstä; rikkinäinen tai vieras sisältö → tyhjä lista. */
export function lueKiinnostavat<K extends KiinnostavaKohde>(sailo: Sailo): Kiinnostava<K>[] {
  try {
    const raw = sailo.getItem(KIINNOSTAVAT_AVAIN)
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter((k): k is Kiinnostava<K> =>
      !!k && typeof k === 'object'
      && typeof (k as Kiinnostava).id === 'string'
      && typeof (k as Kiinnostava).paiva === 'string'
      && typeof (k as Kiinnostava).lisatty === 'number'
      && !!(k as Kiinnostava).kohde && typeof (k as Kiinnostava).kohde.title === 'string')
  } catch {
    return []
  }
}

export function tallennaKiinnostavat(sailo: Sailo, lista: Kiinnostava[]): void {
  try { sailo.setItem(KIINNOSTAVAT_AVAIN, JSON.stringify(lista)) } catch { /* privaattitila / säilö täynnä */ }
}
