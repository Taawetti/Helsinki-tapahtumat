import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const VENUE = {
  name: 'Kulttuuritalo',
  address: 'Sturenkatu 4',
  city: 'Helsinki',
  lat: 60.1938,
  lon: 24.9463,
  url: 'https://kulttuuritalo.fi',
}

// "25.07.2026" → "2026-07-25"
function parseDDMMYYYY(s: string): string {
  const m = s.match(/(\d{1,2})\.(\d{2})\.(\d{4})/)
  if (!m) return ''
  const day = parseInt(m[1])
  const month = parseInt(m[2])
  const year = parseInt(m[3])
  if (day < 1 || day > 31 || month < 1 || month > 12) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function scrape(): Promise<{ title: string; date: string; ticketUrl: string }[]> {
  const res = await fetch('https://kulttuuritalo.fi/tapahtumat/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const results: { title: string; date: string; ticketUrl: string }[] = []

  // Each event: <a href="https://kulttuuritalo.fi/tapahtuma/[slug]/">...<h3>Title</h3>...DD.MM.YYYY...</a>
  const linkRe = /<a\s+href="(https?:\/\/kulttuuritalo\.fi\/tapahtuma\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1]
    const inner = m[2]

    const titleM = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)
    if (!titleM) continue
    const title = titleM[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
    if (!title || title.length < 2) continue

    const dateM = inner.match(/(\d{1,2}\.\d{2}\.\d{4})/)
    if (!dateM) continue
    const date = parseDDMMYYYY(dateM[1])
    if (!date) continue

    results.push({ title, date, ticketUrl: href })
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
  const seen = new Set<string>()

  for (const e of lineup) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue
    const key = `${e.date}|${e.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push({
      id: `kulttuuritalo-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Kulttuuritalo – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: `${e.date}T19:00:00+03:00`,
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
