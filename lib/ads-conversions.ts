// Google Ads -konversiot — sivuston puoli valmiina, tunnukset kytketään
// ympäristömuuttujilla.
//
// TAUSTA (omistaja + mittaus 1.9.2026): kampanja optimoi klikkejä, ja
// Helsinkiin kohdennettukin liikenne avasi tapahtumia 2 %:n tahdilla, kun
// aiemmat kävijät avasivat 34–80 %:n. Google tuo sitä mitä siltä tilataan —
// ilman konversiosignaalia se metsästää halvimpia klikkejä. Konversio-
// TOIMINNOT luodaan mainostajan Google Ads -tilillä (AW-18228871339, tili ei
// ole meidän), ja jokainen saa tunnisteen (conversion label). Tämä moduuli
// ampuu tapahtumat heti kun tunnisteet on asetettu Verceliin — koodia ei
// tarvitse muuttaa enää.
//
// SUOSTUMUS: gtag.js hoitaa Consent Mode v2:n itse — jos käyttäjä ei ole
// hyväksynyt mainosevästeitä, gtag lähettää evästeettömän pingin tai jättää
// lähettämättä. Tänne EI tule omaa suostumustarkistusta: kahdennettu logiikka
// ajautuisi erilleen lib/consentin kanssa (ks. tietosuojaselosteen historia).
//
// KUTSUJA: lib/track.ts:n track() — sama poissulkuketju siis pätee
// (kehityskone, esikatselut, ?notrack=1-laitteet eivät ammu konversioita).

import { ADS_ID } from './consent'
import type { TrackKind } from './track'

// Konversiotunnisteet mainostajan tililtä. Nimi Vercelissä → mikä toiminto.
// Tyhjä/asettamaton = kyseistä konversiota ei ammuta (ei virhettä).
const LABELS: Partial<Record<TrackKind, string | undefined>> = {
  // Tärkein: siirtymä lipunmyyjälle — lähin asia ostoa jonka näemme
  ticket_click: process.env.NEXT_PUBLIC_ADS_CONV_TICKET,
  // Sovelluksen asennus — vahvin sitoutumissignaali
  install: process.env.NEXT_PUBLIC_ADS_CONV_INSTALL,
  // Uutiskirjeen tilaus
  newsletter: process.env.NEXT_PUBLIC_ADS_CONV_NEWSLETTER,
  // Tapahtuman avaus — kevyt sitoutuminen; mainostaja voi käyttää tätä
  // optimointiin kun raskaampia konversioita on vielä vähän
  event_open: process.env.NEXT_PUBLIC_ADS_CONV_EVENT_OPEN,
  // Sitoutunut käynti (lib/engagement): ≥2 avausta tai arvoteko — volyymin
  // (mitattu ~54/kk) ja laadun paras yhdistelmä optimointiin
  engaged: process.env.NEXT_PUBLIC_ADS_CONV_ENGAGED,
}

/** Ampuu Google Ads -konversion jos kyseiselle toiminnolle on asetettu
 *  tunniste. Ei koskaan heitä — mainosmittaus ei saa rikkoa sovellusta. */
export function fireAdsConversion(kind: TrackKind): void {
  try {
    const label = LABELS[kind]
    if (!label || typeof window === 'undefined' || !window.gtag) return
    window.gtag('event', 'conversion', { send_to: `${ADS_ID}/${label}` })
  } catch { /* mainosmittaus ei saa näkyä käyttäjälle */ }
}
