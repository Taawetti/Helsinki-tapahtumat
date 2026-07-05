import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const VENUE = {
  name: 'Lepakkomies',
  address: 'Helsinginkatu 1',
  city: 'Helsinki',
  lat: 60.1882,
  lon: 24.9491,
  url: 'https://lepis.fi',
}

function decodeHTML(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&[a-z]+;/gi, ' ')
}

// "ke 8.7.2026 / ovet klo 20:00" → { date: '2026-07-08', time: '20:00' }
function parseLepisDate(s: string): { date: string; time: string } | null {
  const dateM = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!dateM) return null
  const day = parseInt(dateM[1])
  const month = parseInt(dateM[2])
  const year = parseInt(dateM[3])
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const timeM = s.match(/ovet\s+klo\s+(\d{1,2})[.:](\d{2})/i)
  const time = timeM ? `${String(parseInt(timeM[1])).padStart(2, '0')}:${timeM[2]}` : '20:00'
  return { date, time }
}

async function scrape(): Promise<{ title: string; date: string; time: string; ticketUrl: string }[]> {
  const res = await fetch('https://lepis.fi/tapahtumat/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const results: { title: string; date: string; time: string; ticketUrl: string }[] = []

  // Avoid nested-anchor problem: find each event href then inspect the surrounding HTML region
  const hrefRe = /href="([^"]*\/tapahtumat\/[^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1]
    const region = html.slice(m.index, m.index + 900)

    const titleM = region.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/)
    if (!titleM) continue
    const title = decodeHTML(titleM[1].replace(/<[^>]+>/g, '')).trim()
    if (!title || title.length < 2) continue

    const dateM = region.match(/\d{1,2}\.\d{1,2}\.\d{4}/)
    if (!dateM) continue
    const parsed = parseLepisDate(dateM[0] + ' / ovet klo 20:00')
    if (!parsed) continue

    const cardText = region.replace(/<[^>]+>/g, ' ')
    const timeM = cardText.match(/ovet\s+klo\s+(\d{1,2})[.:](\d{2})/i)
    const time = timeM ? `${String(parseInt(timeM[1])).padStart(2, '0')}:${timeM[2]}` : parsed.time

    const url = href.startsWith('http') ? href : `https://lepis.fi${href}`
    results.push({ title, date: parsed.date, time, ticketUrl: url })
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
  if (lineup.length === 0) console.warn('[lepakkomies] scraper returned 0 events')
  const events: Event[] = []

  for (const e of lineup) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue
    events.push({
      id: `lepakkomies-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Lepakkomies – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: `${e.date}T${e.time}:00+03:00`,
      endTime: null,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: e.ticketUrl,
      infoUrl: e.ticketUrl,
      categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events })
}
