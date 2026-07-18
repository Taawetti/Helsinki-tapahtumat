import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { VENUE_PAGES, type VenuePage } from '@/lib/venue-pages'
import { helsinkiDateRange, helsinkiOffset, formatEventDate } from '@/lib/helsinki-time'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

interface PageEvent {
  id: string
  title: string
  startTime: string
  isFree: boolean
  price: string | null
  ticketUrl: string | null
  image: string | null
  /** LinkedEvents ids (contain ':') get an internal /e/[id] page; scraped rows link out */
  internal: boolean
}

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  start_time: string
  images?: { url: string }[]
  offers?: { is_free: boolean; price?: { fi?: string }; info_url?: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

async function fetchTprekEvents(tprekId: string): Promise<PageEvent[]> {
  const { start, end } = helsinkiDateRange(60)
  const params = new URLSearchParams({
    location: tprekId, format: 'json', start, end,
    page_size: '100', sort: 'start_time', include: 'location',
  })
  try {
    const res = await fetch(`https://api.hel.fi/linkedevents/v1/event/?${params}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    // LinkedEvents `start=` matches events still ONGOING at that date, so
    // long-running series (started weeks ago) surface first — drop past starts
    // like app/api/events does, with a 24h grace for tonight's events.
    const cutoff = new Date(start).getTime() - 24 * 60 * 60 * 1000
    return ((data.data || []) as LEEvent[])
      .filter((raw) => new Date(raw.start_time).getTime() >= cutoff)
      .map((raw) => {
        const offer = raw.offers?.[0]
        const isFree = offer?.is_free ?? false
        return {
          id: raw.id,
          title: raw.name?.fi || raw.name?.en || raw.name?.sv || 'Tapahtuma',
          startTime: raw.start_time,
          isFree,
          price: isFree ? null : (offer?.price?.fi || null),
          ticketUrl: offer?.info_url?.fi || offer?.info_url?.en || raw.info_url?.fi || null,
          image: raw.images?.[0]?.url || null,
          internal: true,
        }
      })
  } catch {
    return []
  }
}

async function fetchScrapedEvents(venueId: string): Promise<PageEvent[]> {
  if (!supabase) return []
  // Helsinki calendar dates + DST-aware offset — a UTC server's own date
  // flips to "yesterday" between 00-03 Helsinki time and would resurface
  // last night's gigs as upcoming.
  const { start, end } = helsinkiDateRange(60)
  const offset = helsinkiOffset(new Date())
  const { data, error } = await supabase
    .from('scraped_events')
    .select('id, title, start_datetime, image_url, is_free, price_info, ticket_url')
    .eq('venue_id', venueId)
    .gte('start_datetime', `${start}T00:00:00${offset}`)
    .lte('start_datetime', `${end}T23:59:59${offset}`)
    .order('start_datetime', { ascending: true })
  if (error || !data) return []
  return data.map((row) => ({
    id: String(row.id),
    title: row.title as string,
    startTime: row.start_datetime as string,
    isFree: Boolean(row.is_free),
    price: (row.price_info as string) ?? null,
    ticketUrl: (row.ticket_url as string) ?? null,
    image: (row.image_url as string) ?? null,
    internal: false,
  }))
}

async function fetchVenueEvents(venue: VenuePage): Promise<PageEvent[]> {
  const events = venue.tprekId
    ? await fetchTprekEvents(venue.tprekId)
    : venue.scrapedId
    ? await fetchScrapedEvents(venue.scrapedId)
    : []
  return events.slice(0, 60)
}

type Props = { params: Promise<{ venue: string }> }

export async function generateStaticParams() {
  return VENUE_PAGES.map((v) => ({ venue: v.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { venue: slug } = await params
  const venue = VENUE_PAGES.find((v) => v.slug === slug)
  if (!venue) return {}
  const desc = `${venue.name} ohjelma: tulevat keikat ja tapahtumat. ${venue.description}`
  return {
    title: `${venue.name} ohjelma & keikat | Mitä tänään Helsinki`,
    description: desc,
    alternates: { canonical: `${BASE}/ohjelma/${slug}` },
    openGraph: { title: `${venue.name} — ohjelma`, description: desc, locale: 'fi_FI', type: 'website', url: `${BASE}/ohjelma/${slug}` },
  }
}

export default async function OhjelmaSivu({ params }: Props) {
  const { venue: slug } = await params
  const venue = VENUE_PAGES.find((v) => v.slug === slug)
  if (!venue) notFound()

  const events = await fetchVenueEvents(venue)

  const venuePlaceLd = {
    '@context': 'https://schema.org',
    '@type': venue.schemaType,
    name: venue.name,
    address: { '@type': 'PostalAddress', streetAddress: venue.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
    ...(venue.www ? { url: venue.www } : {}),
  }

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${venue.name} — ohjelma`,
    url: `${BASE}/ohjelma/${slug}`,
    numberOfItems: events.length,
    itemListElement: events.slice(0, 15).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: e.title,
        startDate: e.startTime,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: venue.name,
          address: { '@type': 'PostalAddress', streetAddress: venue.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
        },
        ...(e.isFree
          ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }
          : e.ticketUrl
          ? { offers: { '@type': 'Offer', url: e.ticketUrl, priceCurrency: 'EUR' } }
          : {}),
        ...(e.internal ? { url: `${BASE}/e/${encodeURIComponent(e.id)}` } : e.ticketUrl ? { url: e.ticketUrl } : {}),
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Ohjelma', item: `${BASE}/ohjelma/${slug}` },
      { '@type': 'ListItem', position: 3, name: venue.name, item: `${BASE}/ohjelma/${slug}` },
    ],
  }

  // Event row: LinkedEvents ids get internal detail pages; scraped rows
  // link straight to the venue's ticket page (no /e/[id] route for them).
  const EventInner = ({ e }: { e: PageEvent }) => (
    <>
      {e.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.image} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug">
          {e.title}
        </h2>
        <p className="text-sm text-gray-400 mt-1">{formatEventDate(e.startTime)}</p>
      </div>
      <div className="flex-shrink-0 self-center">
        {e.isFree ? (
          <span className="text-green-400 text-xs font-medium">Ilmainen</span>
        ) : e.price ? (
          <span className="text-gray-400 text-xs">{e.price}</span>
        ) : null}
      </div>
    </>
  )

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(venuePlaceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-gray-500 mb-6 flex items-center gap-2">
            <Link href="/" className="hover:text-gray-300 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-gray-300">Ohjelma</span>
            <span>/</span>
            <span className="text-white">{venue.name}</span>
          </nav>

          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">🎸 {venue.name} — ohjelma</h1>
            <p className="text-gray-400 mb-3">
              {events.length > 0 ? `${events.length} tulevaa tapahtumaa` : 'Tulevat tapahtumat'} · {venue.address}
            </p>
            <p className="text-sm text-gray-500 leading-relaxed">{venue.description}</p>
            {venue.www && (
              <a href={venue.www} target="_blank" rel="noopener noreferrer"
                className="inline-block mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                {venue.www.replace(/^https?:\/\//, '')} ↗
              </a>
            )}
          </div>

          {/* Other venues */}
          <div className="mb-8">
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Muut keikkapaikat</p>
            <div className="flex flex-wrap gap-2">
              {VENUE_PAGES.filter((v) => v.slug !== slug).map((v) => (
                <Link key={v.slug} href={`/ohjelma/${v.slug}`}
                  className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">
                  {v.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Event list */}
          {events.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">🎸</p>
              <p>Ei tulevia tapahtumia listattuna juuri nyt.</p>
              {venue.www && (
                <a href={venue.www} target="_blank" rel="noopener noreferrer"
                  className="mt-4 inline-block text-blue-400 hover:text-blue-300 text-sm">
                  Katso {venue.name}n oma sivu ↗
                </a>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id}>
                  {e.internal ? (
                    <Link href={`/e/${encodeURIComponent(e.id)}`}
                      className="flex items-start gap-3 bg-gray-900 hover:bg-gray-800 rounded-xl p-4 transition-colors group">
                      <EventInner e={e} />
                    </Link>
                  ) : e.ticketUrl ? (
                    <a href={e.ticketUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-3 bg-gray-900 hover:bg-gray-800 rounded-xl p-4 transition-colors group">
                      <EventInner e={e} />
                    </a>
                  ) : (
                    <div className="flex items-start gap-3 bg-gray-900 rounded-xl p-4 group">
                      <EventInner e={e} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10 pt-6 border-t border-gray-800">
            <Link href="/" className="text-blue-400 hover:text-blue-300 transition-colors text-sm">
              ← Kaikki Helsinki tapahtumat
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
