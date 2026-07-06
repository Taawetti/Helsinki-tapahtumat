import { unstable_cache } from 'next/cache'
import type { Event } from '@/lib/types'
import { fetchImagesCached, getEventImage } from '@/lib/venue-images'

// Minimal LinkedEvents types needed for normalization
interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  start_time: string
  end_time?: string
  images?: { url: string }[]
  location?: {
    name?: { fi?: string; en?: string }
    street_address?: { fi?: string; en?: string }
    address_locality?: { fi?: string; en?: string }
    position?: { coordinates: [number, number] }
  }
  offers?: { is_free: boolean; price?: { fi?: string; en?: string }; info_url?: { fi?: string; en?: string } }[]
  keywords?: { name: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

function normalize(raw: LEEvent): Event {
  const loc = raw.location
  const offer = raw.offers?.[0]
  return {
    id: raw.id,
    title: raw.name?.fi || raw.name?.en || raw.name?.sv || 'Nimetön tapahtuma',
    shortDescription: raw.short_description?.fi || raw.short_description?.en || '',
    description: '',
    startTime: raw.start_time,
    endTime: raw.end_time || null,
    location: loc ? {
      name: loc.name?.fi || loc.name?.en || '',
      streetAddress: loc.street_address?.fi || loc.street_address?.en || '',
      city: loc.address_locality?.fi || loc.address_locality?.en || 'Helsinki',
      lat: loc.position?.coordinates?.[1],
      lon: loc.position?.coordinates?.[0],
    } : null,
    image: raw.images?.[0]?.url ?? null,
    isFree: offer?.is_free ?? false,
    price: offer?.is_free ? null : (offer?.price?.fi || offer?.price?.en || null),
    ticketUrl: offer?.info_url?.fi || offer?.info_url?.en || null,
    infoUrl: raw.info_url?.fi || raw.info_url?.en || null,
    categories: (raw.keywords || []).map(k => k.name?.fi || k.name?.en || '').filter(Boolean).slice(0, 4),
    source: 'linked-events',
  }
}

async function _fetchLinkedEventsQuick(date: string): Promise<{ events: Event[]; total: number }> {
  const params = new URLSearchParams({
    format: 'json',
    start: date,
    end: date,
    page: '1',
    page_size: '50',
    include: 'location,keywords',
    sort: 'start_time',
    language: 'fi',
    division: 'helsinki',
  })

  try {
    const res = await fetch(`https://api.hel.fi/linkedevents/v1/event/?${params}`, {
      next: { revalidate: 300, tags: ['events'] },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { events: [], total: 0 }

    const data = await res.json()
    let events: Event[] = (data.data ?? []).map(normalize)

    // Same post-fetch filter as events route — LinkedEvents can return long-running events
    // (e.g. "Sep 23 – Dec 23") whose startTime is outside today's range.
    events = events.filter(e => e.startTime.slice(0, 10) === date)

    // Apply venue images — same logic as events route handler
    const { venues: venueMap } = await fetchImagesCached()
    for (const e of events) {
      if (!e.image) {
        const fallback = getEventImage(e.location?.name, e.categories, venueMap, {})
        if (fallback) e.image = fallback
      }
    }

    return { events, total: events.length }
  } catch {
    return { events: [], total: 0 }
  }
}

export const fetchInitialEvents = unstable_cache(
  _fetchLinkedEventsQuick,
  ['initial-events-v1'],
  { revalidate: 300, tags: ['events'] },
)
