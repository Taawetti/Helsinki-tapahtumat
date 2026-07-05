import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const VENUE = {
  name: 'Post Bar',
  address: 'Kaikukatu 2',
  city: 'Helsinki',
  lat: 60.1878,
  lon: 24.9625,
  url: 'https://postbar.fi',
}

const MONTHS: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
}

// "Saturday July 4th" → "2026-07-04"
function parseEnglishDate(s: string): string {
  const m = s.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d+)/i)
  if (!m) return ''
  const month = MONTHS[m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()]
  if (!month) return ''
  const day = parseInt(m[2])
  const today = new Date()
  let year = today.getFullYear()
  if (new Date(year, month - 1, day) < today) year++
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// "Doors 22-05" or "Doors 22:00" → "22:00"
function parseDoors(s: string): string {
  const m = s.match(/Doors\s+(\d{2})[-:](\d{2})/i)
  return m ? `${m[1]}:${m[2]}` : '22:00'
}

async function scrape(): Promise<{ title: string; date: string; time: string }[]> {
  const res = await fetch('https://postbar.fi/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const results: { title: string; date: string; time: string }[] = []

  // Each <li> has <p>Saturday July 4th</p> and <h3>Event Name</h3>
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g
  let m: RegExpExecArray | null
  while ((m = liRe.exec(html)) !== null) {
    const inner = m[1]

    const dateM = inner.match(/<p[^>]*>([^<]*(?:January|February|March|April|May|June|July|August|September|October|November|December)[^<]*)<\/p>/i)
    if (!dateM) continue
    const date = parseEnglishDate(dateM[1])
    if (!date) continue

    const titleM = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)
    if (!titleM) continue
    const title = titleM[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
    if (!title || title.length < 2) continue

    const doorsM = inner.match(/Doors\s+(\d{2})[-:](\d{2})/i)
    const time = doorsM ? `${doorsM[1]}:${doorsM[2]}` : '22:00'

    results.push({ title, date, time })
  }
  return results
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start
  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 86400000

  const lineup = await scrape().catch(() => [])
  const events: Event[] = []

  for (const e of lineup) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue
    events.push({
      id: `postbar-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Post Bar – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: `${e.date}T${e.time}:00+03:00`,
      endTime: null,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: VENUE.url,
      infoUrl: VENUE.url,
      categories: ['Musiikki', 'Keikka', 'Klubi', 'Elektroninen'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events })
}
