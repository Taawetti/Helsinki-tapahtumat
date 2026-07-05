import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const VENUE = {
  name: 'Flying Dutch',
  address: 'Pitkänsillanranta 2',
  city: 'Helsinki',
  lat: 60.1823,
  lon: 24.9519,
  url: 'https://flyingdutch.fi',
}

// Static 2026 summer lineup — fallback if live fetch fails or yields no results
// Source: flyingdutch.fi/HOME/ (fetched 2026-07-05)
const STATIC_2026: { title: string; date: string; time: string }[] = [
  { title: 'Markus Holkko Quartet',                       date: '2026-05-23', time: '19:00' },
  { title: 'The Shubie Brothers',                         date: '2026-06-03', time: '19:00' },
  { title: 'Emma Salokoski & Jarmo Saari',                date: '2026-06-11', time: '19:00' },
  { title: 'DJ Borzin: Balkan Fever',                     date: '2026-06-12', time: '17:00' },
  { title: 'Tuomo',                                       date: '2026-06-25', time: '19:00' },
  { title: 'Flying Dutch: Stand Up',                      date: '2026-07-05', time: '19:00' },
  { title: 'The Stance Brothers',                         date: '2026-07-09', time: '19:00' },
  { title: 'Django Collective Helsinki',                  date: '2026-07-22', time: '19:00' },
  { title: 'Paleface DJ Set',                             date: '2026-07-25', time: '18:00' },
  { title: 'Paleface & Räjähtävä Nyrkki',                date: '2026-08-06', time: '19:00' },
  { title: 'Lightboxer',                                  date: '2026-08-20', time: '19:00' },
  { title: 'Season Wrap Up – DJs Daddy Pales & Borzin',  date: '2026-08-29', time: '19:00' },
]

// Parse "D.M." or "DD.MM." to YYYY-MM-DD — same logic as Kuudes Linja scraper
function parseFinnishDate(s: string): string {
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.$/)
  if (!m) return ''
  const day = parseInt(m[1])
  const month = parseInt(m[2])
  if (day < 1 || day > 31 || month < 1 || month > 12) return ''
  const today = new Date()
  let year = today.getFullYear()
  if (new Date(year, month - 1, day) < today) year++
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function scrapeLive(): Promise<{ title: string; date: string; time: string }[]> {
  const res = await fetch('https://flyingdutch.fi/HOME/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()

  // Strip scripts, styles, then all tags; decode common entities
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')

  // Split at every "D.M." or "DD.MM." — each chunk starts with its own date
  const chunks = text.split(/(?=\b\d{1,2}\.\d{1,2}\.\b)/)
  const results: { title: string; date: string; time: string }[] = []

  for (const chunk of chunks) {
    const dateMatch = chunk.match(/^(\d{1,2}\.\d{1,2}\.)/)
    if (!dateMatch) continue

    const date = parseFinnishDate(dateMatch[1])
    if (!date) continue

    // Everything after the date (up to ~80 chars) is artist + optional time
    const rest = chunk.slice(dateMatch[1].length).trim().slice(0, 120)

    // Extract explicit time like "17:00", "17.00", "17-21"
    const timeMatch = rest.match(/\b(\d{1,2})[.:](\d{2})\b/)
    const time = timeMatch
      ? `${String(parseInt(timeMatch[1])).padStart(2, '0')}:${timeMatch[2]}`
      : '19:00'

    // Artist name: strip time notations and trailing junk
    const title = rest
      .replace(/\b\d{1,2}[.:]\d{2}(?:-\d{1,2}[.:]\d{2})?\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (title.length >= 3 && title.length <= 100) {
      results.push({ title, date, time })
    }
  }

  return results
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start

  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

  let lineup = await scrapeLive().catch(() => [])
  if (lineup.length === 0) lineup = STATIC_2026

  const events: Event[] = []
  for (const e of lineup) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue

    events.push({
      id: `flyingdutchman-${e.date.replace(/-/g, '')}`,
      title: e.title,
      shortDescription: `Flying Dutch – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: `${e.date}T${e.time}:00+03:00`,
      endTime: null,
      location: {
        name: VENUE.name,
        streetAddress: VENUE.address,
        city: VENUE.city,
        lat: VENUE.lat,
        lon: VENUE.lon,
      },
      image: null,
      isFree: true,
      price: null,
      ticketUrl: VENUE.url,
      infoUrl: VENUE.url,
      categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events })
}
