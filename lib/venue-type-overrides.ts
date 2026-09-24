// Paikan tyypin nimipohjainen pakotus — voittaa OSM:n amenity-tagin ja
// kuratoidun listan. OSM:n tagi on joskus väärin eikä korjaus kartalle asti
// ole meidän käsissämme. Rivi lisätään VAIN kun omistaja on todennut tyypin
// vääräksi. Avain = nimi pienellä ja trimmattuna (sama kuin rikastuksen avain).

import type { Restaurant } from './types'

export const TYPE_OVERRIDES: Record<string, Restaurant['type']> = {
  // OSM: bar → oikeasti ruokaravintola (omistaja 4.9.2026: "se on ravintola
  // ja hyvä sellainen"); Googlen kategoria samaa mieltä ("Ravintola").
  'basbas kulma': 'ravintola',
  // Keikkapaikat eivät ole yökerhoja (omistaja 24.9.2026: "Tavastia ei ole
  // yökerho eikä Semifinaalikaan — näissä on livekeikkoja"). OSM tagaa ne
  // amenity=nightclub, ja "Baari ja yökerho" -runko ehdotti Tavastiaa
  // yökerhoksi. Keikat tulevat pakkaan omina tapahtumakortteina.
  'tavastia klubi': 'baari',
  'tavastia': 'baari',
  'semifinal': 'baari',
  'g livelab': 'baari',
  'apollo live club': 'baari',
}

/** Pakotettu tyyppi nimelle, tai undefined kun nimeä ei ole listalla. */
export function pakotettuTyyppi(name: string): Restaurant['type'] | undefined {
  return TYPE_OVERRIDES[name.toLowerCase().trim()]
}

/** Lipulliset keikkapaikat: sinne ei mennä "drinkille" ilman keikkaa, joten
 *  ne eivät kelpaa illan runkojen baari-/yökerhoaskeleeksi (mitattu 24.9.2026:
 *  "John Scott's → Tavastia Klubi" olisi ollut myöhäisen illallisen baari).
 *  Keikat tulevat pakkaan omina tapahtumakortteina. */
const KEIKKAPAIKAT = new Set(['tavastia klubi', 'tavastia', 'semifinal', 'g livelab', 'apollo live club'])
export function onKeikkapaikka(name: string): boolean {
  return KEIKKAPAIKAT.has(name.toLowerCase().trim())
}
