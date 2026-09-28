import type { Metadata } from 'next'
import { onMaksunkeruuUrl, hasOwnEventPage } from '@/lib/event-links'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import HomeShell from '@/components/HomeShell'
import type { Event } from '@/lib/types'
import { toEvent, eventToPageData, kelpoJakoId, kelpoPaiva, type EventPageData } from '@/lib/event-page'
import { haeKoosteesta, julkinenOsoite, lueJaettuTilannekuva } from '@/lib/jaettu-tapahtuma'
import { extractYsoIds } from '@/lib/event-classify'
import { supabase, DbFestival } from '@/lib/supabase'
import { FESTIVALS_STATIC, fromDb, FestivalDef } from '@/lib/festivals-data'
import { jsonLdHtml } from '@/lib/json-ld'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'
const LE_BASE = 'https://api.hel.fi/linkedevents/v1'
const TM_KEY = process.env.TICKETMASTER_API_KEY

// ── Unified event data shape: lib/event-page (EventPageData + toEvent) ──────

// ── Source-specific fetchers ────────────────────────────────────────────────

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  description?: { fi?: string; en?: string }
  start_time: string
  end_time?: string
  images?: { url: string }[]
  location?: {
    name?: { fi?: string; en?: string }
    street_address?: { fi?: string; en?: string }
    address_locality?: { fi?: string; en?: string }
    position?: { coordinates: [number, number] }
  }
  offers?: { is_free: boolean; price?: { fi?: string }; info_url?: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
  keywords?: { '@id'?: string; name: { fi?: string; en?: string } }[]
}

async function fetchLinkedEvent(id: string): Promise<EventPageData | null> {
  const decodedId = decodeURIComponent(id)
  try {
    const res = await fetch(`${LE_BASE}/event/${encodeURIComponent(decodedId)}/`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const e: LEEvent = await res.json()
    const offer = e.offers?.[0]
    const isFree = offer?.is_free ?? false
    const loc = e.location
    const coords = loc?.position?.coordinates
    const shortDescription = e.short_description?.fi || e.short_description?.en || ''
    const rawDesc = e.description?.fi || e.description?.en || ''
    const desc = rawDesc.replace(/<[^>]+>/g, '')
    return {
      title: e.name?.fi || e.name?.en || e.name?.sv || 'Tapahtuma',
      shortDescription,
      description: desc,
      startTime: e.start_time,
      endTime: e.end_time || null,
      // http → https: sekasisältö estyisi selaimessa (kulke-lähde).
      image: (e.images?.[0]?.url ?? null)?.replace(/^http:\/\//, 'https://') ?? null,
      isFree,
      price: isFree ? null : (offer?.price?.fi || null),
      ticketUrl: (() => {
        const u = offer?.info_url?.fi || offer?.info_url?.en || null
        return onMaksunkeruuUrl(u) ? null : u
      })(),
      infoUrl: e.info_url?.fi || e.info_url?.en || null,
      categories: (e.keywords || []).map((k) => k.name?.fi || k.name?.en || '').filter(Boolean).slice(0, 5),
      ysoIds: extractYsoIds(e.keywords),
      venue: loc?.name?.fi || loc?.name?.en || '',
      address: loc?.street_address?.fi || loc?.street_address?.en || '',
      city: loc?.address_locality?.fi || 'Helsinki',
      lat: coords?.[1],
      lon: coords?.[0],
      isPast: new Date(e.start_time) < new Date(),
    }
  } catch {
    return null
  }
}

interface TMEvent {
  id: string
  name: string
  dates?: { start?: { dateTime?: string; localDate?: string; localTime?: string } }
  info?: string
  description?: string
  images?: { url: string; ratio?: string; width?: number }[]
  url?: string
  priceRanges?: { min?: number; max?: number; currency?: string }[]
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[]
  _embedded?: { venues?: { name?: string; address?: { line1?: string }; city?: { name?: string }; location?: { latitude?: string; longitude?: string } }[] }
}

async function fetchTicketmasterEvent(tmId: string): Promise<EventPageData | null> {
  if (!TM_KEY) return null
  try {
    const res = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(tmId)}.json?apikey=${TM_KEY}`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) },
    )
    if (!res.ok) return null
    const e: TMEvent = await res.json()
    const venue = e._embedded?.venues?.[0]
    const image = (e.images?.find((i) => i.ratio === '16_9' && (i.width ?? 0) >= 640)?.url ?? e.images?.[0]?.url ?? null)?.replace(/^http:\/\//, 'https://') ?? null
    const startISO = e.dates?.start?.dateTime
      ?? (e.dates?.start?.localDate ? `${e.dates.start.localDate}T${e.dates.start.localTime ?? '19:00:00'}` : null)
    if (!startISO) return null
    const price = e.priceRanges?.[0]
    const isFree = price ? (price.min === 0 && price.max === 0) : false
    const genre = e.classifications?.[0]?.genre?.name ?? ''
    const segment = e.classifications?.[0]?.segment?.name ?? ''
    return {
      title: e.name,
      shortDescription: e.info ?? '',
      description: e.description ?? e.info ?? '',
      startTime: startISO,
      endTime: null,
      image,
      isFree,
      price: price && !isFree ? `${price.min}–${price.max} ${price.currency ?? '€'}` : null,
      ticketUrl: e.url ?? null,
      infoUrl: e.url ?? null,
      categories: [genre, segment].filter((c) => c && c !== 'Undefined'),
      venue: venue?.name ?? '',
      address: venue?.address?.line1 ?? '',
      city: venue?.city?.name ?? 'Helsinki',
      lat: venue?.location?.latitude ? parseFloat(venue.location.latitude) : undefined,
      lon: venue?.location?.longitude ? parseFloat(venue.location.longitude) : undefined,
      isPast: new Date(startISO) < new Date(),
    }
  } catch {
    return null
  }
}

async function getFestDef(festId: string): Promise<FestivalDef | null> {
  if (supabase) {
    try {
      const { data } = await supabase.from('festivals').select('*').eq('id', festId).eq('active', true).single()
      if (data) return fromDb(data as DbFestival)
    } catch { /* käytetään staattista */ }
  }
  return FESTIVALS_STATIC.find((f) => f.id === festId) ?? null
}

async function fetchFestivalEvent(id: string): Promise<EventPageData | null> {
  // id = "festival-{festId}-{YYYY-MM-DD}"
  const dateMatch = id.match(/^festival-(.+)-(\d{4}-\d{2}-\d{2})$/)
  if (!dateMatch) return null
  const [, festId, date] = dateMatch
  const fest = await getFestDef(festId)
  if (!fest) return null
  const startTime = `${date}T${fest.time || '12:00'}:00`
  return {
    title: fest.name,
    shortDescription: fest.description || fest.name,
    description: fest.description || '',
    startTime,
    endTime: null,
    image: fest.image?.replace(/^http:\/\//, 'https://') ?? fest.image,
    isFree: fest.isFree,
    price: null,
    ticketUrl: fest.ticketUrl || null,
    infoUrl: fest.infoUrl || null,
    categories: fest.categories,
    venue: fest.venueName,
    address: fest.address,
    city: fest.city,
    isPast: new Date(startTime) < new Date(),
  }
}

// ── Router — React cache() deduplicates calls within one request lifecycle ──

const getEventData = cache(async (id: string): Promise<EventPageData | null> => {
  const decoded = decodeURIComponent(id)
  if (decoded.startsWith('tm-')) return fetchTicketmasterEvent(decoded.slice(3))
  if (decoded.startsWith('festival-')) return fetchFestivalEvent(decoded)
  if (decoded.startsWith('rss-') || decoded.startsWith('recurring-')) return null
  return fetchLinkedEvent(decoded)
})

// ── Helpers ─────────────────────────────────────────────────────────────────

// timeZone pakollinen: Vercel renderöi UTC:ssä, ilman sitä joka kellonaika
// näkyi 3 h liian aikaisin ja keskiyön tapahtumilla päiväkin oli väärä
// (mitattu tuotannosta 5.9.2026: LinkedEvents start 17:00Z näkyi "klo 17.00",
// oikea Helsinki-aika 20.00).
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fi-FI', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Europe/Helsinki',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fi-FI', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki',
  })
}

// ── Metadata ────────────────────────────────────────────────────────────────

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

// ── Ratkaisu: oma lähdesivu → jakohetken tilannekuva → kooste (?d=) ────────
// Jakolinkki vie AINA sovellukseen (omistaja 28.9.2026), myös skrapattujen
// lähteiden tapahtumille, joita ei voi hakea tunnisteella lähteestä:
//  1. LinkedEvents/Ticketmaster/festivaali: tuore data suoraan lähteestä.
//  2. Jakohetken tilannekuva (jaetut_tapahtumat, app/api/jaa-tapahtuma).
//  3. Sovelluksen oma kooste jakolinkin päivälle (?d=YYYY-MM-DD).
// Vain 1. on indeksoitava sivu: 2–3 ovat jaettuja linkkejä, eikä Googlen
// pidä ryömiä koostehakuja laukaisevia osoitteita (palvelinkuorma).
interface Ratkaistu { data: EventPageData; ev: Event; oma: boolean }

const ratkaise = cache(async (rawId: string, d: string): Promise<Ratkaistu | null> => {
  const id = decodeURIComponent(rawId)
  if (!kelpoJakoId(id)) return null
  if (hasOwnEventPage({ id })) {
    const data = await getEventData(rawId)
    if (data) return { data, ev: toEvent(id, data), oma: true }
  }
  const tilannekuva = await lueJaettuTilannekuva(id)
  if (tilannekuva) return { data: eventToPageData(tilannekuva), ev: tilannekuva, oma: false }
  if (kelpoPaiva(d)) {
    const h = await headers()
    const ev = await haeKoosteesta(julkinenOsoite(h.get('x-forwarded-host') ?? h.get('host')), d, id)
    if (ev) return { data: eventToPageData(ev), ev, oma: false }
  }
  return null
})

async function paivaParametri(searchParams: Props['searchParams']): Promise<string> {
  const sp = await searchParams
  return typeof sp?.d === 'string' ? sp.d : ''
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params
  const r = await ratkaise(id, await paivaParametri(searchParams))
  if (!r) return { title: 'Tapahtumaa ei löydy' }
  const { data: event, oma } = r

  const startDate = new Date(event.startTime).toLocaleDateString('fi-FI', { timeZone: 'Europe/Helsinki' })
  const title = `${event.title} – ${startDate}`
  const desc = event.shortDescription || event.description.slice(0, 160)
    || [event.title, event.venue, 'Helsinki'].filter(Boolean).join(' – ')
  // params-id on jo prosenttikoodattu → dekoodaus ensin, muuten ':' päätyy
  // muotoon %253A ja canonical/JSON-LD-url eroavat oikeasta osoitteesta.
  const pageUrl = `${BASE}/e/${encodeURIComponent(decodeURIComponent(id))}`

  return {
    title,
    description: desc,
    // Mennyt tapahtuma ei kuulu hakemistoon — sivu jäi aiemmin 200:ksi ja
    // indeksoitavaksi ikuisesti (auditointi 5.9.2026). Sivu pysyy avattavana
    // (vanha jaettu linkki toimii), mutta Google ohjataan pois. Sama
    // tilannekuvasta/koosteesta ratkaistulle jaetulle linkille (ks. ratkaise).
    ...(event.isPast || !oma ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical: pageUrl },
    openGraph: {
      title: event.title,
      description: desc,
      type: 'website',
      locale: 'fi_FI',
      url: pageUrl,
      ...(event.image ? { images: [{ url: event.image, width: 1200, height: 630, alt: event.title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: event.title,
      description: desc,
      ...(event.image ? { images: [event.image] } : {}),
    },
  }
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function EventPage({ params, searchParams }: Props) {
  const { id } = await params
  const r = await ratkaise(id, await paivaParametri(searchParams))
  if (!r) notFound()
  // Sovelluksen oma olio: sama id kuin /api/events antaa, joten paneelin
  // "Jaa" tuottaa saman linkin ja "Lisää suunnitelmaan" tunnistaa saman.
  const { data: event, ev } = r

  const pageUrl = `${BASE}/e/${encodeURIComponent(decodeURIComponent(id))}`
  const isolla = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.shortDescription || event.description.slice(0, 300),
    startDate: event.startTime,
    ...(event.endTime ? { endDate: event.endTime } : {}),
    // Mennyt tapahtuma on suoritettu, ei lykätty/peruttu — status pysyy Scheduled.
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: event.venue || event.city,
      address: {
        '@type': 'PostalAddress',
        streetAddress: event.address,
        addressLocality: event.city,
        addressCountry: 'FI',
      },
      ...(event.lat && event.lon
        ? { geo: { '@type': 'GeoCoordinates', latitude: event.lat, longitude: event.lon } }
        : {}),
    },
    ...(event.image ? { image: event.image } : {}),
    ...(event.isFree
      ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } }
      : {
          offers: {
            '@type': 'Offer',
            // schema.org vaatii numerisen hinnan + valuutan — vapaatekstistä
            // ("15 €", "10–20 EUR") poimitaan johtava numero, muuten jätetään pois
            ...(() => {
              const m = event.price?.replace(',', '.').match(/\d+(\.\d+)?/)
              return m ? { price: Number(m[0]), priceCurrency: 'EUR' } : {}
            })(),
            ...(event.ticketUrl ? { url: event.ticketUrl } : {}),
            // availability vain tulevalle: mennyt ei ole "loppuunmyyty" —
            // se on ohi, eikä väärä saatavuustieto kuulu dataan.
            ...(event.isPast ? {} : { availability: 'https://schema.org/InStock' }),
          },
        }),
    organizer: { '@type': 'Organization', name: event.venue || 'Helsinki tapahtumat' },
    url: pageUrl,
    inLanguage: 'fi',
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: event.title, item: pageUrl },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />
      {/* Sovellusnäkymä, tapahtuman infopaneeli VALMIIKSI auki — sama näkymä
          kuin lähettäjällä. Erillinen sivu poistui 28.9.2026 (omistaja:
          jaetusta linkistä pitää olla hyvin pieni kynnys alkaa käyttää
          sovellusta): siitä pääsi sovellukseen vain "← Kaikki tapahtumat"
          -linkistä. Kun vastaanottaja sulkee paneelin, hän on etusivulla. */}
      <HomeShell initialEvent={ev} />

      {/* Sivun oma sisältö hakukoneelle ja ilman JavaScriptiä avaavalle —
          samat tiedot kuin paneelissa, sovelluksen alla kuten muillakin
          laskeutumissivuilla. H1 vain ruudunlukijoille: paneeli näyttää
          otsikon jo, eikä kahta näkyvää otsikkoa haluta. */}
      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">{event.title}</h1>
        <p className="text-sm text-white/35 leading-relaxed">
          📅 {isolla(formatDate(event.startTime))} klo {formatTime(event.startTime)}
          {event.endTime && ` – ${formatTime(event.endTime)}`}
          {event.venue && ` · 📍 ${event.venue}${event.address ? `, ${event.address}` : ''}`}
          {event.price && !event.isFree && ` · 💶 ${event.price}`}
          {event.isFree && ' · Ilmainen'}
          {event.isPast && ' · Tapahtuma on päättynyt'}
        </p>
        {(event.shortDescription || event.description) && (
          <p className="mt-3 text-sm text-white/35 leading-relaxed">
            {event.shortDescription || event.description.slice(0, 600)}
          </p>
        )}
        {(event.ticketUrl || event.infoUrl) && (
          <p className="mt-3 text-[13px] text-white/40">
            {event.ticketUrl && !event.isPast && (
              <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70">Osta liput</a>
            )}
            {event.ticketUrl && !event.isPast && event.infoUrl && event.infoUrl !== event.ticketUrl && ' · '}
            {event.infoUrl && event.infoUrl !== event.ticketUrl && (
              <a href={event.infoUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70">Lisätietoja</a>
            )}
          </p>
        )}
      </section>
    </>
  )
}
