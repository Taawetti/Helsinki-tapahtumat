// Kartan päiväsuodatin. Omassa tiedostossaan, koska säännöt ovat samat kuin
// listan päivärivillä (lib/utils getDateRange) ja niissä on reunatapauksia
// jotka pitää lukita testeillä — MapView on client-komponentti eikä sitä voi
// importata testiskriptiin (leaflet).
//
// Vertailu tehdään HELSINKI-kalenteripäivinä ('YYYY-MM-DD' merkkijonoina):
// laitteen vuorokausirajoilla esim. New Yorkissa "Tänään" oli kahden
// Helsinki-päivän sekoitus.

import { helsinkiDateOf, helsinkiToday } from './helsinki-time'

export type DateFilterKey = 'today' | 'tonight' | 'tomorrow' | 'weekend' | 'week' | 'month' | 'custom'

/** Illan alkutunti — sama kuin listalla (getDateRange 'tonight' startAfter). */
export const ILTA_ALKAA = 17

const HKI_TUNTI = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Helsinki', hour: '2-digit', hourCycle: 'h23',
})

/** Päiväsiirto Helsinki-päivissä. Keskipäivä UTC → DST-turvallinen. */
export function paivaPlus(paiva: string, n: number): string {
  return new Date(Date.parse(`${paiva}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}

/** Viikonlopun lauantai ja sunnuntai. Sama sääntö kuin listalla: SUNNUNTAINA
 *  viikonloppu on edellinen lauantai + tänään, ei seuraava viikonloppu —
 *  muuten sunnuntaina "Viikonloppu" hyppäisi kuuden päivän päähän. */
export function viikonlopunPaivat(tanaan: string): [string, string] {
  const vp = new Date(`${tanaan}T12:00:00Z`).getUTCDay()   // 0 = sunnuntai
  const siirtoLauantaille = vp === 0 ? -1 : vp === 6 ? 0 : 6 - vp
  const la = paivaPlus(tanaan, siirtoLauantaille)
  return [la, paivaPlus(la, 1)]
}

/** Osuuko tapahtuma kartan päivävalintaan. `tanaan` on annettavissa testejä
 *  varten; tuotannossa se tulee helsinkiToday()-kutsusta. */
export function osuuPaivaan(
  alkuISO: string,
  filter: DateFilterKey,
  customDate: string,
  tanaan: string = helsinkiToday(),
): boolean {
  const d = helsinkiDateOf(alkuISO)
  switch (filter) {
    case 'today':    return d === tanaan
    case 'tonight':  return d === tanaan && Number(HKI_TUNTI.format(new Date(alkuISO))) >= ILTA_ALKAA
    case 'tomorrow': return d === paivaPlus(tanaan, 1)
    case 'weekend': {
      const [la, su] = viikonlopunPaivat(tanaan)
      return d >= la && d <= su
    }
    case 'week':     return d >= tanaan && d < paivaPlus(tanaan, 7)
    case 'month':    return d >= tanaan && d < paivaPlus(tanaan, 30)
    case 'custom':   return !customDate || d === customDate
  }
}
