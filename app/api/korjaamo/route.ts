import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const VENUE = {
  name: 'Kulttuuritehdas Korjaamo',
  address: 'Töölönkatu 51b',
  city: 'Helsinki',
  lat: 60.1837,
  lon: 24.9198,
  url: 'https://korjaamo.fi',
}

interface WPEvent {
  id: number
  title: { rendered: string }
  link: string
  content: { rendered: string }
  featured_media: number
}

// "9.12.2026" or "07.08.2026" → "2026-12-09"
function parseDDMMYYYY(s: string): string {
  const m = s.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/)
  if (!m) return ''
  const day = parseInt(m[1])
  const month = parseInt(m[2])
  const year = parseInt(m[3])
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2024) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// "ovet 19:00" or "ovet klo 20:30" → "19:00"
function parseOvet(s: string): string {
  const m = s.match(/ovet\s+(?:klo\s+)?(\d{1,2})[.:](\d{2})/i)
  return m ? `${String(parseInt(m[1])).padStart(2, '0')}:${m[2]}` : '19:00'
}

async function scrape(startTs: number, endTs: number): Promise<{ title: string; date: string; time: string; ticketUrl: string }[]> {
  // Use custom event post type exposed by Korjaamo's WordPress
  const res = await fetch(
    'https://korjaamo.fi/wp-json/wp/v2/event?per_page=100&_fields=id,title,link,content',
    {
      next: { revalidate: 3600, tags: ['events'] },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
      signal: AbortSignal.timeout(8000),
    }
  )
  if (!res.ok) return []

  const posts: WPEvent[] = await res.json()
  const results: { title: string; date: string; time: string; ticketUrl: string }[] = []

  for (const post of posts) {
    const title = post.title.rendered.replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim()
    if (!title) continue

    // Date is embedded in content HTML as "DD.MM.YYYY"
    const content = post.content.rendered
    const date = parseDDMMYYYY(content)
    if (!date) continue

    const ts = new Date(date).getTime()
    if (ts < startTs || ts >= endTs) continue

    const time = parseOvet(content.replace(/<[^>]+>/g, ' '))
    results.push({ title, date, time, ticketUrl: post.link })
  }
  return results
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start
  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 86400000

  const lineup = await scrape(startTs, endTs).catch(() => [])
  const events: Event[] = []

  for (const e of lineup) {
    events.push({
      id: `korjaamo-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Kulttuuritehdas Korjaamo – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: `${e.date}T${e.time}:00+03:00`,
      endTime: null,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: e.ticketUrl,
      infoUrl: e.ticketUrl,
      categories: ['Musiikki', 'Keikka', 'Konsertti'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events })
}
