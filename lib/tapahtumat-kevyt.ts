// KEVYT TAPAHTUMAMUOTO KARTALLE (30.10.2026).
//
// Kartta hakee KUUKAUDEN tapahtumat, jotta päivävalinta kartalla toimii ilman
// uutta hakua. Täysi kuukausipaketti oli mitatusti 4 012 tapahtumaa, 4,4 Mt
// JSONia ja 1,2 Mt verkossa — siitä 1,9 Mt oli kuvaustekstejä, joita kartta
// ei piirrä, ja neljänneksellä tapahtumista ei ollut koordinaatteja. 4G:llä
// lataus kesti yli 6 s ja puhelin jäsensi 4,4 Mt ennen kuin "Haetaan…"
// sammui. Kevyt muoto: vain koordinaatilliset tapahtumat ilman kuvauksia —
// mitattu 1,7 Mt JSONia, 0,29 Mt verkossa (neljäsosa).
//
// Kevyt rivi on muuten täysi Event (otsikko, aika, paikka, kuva, hinta,
// linkit, kategoriat, vibes), joten kortit ja kartan pinnit toimivat
// sellaisenaan. Vain infopaneeli tarvitsee kuvauksen: kevyt-lippu kertoo
// sille täydentää rivi päiväikkunan haulla (hooks/useTaydennettyTapahtuma).
// /api/events?…&kentat=kartta palauttaa tämän muodon; lib/events-fetch
// lisää parametrin kuukausi-ikkunaan automaattisesti.

import type { Event } from './types'

/** Hakuparametrin `kentat` arvo kevyelle karttamuodolle. */
export const KENTAT_KARTTA = 'kartta'

/** Täysi lista → kartan kevyt lista. Puhdas funktio: ei muuta syötettä. */
export function kevennaKartalle(events: Event[]): Event[] {
  const out: Event[] = []
  for (const e of events) {
    const lat = e.location?.lat
    const lon = e.location?.lon
    if (typeof lat !== 'number' || typeof lon !== 'number') continue
    out.push({ ...e, description: '', shortDescription: '', kevyt: true })
  }
  return out
}

/** Paneelin täydennys: täyden rivin kentät voittavat kevyen, lippu poistuu. */
export function taydennaKevyt(kevyt: Event, taysi: Event): Event {
  const yhdistetty: Event = { ...kevyt, ...taysi }
  delete yhdistetty.kevyt
  return yhdistetty
}
