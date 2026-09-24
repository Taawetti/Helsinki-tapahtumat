// Kevyt toast-varasto (HANDOFF-mobiili.md §5): "✓ Lisätty suunnitelmaan" +
// Näytä-nappi ruudun alareunaan, alapalkin yläpuolelle.
//
// MODUULITASON VARASTO, EI KONTEKSTI. Lisäys tapahtuu paneeleista
// (EventDetailPanel, RestaurantDetailPanel, PlaceDetailPanel), jotka
// renderöityvät eri puolilla puuta — osa RestaurantsView'n ja
// SuunnitelmaView'n SISÄLLÄ. Yksi varasto + useSyncExternalStore on sama
// malli kuin lib/suunnitelma: paneelit vain kutsuvat naytaToast(), ja
// HomeClientin ToastHost piirtää sen ja hoitaa Näytä-toiminnon (sulkee
// paneelit vaihtamalla osiota).
//
// Toiminto on TUNNISTE eikä callback: paneeli ei tiedä miten Suunnitelma-
// välilehti avataan (se on HomeClientin tila), joten se pyytää vain
// "näytä suunnitelma" ja isäntä päättää mitä se tarkoittaa.

export type ToastToiminto = 'nayta-suunnitelma'

export interface Toast {
  id: number
  teksti: string
  toiminto?: { label: string; tyyppi: ToastToiminto }
}

let nykyinen: Toast | null = null
let laskuri = 0
const tilaajat = new Set<() => void>()

function ilmoita(): void {
  for (const cb of tilaajat) cb()
}

export function naytaToast(t: Omit<Toast, 'id'>): void {
  laskuri += 1
  nykyinen = { ...t, id: laskuri }
  ilmoita()
}

export function piilotaToast(id?: number): void {
  if (!nykyinen) return
  // Vanhentunut ajastin ei saa sulkea UUTTA toastia: id tarkistetaan.
  if (id !== undefined && nykyinen.id !== id) return
  nykyinen = null
  ilmoita()
}

export function tilaaToast(cb: () => void): () => void {
  tilaajat.add(cb)
  return () => tilaajat.delete(cb)
}

export function lueToast(): Toast | null {
  return nykyinen
}

export function lueToastServer(): Toast | null {
  return null
}
