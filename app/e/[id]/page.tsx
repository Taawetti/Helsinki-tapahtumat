import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ShareButton from '@/components/ShareButton'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'
const LE_BASE = 'https://api.hel.fi/linkedevents/v1'

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
  offers?: {
    is_free: boolean
    price?: { fi?: string }
    info_url?: { fi?: string; en?: string }
  }[]
  info_url?: { fi?: string; en?: string }
  keywords?: { name: { fi?: string; en?: string } }[]
}

async function getEvent(id: string): Promise<LEEvent | null> {
  try {
    const res = await fetch(`${LE_BASE}/event/${encodeURIComponent(id)}/`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fi-FI', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
}

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) return { title: 'Tapahtuma ei löydy' }

  const title = event.name?.fi || event.name?.en || 'Tapahtuma'
  const desc = event.short_description?.fi || event.short_description?.en ||
    event.description?.fi?.slice(0, 160) || ''
  const image = event.images?.[0]?.url
  const startDate = event.start_time ? new Date(event.start_time).toLocaleDateString('fi-FI') : ''
  const venueName = event.location?.name?.fi || event.location?.name?.en || ''

  return {
    title: `${title}${startDate ? ` – ${startDate}` : ''}`,
    description: desc || `${title} – ${venueName} – Helsinki tapahtumat`,
    openGraph: {
      title,
      description: desc,
      type: 'website',
      locale: 'fi_FI',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    alternates: {
      canonical: `${BASE}/e/${id}`,
    },
  }
}

export default async function EventPage({ params }: Props) {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()

  const title = event.name?.fi || event.name?.en || 'Tapahtuma'
  const desc = (event.description?.fi || event.description?.en || '').replace(/<[^>]+>/g, '')
  const shortDesc = event.short_description?.fi || event.short_description?.en || ''
  const image = event.images?.[0]?.url
  const venueName = event.location?.name?.fi || event.location?.name?.en || ''
  const address = event.location?.street_address?.fi || event.location?.street_address?.en || ''
  const city = event.location?.address_locality?.fi || 'Helsinki'
  const offer = event.offers?.[0]
  const isFree = offer?.is_free ?? false
  const price = isFree ? 'Ilmainen' : (offer?.price?.fi || null)
  const ticketUrl = offer?.info_url?.fi || offer?.info_url?.en || event.info_url?.fi || event.info_url?.en
  const keywords = (event.keywords || []).map((k) => k.name?.fi || k.name?.en || '').filter(Boolean)

  const coords = event.location?.position?.coordinates
  const lat = coords?.[1]
  const lon = coords?.[0]

  // schema.org/Event JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: title,
    description: shortDesc || desc.slice(0, 300),
    startDate: event.start_time,
    ...(event.end_time ? { endDate: event.end_time } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: venueName || city,
      address: {
        '@type': 'PostalAddress',
        streetAddress: address,
        addressLocality: city,
        addressCountry: 'FI',
      },
      ...(lat && lon ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lon } } : {}),
    },
    ...(image ? { image } : {}),
    ...(isFree
      ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } }
      : {
        offers: {
          '@type': 'Offer',
          ...(price ? { price, priceCurrency: 'EUR' } : {}),
          ...(ticketUrl ? { url: ticketUrl } : {}),
          availability: 'https://schema.org/InStock',
        },
      }),
    organizer: { '@type': 'Organization', name: venueName || 'Helsinki tapahtumat' },
    url: `${BASE}/e/${id}`,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm mb-6 inline-block">
            ← Kaikki tapahtumat
          </Link>

          {image && (
            <div className="rounded-xl overflow-hidden mb-6 aspect-video">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={title} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="space-y-4">
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {keywords.map((k) => (
                  <span key={k} className="bg-blue-900/50 text-blue-300 text-xs px-2 py-1 rounded-full">{k}</span>
                ))}
              </div>
            )}

            <h1 className="text-2xl font-bold">{title}</h1>

            <div className="space-y-2 text-gray-300">
              {event.start_time && (
                <p className="text-lg capitalize">
                  {formatDate(event.start_time)} klo {formatTime(event.start_time)}
                  {event.end_time && ` – ${formatTime(event.end_time)}`}
                </p>
              )}
              {venueName && (
                <p>
                  {venueName}
                  {address && <span className="text-gray-500">, {address}</span>}
                </p>
              )}
              {price !== null && (
                <p className={isFree ? 'text-green-400 font-medium' : 'text-gray-300'}>
                  {isFree ? 'Ilmainen' : price}
                </p>
              )}
            </div>

            {(shortDesc || desc) && (
              <p className="text-gray-300 leading-relaxed">{shortDesc || desc.slice(0, 600)}</p>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              {ticketUrl && (
                <a
                  href={ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  Osta liput
                </a>
              )}
              <ShareButton title={title} url={`${BASE}/e/${id}`} />
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
