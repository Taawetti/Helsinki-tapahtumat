import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// Kansallisteatteri (Finnish National Theatre)
// Server-rendered Drupal calendar — no API key needed
const KT_CALENDAR = 'https://www.kansallisteatteri.fi/ohjelmisto/ohjelmistokalenteri'
const KT_BASE = 'https://www.kansallisteatteri.fi'

interface TheatreEvent {
  date: string    // YYYY-MM-DD
  time: string    // HH:MM
  title: string
  url: string
  stage: string
  soldOut: boolean
}

async function scrapeKansallisteatteri(): Promise<TheatreEvent[]> {
  const res = await fetch(KT_CALENDAR, {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const results: TheatreEvent[] = []
  const seen = new Set<string>()

  // Each performance is in a paragraph--performance div
  const blockRe = /<div class="paragraph paragraph--performance([^"]*)">([\s\S]*?)(?=<div class="paragraph paragraph--performance|<\/div>\s*<\/div>\s*<\/div>\s*<\/section|$)/g
  let m: RegExpExecArray | null

  while ((m = blockRe.exec(html)) !== null) {
    const classes = m[1]
    const block = m[2]

    // ISO datetime: used for the date part only (time may use local convention)
    const dtMatch = block.match(/<time datetime="(\d{4}-\d{2}-\d{2})/)
    if (!dtMatch) continue
    const date = dtMatch[1]

    // Display time: "klo HH:MM"
    const timeMatch = block.match(/klo\s+(\d{1,2}:\d{2})/)
    const time = timeMatch ? timeMatch[1].padStart(5, '0') : '18:00'

    // Show title + URL
    const linkMatch = block.match(/<a href="(\/esitys\/[^"]+)">([^<]+)<\/a>/)
    if (!linkMatch) continue
    const url = `${KT_BASE}${linkMatch[1]}`
    const title = linkMatch[2].trim()

    // Stage/venue name
    const stageMatch = block.match(/field--name-field-location[\s\S]{0,200}?<div[^>]*>\s*([^<]{2,60})\s*<\/div>/)
    const stage = stageMatch
      ? stageMatch[1].replace(/\s+/g, ' ').trim()
      : 'Kansallisteatteri'

    const soldOut = classes.includes('availability-sold-out')

    const key = `${date}|${time}|${title}`
    if (seen.has(key)) continue
    seen.add(key)

    results.push({ date, time, title, url, stage, soldOut })
  }

  return results
}

function stageAddress(stage: string): string {
  if (stage.toLowerCase().includes('suuri')) return 'Läntinen Teatterikuja 1'
  if (stage.toLowerCase().includes('pieni')) return 'Läntinen Teatterikuja 1'
  if (stage.toLowerCase().includes('willensauna')) return 'Läntinen Teatterikuja 1'
  if (stage.toLowerCase().includes('lavaklubi')) return 'Läntinen Teatterikuja 1'
  return ''
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword')?.toLowerCase() || ''

  try {
    const shows = await scrapeKansallisteatteri()

    const startTs = new Date(start).getTime()
    const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

    let events: Event[] = shows
      .filter((s) => {
        const ts = new Date(`${s.date}T${s.time}:00`).getTime()
        return ts >= startTs && ts <= endTs
      })
      .map((s, i): Event => ({
        id: `theatre-kt-${s.date}-${i}`,
        title: s.title,
        shortDescription: `Kansallisteatteri${s.stage ? ' · ' + s.stage : ''}`,
        description: s.soldOut ? 'Tämä esitys on loppuunmyyty.' : '',
        startTime: `${s.date}T${s.time}:00`,
        endTime: null,
        location: {
          name: s.stage || 'Kansallisteatteri',
          streetAddress: stageAddress(s.stage),
          city: 'Helsinki',
        },
        image: null,
        isFree: false,
        price: null,
        ticketUrl: s.url,
        infoUrl: s.url,
        categories: ['Teatteri', 'Kulttuuri'],
        source: 'linked-events',
      }))

    if (keyword) {
      events = events.filter(
        (e) =>
          e.title.toLowerCase().includes(keyword) ||
          e.location?.name?.toLowerCase().includes(keyword)
      )
    }

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Theatre error:', err)
    return NextResponse.json({ events: [] })
  }
}
