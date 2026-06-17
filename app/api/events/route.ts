import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { getEventImage, fetchImagesCached } from '@/lib/venue-images'

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
    page_size: keyword ? '100' : '50',
    include: 'location,keywords',
    sort: 'start_time',  // soonest events first
  })

  // When searching by keyword, skip language filter to catch all languages
  if (!keyword) params.set('language', 'fi')

  // Use bbox for neighborhood filtering, otherwise use division (municipality filter)
  if (bbox) {
    params.set('bbox', bbox)
  } else {
    params.set('division', municipality)
  }

  if (keyword) params.set('text', keyword)

  try {
    const linkedUrl = `https://api.hel.fi/linkedevents/v1/event/?${params}`
    const extraParams = new URLSearchParams({ start, end, ...(keyword ? { keyword } : {}) })
    const origin = req.nextUrl.origin

    // Helper: fetch an internal API route — catches ALL errors (incl. AbortSignal.timeout)
    // so they never escape Promise.allSettled in Node 24+
    const src = async (path: string): Promise<Response | null> => {
      try {
        const res = await fetch(`${origin}/${path}?${extraParams}`, {
          signal: AbortSignal.timeout(8000),
        })
        return res
      } catch {
        return null
      }
    }

    // Fetch all sources in parallel — page 1 only for external sources
    const [linkedRes, tmRes, ebRes, meetupRes, rssRes, venuesRes, cultureRes, espooRes, helmetRes, ilmonetRes, palvelukarttaRes, lipasRes, finnaRes, visitfinlandRes, sportsRes, festivalsRes, theatreRes, barsRes, raRes, museumsRes, liigaRes, kideRes, arenasRes, recurringRes, pubivisatRes, stadissaRes, myhelsinkiRes, openingsRes] = await Promise.allSettled([
      fetch(linkedUrl, { next: { revalidate: 300, tags: ['events'] }, signal: AbortSignal.timeout(10000) }),
      page === '1' ? src('api/ticketmaster') : Promise.resolve(null),
      page === '1' ? src('api/eventbrite')   : Promise.resolve(null),
      page === '1' ? src('api/meetup')       : Promise.resolve(null),
      page === '1' ? src('api/rss')          : Promise.resolve(null),
      page === '1' ? src('api/venues')       : Promise.resolve(null),
      page === '1' ? src('api/culture')      : Promise.resolve(null),
      page === '1' ? src('api/espoo')        : Promise.resolve(null),
      page === '1' ? src('api/helmet')       : Promise.resolve(null),
      page === '1' ? src('api/ilmonet')      : Promise.resolve(null),
      page === '1' ? src('api/palvelukartta'): Promise.resolve(null),
      page === '1' ? src('api/lipas')        : Promise.resolve(null),
      page === '1' ? src('api/finna')        : Promise.resolve(null),
      page === '1' ? src('api/visitfinland') : Promise.resolve(null),
      page === '1' ? src('api/sports')       : Promise.resolve(null),
      page === '1' ? src('api/festivals')    : Promise.resolve(null),
      page === '1' ? src('api/theatre')      : Promise.resolve(null),
      page === '1' ? src('api/bars')         : Promise.resolve(null),
      page === '1' ? src('api/ra')           : Promise.resolve(null),
      page === '1' ? src('api/museums')      : Promise.resolve(null),
      page === '1' ? src('api/liiga')        : Promise.resolve(null),
      page === '1' ? src('api/kide')         : Promise.resolve(null),
      page === '1' ? src('api/arenas')       : Promise.resolve(null),
      page === '1' ? src('api/recurring')    : Promise.resolve(null),
      page === '1' ? src('api/pubivisat')    : Promise.resolve(null),
      page === '1' ? src('api/stadissa')     : Promise.resolve(null),
      page === '1' ? src('api/myhelsinki')   : Promise.resolve(null),
      page === '1' ? src('api/openings')     : Promise.resolve(null),
    ])

    if (linkedRes.status === 'rejected' || (linkedRes.status === 'fulfilled' && !linkedRes.value.ok)) {
      return NextResponse.json({ error: 'Linked Events API error' }, { status: 502 })
    }

    const linkedData = await linkedRes.value.json()
    const startTs = new Date(start).getTime()
    // Filter out permanent exhibitions/ongoing events that started long before the requested date
    let events: Event[] = (linkedData.data || [])
      .map(normalize)
      .filter((e: Event) => new Date(e.startTime).getTime() >= startTs - 24 * 60 * 60 * 1000)
    const hasMore = !!linkedData.meta?.next
    let total: number = events.length

    // Normalize title for dedup: strip ticket tiers, years, punctuation variation
    function dedupKey(title: string, date: string): string {
      const base = title
        .replace(/\s*[\|–\-]\s*(premium|legazy|standard|vip|gold|silver|early|late|general|suite|seat|ticket|standing|seated|presale|fan\s*club)[\w\s]*/gi, '')
        .replace(/\b20\d{2}\b/g, '')        // strip years
        .replace(/[^\wäöåÄÖÅ\s]/g, ' ')    // punct → space
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
      return `${base}|${date}`
    }

    // Merge all external sources — deduplicate by normalized title+date
    const seen = new Set(events.map((e) => dedupKey(e.title, e.startTime.slice(0, 10))))

    for (const res of [tmRes, ebRes, meetupRes, rssRes, venuesRes, cultureRes, espooRes, helmetRes, ilmonetRes, palvelukarttaRes, lipasRes, finnaRes, visitfinlandRes, sportsRes, festivalsRes, theatreRes, barsRes, raRes, museumsRes, liigaRes, kideRes, arenasRes, recurringRes, pubivisatRes, stadissaRes, myhelsinkiRes, openingsRes]) {
      if (res.status === 'fulfilled' && res.value && res.value !== null) {
        let data: { events?: Event[] }
        try { data = await (res.value as Response).json() } catch { continue }
        const incoming: Event[] = data.events ?? []
        const unique = incoming.filter((e) => {
          const key = dedupKey(e.title, e.startTime.slice(0, 10))
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        events.push(...unique)
        total += unique.length
      }
    }

    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    // Enrich events without images using Wikipedia thumbnails (cached 7 days)
    const { venues: venueMap, categories: categoryMap } = await fetchImagesCached()
    for (const e of events) {
      if (!e.image) {
        const fallback = getEventImage(e.location?.name, e.categories, venueMap, categoryMap)
        if (fallback) e.image = fallback
      }
    }

    return NextResponse.json({ events, hasMore, total })
  } catch (err) {
    console.error('Events API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
