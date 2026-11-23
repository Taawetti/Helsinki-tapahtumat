// Tapahtumapaikkojen Instagram-tilit somevideoiden saatteeseen
// (scripts/somevideo/tee-video.ts): merkitty paikka näkee videon ja voi jakaa sen.
//
// MIKSI KÄSIN YLLÄPIDETTY TAULUKKO. Tapahtumadata (LinkedEvents, skraperit) ei
// kerro paikan tiliä, ja OSM-tagi on harvalla: mitattu 18.11.2026 ravintola-
// aineistosta 95/3584 paikkaa, eikä Tavastialla, On the Rocksilla, Kaiulla tai
// Storyvillellä ole tagia. lib/socials.ts vain siistii osoitteita.
//
// SÄÄNTÖ: tili lisätään vain, kun se on löytynyt paikan OMALTA sivulta (tai
// OSM-tagista, joka täsmää sivuun). Ei koskaan arvata nimestä: väärä merkintä
// vie liikenteen vieraalle tilille, puuttuva vain jättää merkinnän pois.
//
// Avain on location.name pienillä kirjaimilla; osuma, kun paikan nimi sisältää
// avaimen ("Bar Loose" ja "Bar Loose, Annankatu" → barloose).

export interface PaikanTili {
  avain: string
  tili: string
  /** Mistä tili tarkistettiin ja milloin. */
  lahde: string
}

export const PAIKKOJEN_INSTAGRAM: PaikanTili[] = [
  { avain: 'ääniwalli', tili: 'aaniwalli', lahde: 'aaniwalli.fi + OSM-tagi, 18.11.2026' },
  { avain: 'on the rocks', tili: 'ontherockshelsinki', lahde: 'rocks.fi, 18.11.2026' },
  { avain: 'bar loose', tili: 'barloose', lahde: 'barloose.com, 18.11.2026' },
]

/** Paikan Instagram-käyttäjänimi ilman @-merkkiä, tai null. */
export function paikanInstagram(paikka: string | null | undefined): string | null {
  const n = (paikka ?? '').toLowerCase().trim()
  if (!n) return null
  return PAIKKOJEN_INSTAGRAM.find((p) => n.includes(p.avain))?.tili ?? null
}
