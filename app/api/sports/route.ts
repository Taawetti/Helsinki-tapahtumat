import { NextRequest, NextResponse } from 'next/server'
import https from 'node:https'
import { Event } from '@/lib/types'

// Veikkausliiga (Finnish football) match schedule
// Server-rendered HTML from veikkausliiga.com — no API key needed
const VL_URL = 'https://www.veikkausliiga.com/tilastot/2026/veikkausliiga/ottelut/'

// Helsinki clubs and their home venues
const HELSINKI_CLUBS: Record<string, { venueName: string; address: string; ticketUrl: string }> = {
  'HJK': {
    venueName: 'Bolt Arena',
    address: 'Paavo Nurmentie 1',
    ticketUrl: 'https://www.hjk.fi/liput',
  },
  'IF Gnistan': {
    venueName: 'Töölön jalkapallostadion',
    address: 'Töölönlahdenkatu 1',
    ticketUrl: 'https://www.ifgnistan.fi',
  },
}

interface Match {
  date: string
  time: string
  homeTeam: string
  awayTeam: string
}

function parseFinnishDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
        rejectUnauthorized: false,
        timeout: 8000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          res.resume()
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString()))
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function scrapeVeikkausliiga(): Promise<Match[]> {
  const html = await fetchHtml(VL_URL)

  const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/g)
  if (!tableMatch) return []

  const matches: Match[] = []

  for (const table of tableMatch) {
    const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []
    let currentDate: string | null = null

    for (const row of rows) {
      const text = row.replace(/<[^>]+>/g, '|')
      const cells = text
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c && !c.includes('&'))

      // Update current date if this row contains one
      for (const cell of cells) {
        const date = parseFinnishDate(cell)
        if (date) { currentDate = date; break }
      }

      if (!currentDate) continue

      // Find the match cell: "TeamA - TeamB"
      const matchCell = cells.find(
        (c) => c.includes(' - ') && /^[A-ZÄÖIF]/.test(c) && c.length < 60
      )
      if (!matchCell) continue

      const dashIdx = matchCell.indexOf(' - ')
      const homeTeam = matchCell.slice(0, dashIdx).trim()
      const awayTeam = matchCell.slice(dashIdx + 3).trim()
      const timeCell = cells.find((c) => /^\d{2}:\d{2}$/.test(c)) ?? '18:00'

      matches.push({ date: currentDate, time: timeCell, homeTeam, awayTeam })
    }
  }

  // Deduplicate by date+teams
  const seen = new Set<string>()
  return matches.filter((m) => {
    const key = `${m.date}|${m.homeTeam}|${m.awayTeam}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword')?.toLowerCase() || ''

  try {
    const matches = await scrapeVeikkausliiga()

    const startTs = new Date(start).getTime()
    const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

    let events: Event[] = matches
      .filter((m) => {
        const venue = HELSINKI_CLUBS[m.homeTeam]
        if (!venue) return false
        const ts = new Date(`${m.date}T${m.time}:00`).getTime()
        return ts >= startTs && ts <= endTs
      })
      .map((m, i): Event => {
        const venue = HELSINKI_CLUBS[m.homeTeam]!
        return {
          id: `sports-vl-${m.date}-${m.homeTeam.replace(/\s/g, '')}-${i}`,
          title: `${m.homeTeam} – ${m.awayTeam}`,
          shortDescription: `Veikkausliiga · ${venue.venueName}`,
          description: `Veikkausliiga-ottelu. ${m.homeTeam} isännöi joukkuetta ${m.awayTeam} ${venue.venueName}lla.`,
          startTime: `${m.date}T${m.time}:00`,
          endTime: null,
          location: {
            name: venue.venueName,
            streetAddress: venue.address,
            city: 'Helsinki',
          },
          image: null,
          isFree: false,
          price: null,
          ticketUrl: venue.ticketUrl,
          infoUrl: VL_URL,
          categories: ['Urheilu', 'Jalkapallo'],
          source: 'linked-events',
        }
      })

    if (keyword) {
      events = events.filter(
        (e) =>
          e.title.toLowerCase().includes(keyword) ||
          e.location?.name?.toLowerCase().includes(keyword)
      )
    }

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Sports error:', err)
    return NextResponse.json({ events: [] })
  }
}
