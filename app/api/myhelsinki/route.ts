import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const BASE = 'https://www.myhelsinki.fi/wp-json/mhb/v1/event_search'
const CACHE_TTL = 2 * 60 * 60 * 1000 // 2h

// Cover all 7 user-facing tag categories plus extra keywords for uncategorised events
const SEARCH_TERMS = [
  'musiikki', 'teatteri', 'tanssi', 'urheilu', 'lapset',
  'näyttely', 'konsertti', 'festivaali', 'taide', 'jazz', 'helsinki',
]

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '').trim()
}

interface MHEvent {
  ID: { ID: number }
  title: string
  excerpt: string
  link: string
  image_url?: string
  start_date: string
  start_time_of_day?: string
  end_date?: string
  end_time_of_day?: string
  locations?: { ID: number; title: string; link: string; location?: [number, number] }[]
  tags?: { name: string }[]
  external_url?: string
  pinned_event?: boolean
}

function toISO(date: string, time?: string): string {
  if (!time) return `${date}T00:00:00`
  // Strip trailing Z — times are already in local Finnish time
  const t = time.replace(/Z$/, '').slice(0, 8)
  return `${date}T${t}`
}

function normalize(raw: MHEvent): Event {
  const id = raw.ID?.ID ?? 0
  const loc = raw.locations?.[0]
  const tags = Array.isArray(raw.tags) ? raw.tags.map((t) => t.name).filter(Boolean) : []

  const startTime = toISO(raw.start_date, raw.start_time_of_day)
  const endTime = raw.end_date ? toISO(raw.end_date, raw.end_time_of_day) : null

  const infoUrl = raw.link ?? null
  const ticketUrl = raw.external_url || raw.link || null

  return {
    id: `mhfi-${id}`,
    title: raw.title,
    shortDescription: stripHtml(raw.excerpt),
    description: stripHtml(raw.excerpt),
    startTime,
    endTime,
    location: loc
      ? {
          name: loc.title,
          streetAddress: '',
          city: 'Helsinki',
          lat: loc.location?.[0],
          lon: loc.location?.[1],
        }
      : null,
    image: raw.image_url || null,
    isFree: false,
    price: null,
    ticketUrl,
    infoUrl,
    categories: tags,
    source: 'linked-events',
  }
}

interface CacheEntry { events: MHEvent[]; ts: number; startDate: string; endDate: string }
let cache: CacheEntry | null = null

async function fetchTerm(term: string, startDate: string, endDate: string): Promise<MHEvent[]> {
  const params = new URLSearchParams({
    s: term,
    lang: 'fi',
    per_page: '200',
    start_date: startDate,
    end_date: endDate,
  })
  const res = await fetch(`${BASE}?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data.results as MHEvent[]) ?? []
}

async function fetchAll(startDate: string, endDate: string): Promise<MHEvent[]> {
  if (cache && cache.startDate === startDate && cache.endDate === endDate && Date.now() - cache.ts < CACHE_TTL) {
    return cache.events
  }

  const results = await Promise.allSettled(
    SEARCH_TERMS.map((term) => fetchTerm(term, startDate, endDate))
  )

  const seenIds = new Set<number>()
  const all: MHEvent[] = []

  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const e of r.value) {
      const id = e.ID?.ID
      if (!id || seenIds.has(id)) continue
      seenIds.add(id)
      all.push(e)
    }
  }

  cache = { events: all, ts: Date.now(), startDate, endDate }
  return all
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  // Fetch 28 days ahead to warm the cache — filter to requested range locally
  const endReq = searchParams.get('end') || start
  const endFetch = new Date(start)
  endFetch.setDate(endFetch.getDate() + 27)
  const endDate = endFetch.toISOString().split('T')[0]

  try {
    const all = await fetchAll(start, endDate)

    const startTs = new Date(start).getTime()
    const endTs = new Date(endReq).getTime() + 24 * 60 * 60 * 1000

    const filtered = all.filter((e) => {
      const ts = new Date(toISO(e.start_date, e.start_time_of_day)).getTime()
      return ts >= startTs && ts <= endTs
    })

    const events = filtered.map(normalize)
    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    return NextResponse.json({ events, total: events.length, source: 'myhelsinki' })
  } catch (err) {
    console.error('MyHelsinki error:', err)
    return NextResponse.json({ events: [] })
  }
}
