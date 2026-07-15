import { NextRequest, NextResponse } from 'next/server'
import { Event, SourceStatus } from '@/lib/types'
import { getEventImage, fetchImagesCached } from '@/lib/venue-images'

// External sources fetched via internal API routes (api/<name>).
// Order defines merge priority: earlier sources win dedup upgrades first.
const EXTERNAL_SOURCES = [
  'ticketmaster', 'eventbrite', 'meetup', 'rss', 'venues', 'culture', 'espoo',
  'helmet', 'ilmonet', 'finna', 'visitfinland', 'sports', 'festivals', 'theatre',
  'bars', 'ra', 'museums', 'liiga', 'kide', 'arenas', 'recurring', 'pubivisat',
  'stadissa', 'myhelsinki', 'openings', 'allas', 'lippu', 'scraped',
  'flyingdutchman', 'juttutupa', 'lepakkomies', 'glivelab', 'kulttuuritalo',
  'postbar', 'korjaamo', 'malmitalo', 'vuotalo', 'savoy', 'nauramaan',
] as const

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

  const quick = searchParams.get('quick') === '1'

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

    // quick=1: return only LinkedEvents immediately (used for phase-1 fast load)
    const attemptExternal = !quick && page === '1'

    // Fetch all sources in parallel — page 1 only for external sources
    const [linkedRes, ...externalRes] = await Promise.allSettled([
      fetch(linkedUrl, { next: { revalidate: 300, tags: ['events'] }, signal: AbortSignal.timeout(10000) }),
      ...EXTERNAL_SOURCES.map((name) => attemptExternal ? src(`api/${name}`) : Promise.resolve(null)),
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
        .replace(/\s*\|.*$/, '')            // strip everything after | (ticket tier separators)
        .replace(/\s*[\|–\-]\s*(premium|legacy|standard|vip|gold|silver|early|late|general|suite|seat|ticket|standing|seated|presale|fan\s*club)[\w\s]*/gi, '')
        .replace(/\b20\d{2}\b/g, '')        // strip years
        .replace(/\s*\(päivä\s*\d+\/\d+\)/gi, '') // strip festival day suffix
        .replace(/[^\wäöåÄÖÅ\s]/g, ' ')    // punct → space
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
      return `${base}|${date}`
    }

    // Merge all external sources — deduplicate by normalized title+date.
    // When a duplicate is found, upgrade the existing event with coordinates
    // from the incoming version (e.g. recurring has coords, Linked Events doesn't).
    // Every attempted source gets a status entry so failures are visible instead of silent.
    const seenMap = new Map(events.map((e, i) => [dedupKey(e.title, e.startTime.slice(0, 10)), i]))
    const sources: SourceStatus[] = [{ name: 'linked-events', ok: true, count: events.length }]

    for (let i = 0; i < externalRes.length && attemptExternal; i++) {
      const name = EXTERNAL_SOURCES[i]
      const res = externalRes[i]
      let ok = false
      let count = 0
      // rejected / null (timeout, network) / non-OK HTTP / bad JSON → ok stays false
      if (res.status === 'fulfilled' && res.value && (res.value as Response).ok) {
        try {
          const data: { events?: Event[] } = await (res.value as Response).json()
          const incoming: Event[] = data.events ?? []
          for (const e of incoming) {
            const key = dedupKey(e.title, e.startTime.slice(0, 10))
            const existingIdx = seenMap.get(key)
            if (existingIdx !== undefined) {
              // Upgrade existing event with best available data from the incoming duplicate
              const existing = events[existingIdx]
              const upgrades: Partial<Event> = {}
              if (e.location?.lat && e.location?.lon && !existing?.location?.lat) upgrades.location = e.location
              if (e.image && !existing?.image) upgrades.image = e.image
              if (e.ticketUrl && !existing?.ticketUrl) upgrades.ticketUrl = e.ticketUrl
              if (e.price && !existing?.price) upgrades.price = e.price
              if (Object.keys(upgrades).length > 0) events[existingIdx] = { ...existing, ...upgrades }
            } else {
              seenMap.set(key, events.length)
              events.push(e)
              total++
            }
          }
          // Status only after the whole batch merged — a mid-merge throw
          // (malformed row) must not report the source as both ok and counted.
          ok = true
          count = incoming.length
        } catch {
          ok = false
          count = 0
        }
      }
      sources.push({ name, ok, count })
    }

    // Enforce date boundaries for all sources — external APIs may ignore the date params
    // and return events from wrong dates (e.g. past events, future events, wrong month).
    // Use the ISO date prefix (first 10 chars) for comparison; Finnish APIs store times
    // with +03:00 offset so the date part is Helsinki local date.
    events = events.filter((e: Event) => {
      const d = e.startTime.slice(0, 10)
      return d >= start && d <= end
    })

    if (startAfter) {
      // Compare as timestamps, not strings — startAfter is UTC (…Z) while most
      // sources emit +03:00 offsets, so lexicographic comparison lets in events
      // up to 3 h before the intended cutoff.
      const cutoff = new Date(startAfter).getTime()
      events = events.filter((e: Event) => new Date(e.startTime).getTime() >= cutoff)
    }

    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    // Enrich events without images using venue-specific Wikipedia thumbnails only.
    // Category fallbacks are intentionally omitted — they cause every event of the
    // same category to share the same image, which looks wrong in carousels.
    const { venues: venueMap } = await fetchImagesCached()
    for (const e of events) {
      if (!e.image) {
        const fallback = getEventImage(e.location?.name, e.categories, venueMap, {})
        if (fallback) e.image = fallback
      }
    }

    return NextResponse.json({ events, hasMore, total, generatedAt: new Date().toISOString(), sources })
  } catch (err) {
    console.error('Events API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
