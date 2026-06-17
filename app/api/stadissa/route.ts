import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const BASE = 'https://www.stadissa.fi'
const CACHE_TTL = 2 * 60 * 60 * 1000 // 2h

const FI_MONTHS: Record<string, number> = {
  tammikuu: 1, helmikuu: 2, maaliskuu: 3, huhtikuu: 4,
  toukokuu: 5, kesäkuu: 6, heinäkuu: 7, elokuu: 8,
  syyskuu: 9, lokakuu: 10, marraskuu: 11, joulukuu: 12,
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '')
    .trim()
}

interface StadissaRaw {
  id: string
  title: string
  venue: string
  date: string       // YYYY-MM-DD
  startHour: number
  url: string
}

function parseWeekPage(html: string): StadissaRaw[] {
  const results: StadissaRaw[] = []

  // The page has 7 <div class="calendarday[...]"> sections, one per day
  const dayBlocks = [...html.matchAll(/<div class="calendarday[^"]*">/g)]
  if (dayBlocks.length === 0) return results

  for (let i = 0; i < dayBlocks.length; i++) {
    const start = dayBlocks[i].index!
    const end = i + 1 < dayBlocks.length ? dayBlocks[i + 1].index! : html.length
    const section = html.slice(start, end)

    // Extract date parts
    const dayM = section.match(/<div class="day">[^<]*<span[^>]*>(\d{1,2})<\/span>/)
    const monM = section.match(/<div class="month">[^<]*<span[^>]*>([^<]+)<\/span>/)
    const yrM  = section.match(/<div class="year">[^<]*<span[^>]*>(\d{4})<\/span>/)
    if (!dayM || !monM || !yrM) continue

    const day = parseInt(dayM[1])
    const month = FI_MONTHS[monM[1].toLowerCase().trim()]
    const year = parseInt(yrM[1])
    if (!month) continue

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    // Extract events: each event has time span + title link, together in a .calendarevent div
    const eventRe = /<div class="calendareventtime"><span>(\d{1,2})<\/span><\/div>\s*<div class="calendareventtitle"><a\s+href="\/tapahtumat\/(\d+)\/([^"]+)"(?:[^>]*title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/g

    for (const m of section.matchAll(eventRe)) {
      const [, hourStr, id, slug, titleAttr, innerHtml] = m
      const hour = parseInt(hourStr)

      // Title: from link text, strip tags and leading emoji/whitespace
      const rawTitle = stripTags(innerHtml)
      const title = rawTitle.replace(/^\p{Emoji_Presentation}+\s*/u, '').trim()
      if (!title || title.length < 2) continue

      // Venue: from title attribute "Event Name | Venue"
      let venue = ''
      if (titleAttr) {
        const pipeIdx = titleAttr.indexOf('|')
        if (pipeIdx !== -1) venue = titleAttr.slice(pipeIdx + 1).trim()
      }

      results.push({
        id,
        title,
        venue,
        date: dateStr,
        startHour: hour,
        url: `${BASE}/tapahtumat/${id}/${slug}`,
      })
    }
  }

  return results
}

function toEvent(e: StadissaRaw): Event {
  const startTime = `${e.date}T${String(e.startHour).padStart(2, '0')}:00:00`
  return {
    id: `stadissa-${e.id}`,
    title: e.title,
    shortDescription: e.venue ? `@ ${e.venue}` : '',
    description: '',
    startTime,
    endTime: null,
    location: e.venue
      ? { name: e.venue, streetAddress: '', city: 'Helsinki' }
      : null,
    image: null,
    isFree: false,
    price: null,
    ticketUrl: e.url,
    infoUrl: e.url,
    categories: [],
    source: 'linked-events',
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

let cache: { events: StadissaRaw[]; ts: number } | null = null

async function fetchAllEvents(): Promise<StadissaRaw[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.events

  // Stadissa uses /index.php?date=YYYY-MM-DD — any date within the target week works.
  // Fetch 4 consecutive weeks (7-day offsets from today).
  const now = new Date()
  const weekDates = [0, 7, 14, 21].map((offset) => {
    const d = new Date(now)
    d.setDate(d.getDate() + offset)
    return isoDate(d)
  })

  const fetches = await Promise.allSettled(
    weekDates.map((dt) =>
      fetch(`${BASE}/index.php?date=${dt}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-tapahtumat/1.0)' },
        signal: AbortSignal.timeout(10000),
      }).then((r) => r.text())
    )
  )

  const seenIds = new Set<string>()
  const all: StadissaRaw[] = []

  for (const result of fetches) {
    if (result.status !== 'fulfilled') continue
    for (const e of parseWeekPage(result.value)) {
      if (!seenIds.has(e.id)) {
        seenIds.add(e.id)
        all.push(e)
      }
    }
  }

  if (all.length > 0) cache = { events: all, ts: Date.now() }
  return all
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end   = searchParams.get('end')   || start

  try {
    const all = await fetchAllEvents()

    const startTs = new Date(start).getTime()
    const endTs   = new Date(end).getTime() + 24 * 60 * 60 * 1000

    const filtered = all.filter((e) => {
      const ts = new Date(`${e.date}T${String(e.startHour).padStart(2, '0')}:00:00`).getTime()
      return ts >= startTs && ts <= endTs
    })

    const events = filtered.map(toEvent)
    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    return NextResponse.json({ events, total: events.length, source: 'stadissa' })
  } catch (err) {
    console.error('Stadissa error:', err)
    return NextResponse.json({ events: [] })
  }
}
