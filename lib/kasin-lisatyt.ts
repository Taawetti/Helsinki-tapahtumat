// Käsin lisätyt tapahtumat (data/kasin-lisatyt.json).
//
// MIKSI. Ilmoituslomakkeen ehdotukset tulevat sähköpostiin, ja tähän asti ne
// päätyivät sovellukseen vain jos jokin lähde sattui listaamaan saman
// tapahtuman. Ensimmäinen tapaus 27.11.2026: Britallica Lepakkomiehessä
// 15.10.2027 — paikan oma listasivu näyttää vain ~3 viikkoa eteenpäin, joten
// Lepakkomiehen skraperi löytäisi sen vasta syksyllä 2027.
//
// MITEN SE KULKEE:
//  - /api/kasin on tavallinen ulkoinen lähde (lib/lahdevarasto ULKOISET_LAHTEET),
//    joten tapahtuma näkyy listoissa, haussa ja kartalla sovelluksen omalla
//    aikaikkunalla eikä yhtään aiemmin — kaukana tulevaisuudessa oleva
//    tapahtuma ilmestyy listoihin itsestään kun ikkuna tavoittaa sen.
//  - Tapahtumalla on OMA indeksoitava sivu /e/oma-… heti (lib/event-links
//    hasOwnEventPage, app/e/[id]/jaettu-sivu getEventData) ja se on
//    sivukartalla. Jakolinkki toimii siis heti lisäyksestä.
//  - Kun jokin lähde myöhemmin listaa saman illan, /api/events yhdistää rivit
//    (sama paikka + alkuminuutti, lib/sama-esitys). Tämä lähde on listan
//    ENSIMMÄINEN, joten käsin tarkistetut tiedot voittavat.
//
// TUNNISTE: "oma-<nimi>-<YYYYMMDD>". Etuliite erottaa sen kaikista lähteiden
// tunnisteista; yhdysmerkki ja pienet kirjaimet kelpaavat jakolinkkiin
// (lib/event-page kelpoJakoId).

import type { Event } from './types'
import data from '../data/kasin-lisatyt.json'

export const KASIN_ETULIITE = 'oma-'

interface KasinRivi extends Omit<Event, 'source' | 'vibes'> {
  /** Lisäyspäivä, vain ylläpitoa varten. */
  lisatty?: string
  /** Mistä tieto tuli ja miten se tarkistettiin. Ei näy käyttäjälle. */
  lahde?: string
  muistiinpano?: string
}

function tapahtumaksi(r: KasinRivi): Event {
  // Ylläpitokentät pois: ne eivät kuulu käyttäjälle lähtevään riviin.
  const { lisatty: _l, lahde: _s, muistiinpano: _m, ...e } = r
  return { ...e, source: 'kasin' }
}

/** Kaikki käsin lisätyt tapahtumat, myös menneet. */
export const KASIN_LISATYT: Event[] = (data as { tapahtumat: KasinRivi[] }).tapahtumat.map(tapahtumaksi)

export function onKasinTunniste(id: string): boolean {
  return id.startsWith(KASIN_ETULIITE)
}

export function kasinTapahtuma(id: string): Event | null {
  return KASIN_LISATYT.find((e) => e.id === id) ?? null
}

/** Tapahtumat joiden alku osuu väliin [alkuMs, loppuMs). */
export function kasinValilla(alkuMs: number, loppuMs: number): Event[] {
  return KASIN_LISATYT.filter((e) => {
    const t = new Date(e.startTime).getTime()
    return !Number.isNaN(t) && t >= alkuMs && t < loppuMs
  })
}

/** Tulevat (alkamattomat) tapahtumat sivukartalle. */
export function kasinTulevat(nyt = Date.now()): Event[] {
  return KASIN_LISATYT.filter((e) => new Date(e.startTime).getTime() > nyt)
}
