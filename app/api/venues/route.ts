import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// Venue scrapers for Helsinki music venues that don't have public APIs
// Tavastia uses Tiketti/Lippu.fi — event IDs match between the two platforms

const VENUES = [
  {
    name: 'Tavastia',
    url: 'https://tavastiaklubi.fi/',
    city: 'Helsinki',
    address: 'Urho Kekkosen katu 4-6',
  },
]

function cleanTitle(raw: string): string {
  // Titles like "pe 2.10. Josén Pimeä Puoli" → "Josén Pimeä Puoli"
  return raw.replace(/^(?:ma|ti|ke|to|pe|la|su)\s+\d+\.\d+\.\s*/i, '').trim()
}

interface VenueEvent {
  url: string
  date: string
  slug: string
  id: string
  title: string
  image: string | null
  city: string
  address: string
  venueName: string
}

async function scrapeTavastia(venue: typeof VENUES[0]): Promise<VenueEvent[]> {
  const res = await fetch(venue.url, {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const pattern =
    /<a href="(https:\/\/tavastiaklubi\.fi\/events\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/(\d+)\/?)"\s[^>]*>([\s\S]{0,600}?)<\/a>/g

  const results: VenueEvent[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null) {
    const [, url, date, slug, eid, content] = match
    const imgMatch = content.match(/url\(([^)]+\.(?:jpg|jpeg|png|webp))/i)
    const titleMatch = content.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)
    const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : slug
    const title = cleanTitle(rawTitle)
    if (!title) continue

    results.push({
      url,
      date,
      slug,
      id: eid,
      title,
      image: imgMatch ? imgMatch[1] : null,
      city: venue.city,
      address: venue.address,
      venueName: venue.name,
    })
  }

  return results
}

function toEvent(v: VenueEvent): Event {
  const startTime = `${v.date}T20:00:00`
  // Tiketti/Lippu.fi event URL — same ID used by both platforms
  const ticketUrl = `https://www.lippu.fi/event/${v.slug}/${v.id}/`

  return {
    id: `venue-tavastia-${v.id}`,
    title: v.title,
    shortDescription: `${v.venueName} — ${v.city}`,
    description: '',
    startTime,
    endTime: null,
    location: {
      name: v.venueName,
      streetAddress: v.address,
      city: v.city,
    },
    image: v.image,
    isFree: false,
    price: null,
    ticketUrl,
    infoUrl: v.url,
    categories: ['Musiikki', 'Keikka'],
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword')?.toLowerCase() || ''

  try {
    const raw = await scrapeTavastia(VENUES[0])

    const startTs = new Date(start).getTime()
    const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

    let events = raw
      .map(toEvent)
      .filter((e) => {
        const ts = new Date(e.startTime).getTime()
        return ts >= startTs && ts <= endTs
      })

    if (keyword) {
      events = events.filter(
        (e) =>
          e.title.toLowerCase().includes(keyword) ||
          e.location?.name?.toLowerCase().includes(keyword)
      )
    }

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Venues scraper error:', err)
    return NextResponse.json({ events: [] })
  }
}
