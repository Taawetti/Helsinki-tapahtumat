// Jaetun tapahtumalinkin (/e/[id]) data → sovelluksen Event-olio.
//
// Sivu hakee tapahtuman suoraan lähteestä (LinkedEvents, Ticketmaster,
// festivaalit) omaan EventPageData-muotoonsa, ja sovellus (HomeShell
// initialEvent → EventDetailPanel) tarvitsee saman olion kuin /api/events
// antaa. Muunnos on täällä PUHTAANA ja testattuna, jotta jaettu tapahtuma
// näyttää paneelissa täsmälleen samalta kuin sovelluksen sisältä avattu:
// sama id (Jaa → sama /e/-linkki, "Lisää suunnitelmaan" tunnistaa saman),
// sama kategoriakarsinta ja sama luokittelu.

import type { Event } from './types'
import { normalizeHelsinkiTimestamp } from './helsinki-time'
import { getEventVibes } from './event-classify'

/** Alkanut tapahtuma on "ohi" tämän jälkeen — sama 3 h -sääntö kuin koosteessa. */
const KAYNNISSA_MS = 3 * 3_600_000

export interface EventPageData {
  title: string
  shortDescription: string
  description: string
  startTime: string
  endTime: string | null
  image: string | null
  isFree: boolean
  price: string | null
  ticketUrl: string | null
  infoUrl: string | null
  categories: string[]
  venue: string
  address: string
  city: string
  lat?: number
  lon?: number
  isPast: boolean
  /** LinkedEventsin yso-avainsanat — sovelluksen luokittelun pääsignaali. */
  ysoIds?: string[]
}

/** Lähde id-etuliitteestä — samat arvot kuin /api/events antaa. */
export function lahdeIdsta(id: string): string {
  if (id.startsWith('tm-')) return 'ticketmaster'
  if (id.startsWith('festival-')) return 'festival'
  return 'linked-events'
}

export function toEvent(id: string, d: EventPageData): Event {
  // Sama tuplakarsinta ja enimmäismäärä kuin /api/events: LinkedEvents antaa
  // saman avainsanan toisinaan kahdesti ("Musiikki","Musiikki").
  const nahty = new Set<string>()
  const categories = d.categories
    .filter(Boolean)
    .filter((c) => { const k = c.toLowerCase(); if (nahty.has(k)) return false; nahty.add(k); return true })
    .slice(0, 4)
  const onPaikka = !!(d.venue || d.address || (d.lat != null && d.lon != null))
  const pohja: Event = {
    id,
    title: d.title,
    shortDescription: d.shortDescription,
    description: d.description,
    // Vyöhykkeetön aikaleima (Ticketmaster, festivaalit) saa Helsingin
    // offsetin: muuten palvelin (UTC) ja selain näyttäisivät eri kellonajan
    // ja hydraatio rikkoutuisi.
    startTime: normalizeHelsinkiTimestamp(d.startTime) ?? d.startTime,
    endTime: d.endTime ? (normalizeHelsinkiTimestamp(d.endTime) ?? d.endTime) : null,
    location: onPaikka
      ? { name: d.venue, streetAddress: d.address, city: d.city || 'Helsinki', ...(d.lat != null && d.lon != null ? { lat: d.lat, lon: d.lon } : {}) }
      : null,
    image: d.image,
    isFree: d.isFree,
    price: d.price,
    ticketUrl: d.ticketUrl,
    infoUrl: d.infoUrl,
    categories,
    source: lahdeIdsta(id),
    ...(d.ysoIds?.length ? { ysoIds: d.ysoIds } : {}),
  }
  // Luokittelu kerran palvelimella kuten /api/events — paneelin
  // kategoriamerkki ja tunnelmat ovat samat kuin sovelluksen sisällä.
  return { ...pohja, vibes: getEventVibes(pohja) }
}

/** Käänteinen muunnos: koosteen tai tilannekuvan Event → sivun metatiedot,
 *  JSON-LD ja SEO-osio. */
export function eventToPageData(e: Event, nyt = Date.now()): EventPageData {
  const alku = Date.parse(e.startTime)
  const loppu = e.endTime ? Date.parse(e.endTime) : alku + KAYNNISSA_MS
  return {
    title: e.title,
    shortDescription: e.shortDescription ?? '',
    description: e.description ?? '',
    startTime: e.startTime,
    endTime: e.endTime ?? null,
    image: e.image ?? null,
    isFree: !!e.isFree,
    price: e.price ?? null,
    ticketUrl: e.ticketUrl ?? null,
    infoUrl: e.infoUrl ?? null,
    categories: e.categories ?? [],
    venue: e.location?.name ?? '',
    address: e.location?.streetAddress ?? '',
    city: e.location?.city || 'Helsinki',
    lat: e.location?.lat,
    lon: e.location?.lon,
    isPast: !Number.isNaN(alku) && !Number.isNaN(loppu) && loppu < nyt,
    ...(e.ysoIds?.length ? { ysoIds: e.ysoIds } : {}),
  }
}

/** Vyöhykkeettömät aikaleimat Helsingin offsetiin (ks. toEvent). */
export function normalisoiAjat(e: Event): Event {
  return {
    ...e,
    startTime: normalizeHelsinkiTimestamp(e.startTime) ?? e.startTime,
    endTime: e.endTime ? (normalizeHelsinkiTimestamp(e.endTime) ?? e.endTime) : null,
  }
}

/** Jakolinkin tunniste: lähteiden id-muodot (kirjaimet, numerot, : _ . -),
 *  ei polkumerkkejä eikä välilyöntejä. */
export function kelpoJakoId(id: string): boolean {
  return /^[A-Za-z0-9_:.-]{3,160}$/.test(id)
}

/** Jakolinkin päivä YYYY-MM-DD, oikea kalenteripäivä. */
export function kelpoPaiva(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const t = new Date(`${d}T12:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d
}

/** Tapahtuma koosteesta tunnisteella. */
export function etsiTapahtuma(events: Event[], id: string): Event | null {
  return events.find((e) => e.id === id) ?? null
}
