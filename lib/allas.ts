// Allas Live -keikat allaspool.fi:n WordPress-rajapinnasta — PUHDAS muunnos.
//
// TUOTANTOVIKA 18.9.2026 (omistajan kaveri): Karri Koiran Allas Live -keikka
// ei näkynyt Illan nostoissa eikä Keikoissa. Syy: tämä lähde luki
// `al-events`-sisältötyyppiä, jossa on vain 2025-kausi. Allas siirsi
// 2026-kauden tyyppiin `asp_event` (REST: /wp/v2/events), jossa keikka on
// rakenteisena: acf.title "Allas Live", acf.subtitle = ARTISTI, acf.end_date
// = YYYYMMDD, featured_media = kuva, acf.link = allaslive.fi-sivu. Mitattu
// 23.9.2026: kauden 15 keikkaa kuvineen olivat kaikki siellä — sovellukseen
// tuli vain stadissan nimirivi "Karri Koira" ilman kuvaa ja kategoriaa, jota
// luokittelija ei voi tunnistaa keikaksi.
//
// KELLONAIKA: rajapinta antaa vain päivän ("Pe 18.9. | Sisäpiha"). Käytetään
// Allas Liven vakioaikaa klo 19 lipulla startTimeApprox — dedup ottaa
// silloin stadissan OIKEAN kellonajan (lib/types startTimeApprox).

import type { Event } from './types'
import { helsinkiISO } from './helsinki-time'
import { decodeHtmlEntities } from './utils'

export const ALLAS_EVENTS_API =
  'https://www.allaspool.fi/wp-json/wp/v2/events?per_page=100&_fields=id,title,link,acf,featured_media'

export interface AspEvent {
  id: number
  title: { rendered: string }
  link: string
  featured_media?: number
  acf?: {
    title?: string
    subtitle?: string
    end_date?: string
    description?: string
    link?: { url?: string; title?: string } | string | false
  }
}

const ALLAS_LIVE = /allas\s*live/i

/** "20260918" → "2026-09-18", muu → null. */
export function parseAllasDate(s: string | undefined): string | null {
  if (!s || !/^\d{8}$/.test(s)) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

const riisu = (s: string) => decodeHtmlEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/** Onko rivi Allas Live -keikka (ei jäsenilta, uintikurssi tms.)? Englannin-
 *  kieliset kaksoisrivit (/en/) karsitaan — sama keikka tulisi kahtena. */
export function onAllasLiveKeikka(e: AspEvent): boolean {
  if (/\/en\//.test(e.link ?? '')) return false
  return ALLAS_LIVE.test(e.acf?.title ?? '') || ALLAS_LIVE.test(e.title?.rendered ?? '')
}

export function mapAspEvent(e: AspEvent, image: string | null): Event | null {
  const date = parseAllasDate(e.acf?.end_date)
  if (!date) return null
  const artisti = riisu(e.acf?.subtitle ?? '')
  const title = artisti || riisu(e.title?.rendered ?? '')
  if (!title) return null
  const lava = riisu(e.acf?.description ?? '').split('|').pop()?.trim() ?? ''
  const linkki = typeof e.acf?.link === 'object' && e.acf.link ? e.acf.link.url : undefined
  return {
    id: `allas-${e.id}`,
    title,
    // Lyhytkuvaus on aito lause, EI paikan nimi placeholderina (lib/event-text).
    shortDescription: `Allas Live — ulkoilmakeikka Katajanokalla${lava && !/^\w{2}\s+\d/.test(lava) ? `, ${lava.toLowerCase()}` : ''}`,
    description: '',
    startTime: helsinkiISO(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)), 19, 0),
    startTimeApprox: true,
    endTime: null,
    location: { name: 'Allas Sea Pool', streetAddress: 'Katajanokanlaituri 2a', city: 'Helsinki', lat: 60.1674, lon: 24.9565 },
    image,
    isFree: false,
    price: null,
    // allaslive.fi ei ole lippukauppa (lib/tickets) → nappi on "Lue lisää",
    // ei katteeton "Osta liput".
    ticketUrl: null,
    infoUrl: linkki || e.link,
    // Täsmätokenit: 'konsertit' ja 'live-musiikki' → luokittelija keikka ja
    // hero-portin ohjelmatyyppi keikka (event-classify SOURCE_CAT_VIBES,
    // PROGRAM_CAT).
    categories: ['konsertit', 'live-musiikki', 'Allas Live'],
    source: 'allas',
  }
}
