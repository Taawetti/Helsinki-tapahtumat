import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { weekParamDates } from '@/lib/stadissa-weeks'

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

// Viikkokohtainen välimuisti (avain = date-parametri). Korvaa aiemman
// yhden globaalin välimuistin, joka toimi vain koska haku oli aina
// "tänään + 4 vko" — ikkunakohtaisilla hauilla globaali kaappasi väärän datan.
const pageCache = new Map<string, { events: StadissaRaw[]; ts: number }>()

async function fetchWeek(dt: string): Promise<StadissaRaw[]> {
  const hit = pageCache.get(dt)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.events

  // Stadissa: /index.php?date=YYYY-MM-DD — mikä tahansa viikon sisällä oleva päivä käy.
  const res = await fetch(`${BASE}/index.php?date=${dt}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-tapahtumat/1.0)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`stadissa week ${dt}: HTTP ${res.status}`)

  const events = parseWeekPage(await res.text())
  pageCache.set(dt, { events, ts: Date.now() })
  return events
}

// Hakee viikkosivut siten, että ne kattavat pyydetyn [start, end]-ikkunan.
// (Aiemmin haettiin AINA vain "tänään + 4 vko" pyynnöstä riippumatta →
// menneet tapahtumat eivät löytyneet historiasta eivätkä festivaalit
// yli 4 viikon päästä tulevaisuuteen. Vika 8/2026.)
async function fetchEventsForRange(start: string, end: string): Promise<{ all: StadissaRaw[]; weeks: number; failedWeeks: number }> {
  const dates = weekParamDates(start, end, 12)
  const fetches = await Promise.allSettled(dates.map(fetchWeek))

  const seenIds = new Set<string>()
  const all: StadissaRaw[] = []
  let failedWeeks = 0

  for (const result of fetches) {
    if (result.status !== 'fulfilled') { failedWeeks++; continue }
    for (const e of result.value) {
      if (!seenIds.has(e.id)) {
        seenIds.add(e.id)
        all.push(e)
      }
    }
  }

  return { all, weeks: dates.length, failedWeeks }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end   = searchParams.get('end')   || start

  try {
    const { all, weeks, failedWeeks } = await fetchEventsForRange(start, end)
    if (failedWeeks > 0) console.error(`stadissa: ${failedWeeks}/${weeks} viikkohakua epäonnistui (${start}..${end})`)

    const startTs = new Date(start).getTime()
    const endTs   = new Date(end).getTime() + 24 * 60 * 60 * 1000

    const filtered = all.filter((e) => {
      const ts = new Date(`${e.date}T${String(e.startHour).padStart(2, '0')}:00:00`).getTime()
      return ts >= startTs && ts <= endTs
    })

    const events = filtered.map(toEvent)
    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    return NextResponse.json({
      events,
      total: events.length,
      source: 'stadissa',
      meta: { weeks, failedWeeks },
    })
  } catch (err) {
    console.error('Stadissa error:', err)
    return NextResponse.json({ events: [] })
  }
}
