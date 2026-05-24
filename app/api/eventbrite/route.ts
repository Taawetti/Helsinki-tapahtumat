import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// Free API key: https://www.eventbrite.com/platform/api
const EB_KEY = process.env.EVENTBRITE_API_KEY

interface EBVenue {
  name?: string
  address?: {
    localized_address_display?: string
    latitude?: string
    longitude?: string
  }
}

interface EBEvent {
  id: string
  name: { text: string }
  description?: { text?: string }
  start: { utc: string }
  end?: { utc: string }
  url: string
  logo?: { url: string }
  is_free: boolean
  ticket_availability?: { minimum_ticket_price?: { display: string } }
  venue?: EBVenue
  category?: { name: string }
}

function normalize(raw: EBEvent): Event {
  const venue = raw.venue
  const location = venue
    ? {
        name: venue.name ?? '',
        streetAddress: venue.address?.localized_address_display ?? '',
        city: 'Helsinki',
        lat: venue.address?.latitude ? parseFloat(venue.address.latitude) : undefined,
        lon: venue.address?.longitude ? parseFloat(venue.address.longitude) : undefined,
      }
    : null

  return {
    id: `eb-${raw.id}`,
    title: raw.name.text,
    shortDescription: raw.description?.text?.slice(0, 160) ?? '',
    description: raw.description?.text ?? '',
    startTime: raw.start.utc,
    endTime: raw.end?.utc ?? null,
    location,
    image: raw.logo?.url ?? null,
    isFree: raw.is_free,
    price: raw.is_free ? null : (raw.ticket_availability?.minimum_ticket_price?.display ?? null),
    ticketUrl: raw.url,
    infoUrl: raw.url,
    categories: raw.category?.name ? [raw.category.name] : [],
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  if (!EB_KEY) {
    return NextResponse.json({ events: [] })
  }

  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword') || ''

  const params = new URLSearchParams({
    'location.address': 'Helsinki, Finland',
    'location.within': '30km',
    'start_date.range_start': `${start}T00:00:00Z`,
    'start_date.range_end': `${end}T23:59:59Z`,
    'expand': 'venue,category,ticket_availability',
    'page_size': '50',
  })
  if (keyword) params.set('q', keyword)

  try {
    const res = await fetch(
      `https://www.eventbriteapi.com/v3/events/search/?${params}`,
      {
        headers: { Authorization: `Bearer ${EB_KEY}` },
        next: { revalidate: 300, tags: ['events'] },
      }
    )
    if (!res.ok) return NextResponse.json({ events: [] })

    const data = await res.json()
    const events: Event[] = (data.events ?? []).map(normalize)
    return NextResponse.json({ events })
  } catch {
    return NextResponse.json({ events: [] })
  }
}
