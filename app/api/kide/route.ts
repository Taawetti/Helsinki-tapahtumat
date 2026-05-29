import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const KIDE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)',
}

const STUDENT_KEYWORDS = ['yliopisto', 'opiskelij', 'ainejärjestö', 'kilta', 'teekkar', 'hyyryläinen', 'hyy ', 'tky', 'aky', 'oty', 'osy', 'fuksi', 'appro', 'sitsit', 'sitsi']

function isStudentRelated(text: string): boolean {
  const lower = text.toLowerCase()
  return STUDENT_KEYWORDS.some((kw) => lower.includes(kw))
}

function isHelsinkiEvent(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('helsinki') || lower.includes('hki') || lower.includes('espoo') || lower.includes('vantaa')
}

function buildCategories(title: string, venue: string): string[] {
  const cats: string[] = ['Yöelämä', 'Klubi']
  if (isStudentRelated(title) || isStudentRelated(venue)) {
    cats.push('Opiskelijat')
  }
  return cats
}

function defaultStartTime(): string {
  const d = new Date()
  return `${d.toISOString().split('T')[0]}T19:00:00`
}

// ── Strategy 1: parse __NEXT_DATA__ from HTML page ───────────────────────────

interface KideProduct {
  id?: string
  name?: string
  slug?: string
  dateEnd?: string
  dateStart?: string
  company?: { name?: string; city?: string }
  place?: { name?: string; city?: string }
}

function extractFromNextData(html: string): Event[] {
  const match = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/)
  if (!match) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(match[1])
  } catch {
    return []
  }

  // Walk the props tree looking for arrays of objects that look like events
  function findProducts(obj: unknown, depth = 0): KideProduct[] {
    if (depth > 8 || !obj || typeof obj !== 'object') return []
    if (Array.isArray(obj)) {
      // Check if this looks like an event array
      const first = obj[0]
      if (first && typeof first === 'object' && ('name' in first || 'slug' in first)) {
        return obj as KideProduct[]
      }
      return obj.flatMap((item) => findProducts(item, depth + 1))
    }
    return Object.values(obj as Record<string, unknown>).flatMap((v) => findProducts(v, depth + 1))
  }

  const products = findProducts(parsed)
  return products
    .filter((p) => {
      const city = p.place?.city || p.company?.city || ''
      const name = p.name || ''
      return isHelsinkiEvent(city) || isHelsinkiEvent(name)
    })
    .map((p): Event => {
      const slug = p.slug || p.id || String(Math.random())
      const title = p.name || 'Kide-tapahtuma'
      const venue = p.place?.name || p.company?.name || ''
      const startTime = p.dateStart || defaultStartTime()
      return {
        id: `kide-${slug}`,
        title,
        shortDescription: `Kide.app — Helsinki${venue ? ` · ${venue}` : ''}`,
        description: '',
        startTime,
        endTime: null,
        location: { name: venue || 'Helsinki', streetAddress: '', city: 'Helsinki' },
        image: null,
        isFree: false,
        price: null,
        ticketUrl: `https://kide.app/events/${slug}`,
        infoUrl: `https://kide.app/events/${slug}`,
        categories: buildCategories(title, venue),
        source: 'linked-events' as const,
      }
    })
}

// ── Strategy 2: try the /api/products JSON endpoint ──────────────────────────

interface KideApiProduct {
  id?: string
  name?: string
  slug?: string
  dateStart?: string
  dateEnd?: string
  company?: { name?: string; city?: string }
  place?: { name?: string; city?: string }
}

async function fetchKideApi(): Promise<Event[]> {
  const res = await fetch('https://kide.app/api/products?city=helsinki', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: KIDE_HEADERS,
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return []
  }

  const products: KideApiProduct[] = Array.isArray(data)
    ? data
    : (data as Record<string, unknown>)?.model
      ? ((data as Record<string, unknown>).model as KideApiProduct[])
      : []

  return products
    .filter((p) => {
      const city = p.place?.city || p.company?.city || ''
      const name = p.name || ''
      return isHelsinkiEvent(city) || isHelsinkiEvent(name)
    })
    .map((p): Event => {
      const slug = p.slug || p.id || String(Math.random())
      const title = p.name || 'Kide-tapahtuma'
      const venue = p.place?.name || p.company?.name || ''
      const startTime = p.dateStart || defaultStartTime()
      return {
        id: `kide-${slug}`,
        title,
        shortDescription: `Kide.app — Helsinki${venue ? ` · ${venue}` : ''}`,
        description: '',
        startTime,
        endTime: null,
        location: { name: venue || 'Helsinki', streetAddress: '', city: 'Helsinki' },
        image: null,
        isFree: false,
        price: null,
        ticketUrl: `https://kide.app/events/${slug}`,
        infoUrl: `https://kide.app/events/${slug}`,
        categories: buildCategories(title, venue),
        source: 'linked-events' as const,
      }
    })
}

// ── Strategy 3: fallback HTML scraping ───────────────────────────────────────

function scrapeHtmlFallback(html: string): Event[] {
  const events: Event[] = []
  const seen = new Set<string>()

  // Match event hrefs: /events/slug or /products/uuid
  const linkPattern = /href="(\/(?:events|products)\/([\w-]+))"/g
  let m: RegExpExecArray | null

  while ((m = linkPattern.exec(html)) !== null) {
    const [, href, slug] = m
    if (seen.has(slug)) continue
    seen.add(slug)

    // Grab surrounding context (up to 500 chars after the link) for title/date
    const ctx = html.slice(m.index, m.index + 500)

    // Try to find a title in h1–h3 or a generic text node
    const titleMatch =
      ctx.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/) ||
      ctx.match(/aria-label="([^"]{3,80})"/) ||
      ctx.match(/<span[^>]*>([\s\S]{3,80}?)<\/span>/)
    const rawTitle = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? ''
    if (!rawTitle || rawTitle.length < 3) continue

    // Try datetime attribute
    const dateMatch = ctx.match(/datetime="([^"]+)"/) || ctx.match(/(\d{4}-\d{2}-\d{2})/)
    const startTime = dateMatch?.[1]
      ? (dateMatch[1].includes('T') ? dateMatch[1] : `${dateMatch[1]}T19:00:00`)
      : defaultStartTime()

    const ticketUrl = `https://kide.app${href}`
    events.push({
      id: `kide-${slug}`,
      title: rawTitle,
      shortDescription: 'Kide.app — Helsinki',
      description: '',
      startTime,
      endTime: null,
      location: { name: 'Helsinki', streetAddress: '', city: 'Helsinki' },
      image: null,
      isFree: false,
      price: null,
      ticketUrl,
      infoUrl: ticketUrl,
      categories: buildCategories(rawTitle, ''),
      source: 'linked-events' as const,
    })
  }

  return events
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  try {
    const startTs = new Date(start).getTime()
    const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

    // Try JSON API first (fastest, most structured)
    const apiEvents = await fetchKideApi().catch(() => [])
    if (apiEvents.length > 0) {
      const filtered = apiEvents.filter((e) => {
        const ts = new Date(e.startTime).getTime()
        return ts >= startTs && ts <= endTs
      })
      return NextResponse.json({ events: filtered })
    }

    // Fall back to HTML page + __NEXT_DATA__ extraction
    const res = await fetch('https://kide.app/events', {
      next: { revalidate: 3600, tags: ['events'] },
      headers: KIDE_HEADERS,
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return NextResponse.json({ events: [] })

    const html = await res.text()

    // Try structured JSON first, then regex scraping
    let events = extractFromNextData(html)
    if (events.length === 0) {
      events = scrapeHtmlFallback(html)
    }

    // Filter to Helsinki and requested date range
    const filtered = events.filter((e) => {
      if (!isHelsinkiEvent(e.location?.city || '') && !isHelsinkiEvent(e.shortDescription)) return false
      const ts = new Date(e.startTime).getTime()
      return ts >= startTs && ts <= endTs
    })

    return NextResponse.json({ events: filtered })
  } catch (err) {
    console.error('Kide.app error:', err)
    return NextResponse.json({ events: [] })
  }
}
