import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

interface LinkedEventsImage {
  url: string
}

interface LinkedEventsOffer {
  is_free: boolean
  price?: { fi?: string; en?: string }
  info_url?: { fi?: string; en?: string }
}

interface LinkedEventsLocation {
  name?: { fi?: string; en?: string }
  street_address?: { fi?: string; en?: string }
  address_locality?: { fi?: string; en?: string }
  position?: { coordinates: [number, number] }
}

interface LinkedEventsEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  description?: { fi?: string; en?: string }
  start_time: string
  end_time?: string
  images?: LinkedEventsImage[]
  location?: LinkedEventsLocation
  offers?: LinkedEventsOffer[]
  keywords?: { name: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

function normalize(raw: LinkedEventsEvent): Event {
  const title = raw.name?.fi || raw.name?.en || raw.name?.sv || 'Nimetön tapahtuma'
  const shortDescription = raw.short_description?.fi || raw.short_description?.en || ''
  const description = raw.description?.fi || raw.description?.en || ''
  const image = raw.images?.[0]?.url ?? null

  const loc = raw.location
  const locationObj = loc
    ? {
        name: loc.name?.fi || loc.name?.en || '',
        streetAddress: loc.street_address?.fi || loc.street_address?.en || '',
        city: loc.address_locality?.fi || loc.address_locality?.en || 'Helsinki',
        lat: loc.position?.coordinates?.[1],
        lon: loc.position?.coordinates?.[0],
      }
    : null

  const offer = raw.offers?.[0]
  const isFree = offer?.is_free ?? false
  const price = isFree ? null : (offer?.price?.fi || offer?.price?.en || null)
  const ticketUrl = offer?.info_url?.fi || offer?.info_url?.en || null
  const infoUrl = raw.info_url?.fi || raw.info_url?.en || null

  const categories = (raw.keywords || [])
    .map((k) => k.name?.fi || k.name?.en || '')
    .filter(Boolean)
    .slice(0, 4)

  return {
    id: raw.id,
    title,
    shortDescription,
    description,
    startTime: raw.start_time,
    endTime: raw.end_time || null,
    location: locationObj,
    image,
    isFree,
    price,
    ticketUrl,
    infoUrl,
    categories,
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const startAfter = searchParams.get('startAfter') || ''
  const page = searchParams.get('page') || '1'
  const keyword = searchParams.get('keyword') || ''
  const municipality = searchParams.get('municipality') || 'helsinki'
  const bbox = searchParams.get('bbox') || '' // neighborhood bounding box

  const params = new URLSearchParams({
    format: 'json',
    start: startAfter || start,
    end,
    page,
    page_size: '24',
    include: 'location,keywords',
    language: 'fi',
    sort: 'start_time',
  })

  // Use bbox for neighborhood filtering, otherwise use municipality
  if (bbox) {
    params.set('bbox', bbox)
  } else {
    params.set('municipality', municipality)
  }

  if (keyword) params.set('text', keyword)

  try {
    const linkedUrl = `https://api.hel.fi/linkedevents/v1/event/?${params}`

    // Fetch Linked Events + Ticketmaster in parallel (page 1 only for TM)
    const tmParams = new URLSearchParams({ start, end, ...(keyword ? { keyword } : {}) })
    const [linkedRes, tmRes] = await Promise.allSettled([
      fetch(linkedUrl, { next: { revalidate: 300, tags: ['events'] } }),
      page === '1'
        ? fetch(`${req.nextUrl.origin}/api/ticketmaster?${tmParams}`)
        : Promise.resolve(null),
    ])

    if (linkedRes.status === 'rejected' || (linkedRes.status === 'fulfilled' && !linkedRes.value.ok)) {
      return NextResponse.json({ error: 'Linked Events API error' }, { status: 502 })
    }

    const linkedData = await linkedRes.value.json()
    let events: Event[] = (linkedData.data || []).map(normalize)
    const hasMore = !!linkedData.meta?.next
    let total: number = linkedData.meta?.count ?? 0

    // Merge Ticketmaster events (deduplicate by title+date)
    if (tmRes.status === 'fulfilled' && tmRes.value) {
      const tmData = await tmRes.value.json()
      const tmEvents: Event[] = tmData.events ?? []
      const seen = new Set(events.map((e) => `${e.title.toLowerCase()}|${e.startTime.slice(0, 10)}`))
      const unique = tmEvents.filter(
        (e) => !seen.has(`${e.title.toLowerCase()}|${e.startTime.slice(0, 10)}`)
      )
      // Interleave TM events by date
      events = [...events, ...unique].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
      total += unique.length
    }

    return NextResponse.json({ events, hasMore, total })
  } catch (err) {
    console.error('Events API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
