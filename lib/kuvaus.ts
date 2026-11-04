// Yhden tapahtuman kuvaus tunnisteella — kartan kevyen rivin täydennys
// (omistaja 3.11.2026). Kevyt kuukausipaketti (lib/tapahtumat-kevyt) tulee
// ilman kuvaustekstejä; kun pinni avataan, paneeli haki aiemmin KOKO päivän
// koosteen (/api/events?start=P&end=P) saadakseen yhden kuvauksen — kylmänä
// 5–8 s, koska LinkedEventsin päiväsivu kestää 2,7–3,5 s (mitattu 30.10.2026).
// Tämä moduuli hakee vain sen yhden tapahtuman:
//   - LinkedEvents-tunniste ("helsinki:agqa74rrka", "kulke:…") → tapahtuma
//     LinkedEventsin omasta osoitteesta, ~0,3 s.
//   - Muut tunnisteet (stadissa-37901, kide-…, tm-…) → lähdevaraston rivi
//     (lib/lahdevarasto), jossa päivän palan tapahtumat ovat jo tallessa.
// Vastaus on SAMA kuvaus kuin koosteessa: sama kielijärjestys, samat
// korjaukset (data/tapahtumakorjaukset.json) ja sama entiteettien purku.
// Puhtaat osat täällä (testattavissa), verkko ja Supabase reitissä
// app/api/kuvaus. hooks/useTaydennettyTapahtuma käyttää tätä ensin ja
// päiväikkunaa vain varalla.

import type { Event } from './types'
import { decodeHtmlEntities } from './utils'
import { naytettavaKuvaus } from './event-text'
import { sovellaTapahtumakorjaukset, type Korjattava, type Tapahtumakorjaus } from './tapahtumakorjaukset'

export const KUVAUS_POLKU = '/api/kuvaus'

const PAIVA_RE = /^\d{4}-\d{2}-\d{2}$/

/** LinkedEvents-tunniste: datalähde, kaksoispiste, tunnus. Etuliite on
 *  pelkkiä kirjaimia kuten lib/event-links hasOwnEventPage -säännössä, mutta
 *  tunnusosassa sallitaan yhdysviiva: hko:2-4361 on oikea LinkedEvents-
 *  tapahtuma (todettu tuotannosta 3.11.2026, data_source hko). Skraperien
 *  omat tunnisteet käyttävät yhdysviivaa etuliitteessä (stadissa-37901,
 *  museum-lippupiste:…), eivätkä ne löydy LinkedEventsistä. */
export function onLinkedEventsId(id: string): boolean {
  return /^[a-z_]+:[a-z0-9][a-z0-9-]*$/i.test(id)
}

export function kuvausParams(id: string, paiva: string): URLSearchParams {
  return new URLSearchParams({ id, d: paiva })
}

export interface KuvausPyynto { id: string; paiva: string }

/** Kelpuuttaa pyynnön: tunniste 1–200 merkkiä ilman välilyöntejä ja
 *  ohjausmerkkejä, päivä YYYY-MM-DD (lähdevaraston palan valintaan). */
export function kelpoKuvausPyynto(id: string | null, paiva: string | null): KuvausPyynto | null {
  if (!id || !paiva) return null
  if (id.length > 200 || /[\s\u0000-\u001f]/.test(id)) return null
  if (!PAIVA_RE.test(paiva)) return null
  return { id, paiva }
}

export interface KuvausVastaus { id: string; description: string; shortDescription: string; descriptionEn?: string }

/** LinkedEventsin raakatapahtuman kentät, joita kuvaus ja korjauksen osuma
 *  (otsikko + päivä + paikka) tarvitsevat. */
export interface LeKuvausRaaka {
  id: string
  name?: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  description?: { fi?: string; en?: string }
  start_time: string
  location?: { name?: { fi?: string; en?: string } } | null
}

export type Kuvattava = Korjattava & { id: string }

/** Sama mäppäys kuin koosteen normalize (app/api/events): otsikko fi → en → sv,
 *  kuvaukset fi → en, paikan nimi fi → en. */
export function kuvattavaLeRaakadatasta(raw: LeKuvausRaaka): Kuvattava {
  return {
    id: raw.id,
    title: raw.name?.fi || raw.name?.en || raw.name?.sv || 'Nimetön tapahtuma',
    shortDescription: raw.short_description?.fi || raw.short_description?.en || '',
    description: raw.description?.fi || raw.description?.en || '',
    startTime: raw.start_time,
    location: raw.location ? { name: raw.location.name?.fi || raw.location.name?.en || '' } : null,
  }
}

/** Lähdevaraston tapahtuma kuvattavaksi — Event täyttää Korjattavan. */
export function kuvattavaTapahtumasta(e: Event): Kuvattava {
  return e
}

/** Korjaukset ja entiteettien purku kuten koosteen vastauksen reunalla —
 *  paneeli näyttää saman tekstin riippumatta siitä, kumpaa reittiä se tuli.
 *  HTML-tagit jätetään kuten koosteessa: paneeli riisuu ne näyttäessään.
 *
 *  null, kun lähteellä ei ole näytettävää kuvausta (tyhjä tai skraperin
 *  "@ Paikka" -placeholder, lib/event-text naytettavaKuvaus): silloin reitti
 *  vastaa 404 ja paneeli käyttää päivän koostetta, jonka dedupe on voinut
 *  täydentää kuvauksen toisesta lähteestä (stadissa-115191 tuotannossa
 *  3.11.2026: oma kuvaus tyhjä, kooste 116 merkkiä toiselta lähteeltä). */
export function kuvausVastaus(e: Kuvattava, korjaukset: readonly Tapahtumakorjaus[]): KuvausVastaus | null {
  const korjattu = sovellaTapahtumakorjaukset([e], korjaukset)[0]
  if (naytettavaKuvaus(korjattu) === null) return null
  return {
    id: e.id,
    description: decodeHtmlEntities(korjattu.description ?? ''),
    shortDescription: decodeHtmlEntities(korjattu.shortDescription ?? ''),
    // Korjauksen englanninkielinen teksti kulkee kevyen rivin täydennykseen
    // (hooks/useTaydennettyTapahtuma), jotta kartalta avattu paneeli näyttää
    // saman kuin listasta avattu.
    ...(korjattu.descriptionEn ? { descriptionEn: decodeHtmlEntities(korjattu.descriptionEn) } : {}),
  }
}
