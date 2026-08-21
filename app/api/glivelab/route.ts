import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { parseFinnishDate } from '@/lib/finnish-date'
import { scrapeMeta } from '@/lib/scrape-meta'
import { helsinkiISO } from '@/lib/helsinki-time'

// Kiinteä '+03:00' oli tunnin väärässä loka–maaliskuussa (EET = +02:00).
// helsinkiISO lukee offsetin kohdepäivältä.
function hkiISO(date: string, hour: number, minute: number): string {
  return helsinkiISO(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)), hour, minute)
}


const VENUE = {
  name: 'G Livelab Helsinki',
  address: 'Yrjönkatu 3',
  city: 'Helsinki',
  lat: 60.1661,
  lon: 24.9369,
  url: 'https://glivelab.fi',
}

function decodeHTML(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&[a-z]+;/gi, ' ')
}

// "2.9." or "2.9. ke" → YYYY-MM-DD; vuoden päättely jaetulla
// parseFinnishDate:lla (60/183-sääntö)
function parseDDM(s: string): string {
  return parseFinnishDate(s)
}

async function scrape(): Promise<{ title: string; date: string; time: string; ticketUrl: string }[]> {
  const res = await fetch('https://glivelab.fi/events/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)

  const html = await res.text()
  const results: { title: string; date: string; time: string; ticketUrl: string }[] = []

  // Each event: anchor link to /events/[slug]/ with event details nearby
  const blockRe = /<a\s+href="(https:\/\/glivelab\.fi\/events\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null) {
    const href = m[1]
    const inner = decodeHTML(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

    // inner looks like: "2.9. ke Loscil (CA) + Pietu Arvola 20:00 Osta liput!"
    const dateM = inner.match(/\b(\d{1,2}\.\d{1,2}\.)/)
    if (!dateM) continue
    const date = parseDDM(dateM[1])
    if (!date) continue

    const timeM = inner.match(/\b(\d{2}):(\d{2})\b/)
    const time = timeM ? `${timeM[1]}:${timeM[2]}` : '19:00'

    // Title: everything after the date/weekday, before the time
    const cleaned = inner
      .replace(/\b\d{1,2}\.\d{1,2}\.\s*(ma|ti|ke|to|pe|la|su)?\s*/i, '')
      .replace(/\b\d{2}:\d{2}\b.*$/, '')
      .replace(/Osta\s+liput[!.]?/i, '')
      .trim()
    if (!cleaned || cleaned.length < 3) continue

    results.push({ title: cleaned.slice(0, 120), date, time, ticketUrl: href })
  }
  return results
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start
  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 86400000

  let lineup: { title: string; date: string; time: string; ticketUrl: string }[] = []
  let scrapeError: string | null = null
  try {
    lineup = await scrape()
  } catch (err) {
    scrapeError = String(err)
    console.error('[glivelab] scrape failed:', err)
  }
  if (lineup.length === 0 && !scrapeError) console.warn('[glivelab] scraper returned 0 events')
  const events: Event[] = []
  const seen = new Set<string>()

  for (const e of lineup) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue
    const key = `${e.date}|${e.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push({
      id: `glivelab-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `G Livelab – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: hkiISO(e.date, Number(e.time.slice(0, 2)), Number(e.time.slice(3, 5))),
      endTime: null,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: e.ticketUrl,
      infoUrl: e.ticketUrl,
      categories: ['Musiikki', 'Keikka', 'Jazz'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events, ...scrapeMeta(lineup.length, scrapeError) })
}
