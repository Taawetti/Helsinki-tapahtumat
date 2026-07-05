import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const VENUE = {
  name: 'Juttutupa',
  address: 'Säästöpankinranta 6',
  city: 'Helsinki',
  lat: 60.1824,
  lon: 24.9507,
  url: 'https://juttutupa.fi',
}

function decodeHTML(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&[a-z]+;/gi, ' ')
}

function parseDDMM(s: string): string {
  const m = s.match(/(\d{1,2})\.(\d{2})\./)
  if (!m) return ''
  const day = parseInt(m[1])
  const month = parseInt(m[2])
  if (day < 1 || day > 31 || month < 1 || month > 12) return ''
  const todayStr = new Date().toISOString().slice(0, 10)
  let year = parseInt(todayStr.slice(0, 4))
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  if (`${year}-${mm}-${dd}` < todayStr) year++
  return `${year}-${mm}-${dd}`
}

async function scrape(): Promise<{ title: string; date: string }[]> {
  const res = await fetch('https://juttutupa.fi/keikat/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const text = decodeHTML(html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ''))

  const results: { title: string; date: string }[] = []
  // Lines like: "To 02.07. Copasetic Brothers" or "La 04.07. Cosh Boys"
  const lineRe = /\b(Ma|Ti|Ke|To|Pe|La|Su)\s+(\d{1,2}\.\d{2}\.)\s+(.+)/g
  let m: RegExpExecArray | null
  while ((m = lineRe.exec(text)) !== null) {
    const date = parseDDMM(m[2])
    const title = m[3].trim().replace(/\s+/g, ' ').slice(0, 120)
    if (date && title.length >= 2) results.push({ title, date })
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
  if (lineup.length === 0) console.warn('[juttutupa] scraper returned 0 events')
  const events: Event[] = []

  for (const e of lineup) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue
    events.push({
      id: `juttutupa-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Juttutupa – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: `${e.date}T19:00:00+03:00`,
      endTime: null,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: null,
      isFree: true,
      price: null,
      ticketUrl: VENUE.url,
      infoUrl: `${VENUE.url}/keikat/`,
      categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events })
}
