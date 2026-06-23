import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ShareButton from '@/components/ShareButton'
import { supabase, DbFestival } from '@/lib/supabase'
import { FESTIVALS_STATIC, fromDb, FestivalDef } from '@/lib/festivals-data'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'
const LE_BASE = 'https://api.hel.fi/linkedevents/v1'
const TM_KEY = process.env.TICKETMASTER_API_KEY

// ── Unified event data shape ────────────────────────────────────────────────

interface EventPageData {
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
}

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
  keywords?: { name: { fi?: string; en?: string } }[]
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
      image: e.images?.[0]?.url ?? null,
      isFree,
      price: isFree ? null : (offer?.price?.fi || null),
      ticketUrl: offer?.info_url?.fi || offer?.info_url?.en || null,
      infoUrl: e.info_url?.fi || e.info_url?.en || null,
      categories: (e.keywords || []).map((k) => k.name?.fi || k.name?.en || '').filter(Boolean).slice(0, 5),
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
    const image = e.images?.find((i) => i.ratio === '16_9' && (i.width ?? 0) >= 640)?.url ?? e.images?.[0]?.url ?? null
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
    image: fest.image,
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fi-FI', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
}

// ── Metadata ────────────────────────────────────────────────────────────────

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const event = await getEventData(id)
  if (!event) return { title: 'Tapahtuma ei löydy' }

  const startDate = new Date(event.startTime).toLocaleDateString('fi-FI')
  const title = `${event.title} – ${startDate}`
  const desc = event.shortDescription || event.description.slice(0, 160) || `${event.title} – ${event.venue} – Helsinki`
  const pageUrl = `${BASE}/e/${encodeURIComponent(id)}`

  return {
    title,
    description: desc,
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

export default async function EventPage({ params }: Props) {
  const { id } = await params
  const event = await getEventData(id)
  if (!event) notFound()

  const pageUrl = `${BASE}/e/${encodeURIComponent(id)}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.shortDescription || event.description.slice(0, 300),
    startDate: event.startTime,
    ...(event.endTime ? { endDate: event.endTime } : {}),
    eventStatus: event.isPast
      ? 'https://schema.org/EventPostponed'
      : 'https://schema.org/EventScheduled',
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
            ...(event.price ? { price: event.price } : {}),
            ...(event.ticketUrl ? { url: event.ticketUrl } : {}),
            availability: event.isPast ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm mb-6 inline-block">
            ← Kaikki tapahtumat
          </Link>

          {event.image && (
            <div className="rounded-xl overflow-hidden mb-6 aspect-video">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.image} alt={event.title} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="space-y-4">
            {event.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {event.isFree && (
                  <span className="bg-emerald-900/60 text-emerald-300 text-xs font-semibold px-3 py-1 rounded-full">
                    Ilmainen
                  </span>
                )}
                {event.categories.map((cat) => (
                  <span key={cat} className="bg-blue-900/40 text-blue-300 text-xs px-2 py-1 rounded-full">
                    {cat}
                  </span>
                ))}
              </div>
            )}

            <h1 className="text-2xl font-bold leading-tight">{event.title}</h1>

            {event.isPast && (
              <p className="text-amber-400 text-sm font-medium">Tapahtuma on päättynyt</p>
            )}

            <div className="space-y-1 text-gray-300">
              <p className="text-lg capitalize">
                📅 {formatDate(event.startTime)} klo {formatTime(event.startTime)}
                {event.endTime && ` – ${formatTime(event.endTime)}`}
              </p>
              {event.venue && (
                <p>
                  📍 {event.venue}
                  {event.address && <span className="text-gray-500">, {event.address}</span>}
                  {event.city && event.city !== 'Helsinki' && (
                    <span className="text-gray-500">, {event.city}</span>
                  )}
                </p>
              )}
              {event.price && !event.isFree && (
                <p className="text-gray-400">💶 {event.price}</p>
              )}
            </div>

            {(event.shortDescription || event.description) && (
              <p className="text-gray-300 leading-relaxed">
                {event.shortDescription || event.description.slice(0, 600)}
              </p>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              {event.ticketUrl && !event.isPast && (
                <a
                  href={event.ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  Osta liput
                </a>
              )}
              {event.infoUrl && event.infoUrl !== event.ticketUrl && (
                <a
                  href={event.infoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-gray-800 hover:bg-gray-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
                >
                  Lisätietoja
                </a>
              )}
              <ShareButton title={event.title} url={pageUrl} />
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
