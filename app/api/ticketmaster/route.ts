import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// Get free API key at: developer.ticketmaster.com
const TM_KEY = process.env.TICKETMASTER_API_KEY

interface TMVenue {
  name?: string
  address?: { line1?: string }
  city?: { name?: string }
  location?: { latitude?: string; longitude?: string }
}

interface TMImage {
  url: string
  ratio?: string
  width?: number
}

interface TMPriceRange {
  min?: number
  max?: number
  currency?: string
}

interface TMEvent {
  id: string
  name: string
  dates?: { start?: { dateTime?: string; localDate?: string; localTime?: string } }
  info?: string
  description?: string
  images?: TMImage[]
  url?: string
  priceRanges?: TMPriceRange[]
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[]
  _embedded?: { venues?: TMVenue[] }
}

// Strip ticket tier qualifiers so "Artist | Premium Suite Ticket" → "Artist"
function baseTitle(title: string): string {
  return title
    .replace(/\s*[\|–\-]\s*(premium|legazy|standard|vip|gold|silver|early|late|general|suite|seat|ticket|standing|seated|presale|fan\s*club)[\w\s]*/gi, '')
    .trim()
}

function normalize(raw: TMEvent): Event {
  const venue = raw._embedded?.venues?.[0]
  const image = raw.images?.find((i) => i.ratio === '16_9' && (i.width ?? 0) >= 640)?.url
    ?? raw.images?.[0]?.url
    ?? null

  const startISO = raw.dates?.start?.dateTime
    ?? (raw.dates?.start?.localDate
      ? `${raw.dates.start.localDate}T${raw.dates.start.localTime ?? '00:00:00'}`
      : new Date().toISOString())

  const price = raw.priceRanges?.[0]
  const priceStr = price ? `${price.min}–${price.max} ${price.currency ?? '€'}` : null
  const isFree = !price

  const genre = raw.classifications?.[0]?.genre?.name ?? ''
  const segment = raw.classifications?.[0]?.segment?.name ?? ''
  const categories = [genre, segment].filter((c) => c && c !== 'Undefined')

  const location = venue
    ? {
        name: venue.name ?? '',
        streetAddress: venue.address?.line1 ?? '',
        city: venue.city?.name ?? 'Helsinki',
        lat: venue.location?.latitude ? parseFloat(venue.location.latitude) : undefined,
        lon: venue.location?.longitude ? parseFloat(venue.location.longitude) : undefined,
      }
    : null

  return {
    id: `tm-${raw.id}`,
    title: raw.name,
    shortDescription: raw.info ?? '',
    description: raw.description ?? raw.info ?? '',
    startTime: startISO,
    endTime: null,
    location,
    image,
    isFree,
    price: priceStr,
    ticketUrl: raw.url ?? null,
    infoUrl: raw.url ?? null,
    categories,
    source: 'linked-events', // unified source type
  }
}

export async function GET(req: NextRequest) {
  if (!TM_KEY) {
    return NextResponse.json({ events: [], hasMore: false, total: 0, source: 'ticketmaster', error: 'No API key' })
  }

  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword') || ''

  const params = new URLSearchParams({
    apikey: TM_KEY,
    latlong: '60.1699,24.9384',  // Helsinki city center
    radius: '30',
    unit: 'km',
    countryCode: 'FI',
    startDateTime: `${start}T00:00:00Z`,
    endDateTime: `${end}T23:59:59Z`,
    size: '200',
    sort: 'date,asc',
  })
  if (keyword) params.set('keyword', keyword)

  try {
    const res = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events.json?${params}`,
      { next: { revalidate: 600, tags: ['events'] } }
    )
    if (!res.ok) return NextResponse.json({ events: [], hasMore: false, total: 0 })

    const data = await res.json()
    const raw: TMEvent[] = data._embedded?.events ?? []

    // Deduplicate by base title + date — keep the entry with price info (most complete)
    const seen = new Map<string, TMEvent>()
    for (const e of raw) {
      const key = `${baseTitle(e.name).toLowerCase()}|${e.dates?.start?.localDate ?? ''}`
      const existing = seen.get(key)
      if (!existing || (!existing.priceRanges?.length && e.priceRanges?.length)) {
        seen.set(key, e)
      }
    }

    const events = Array.from(seen.values()).map(normalize)

    return NextResponse.json({ events, hasMore: false, total: events.length })
  } catch (err) {
    console.error('Ticketmaster error:', err)
    return NextResponse.json({ events: [], hasMore: false, total: 0 })
  }
}
