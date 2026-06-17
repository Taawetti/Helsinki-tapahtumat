import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────

interface LEImage { url: string }
interface LEOffer {
  is_free: boolean
  price?: { fi?: string; en?: string }
  info_url?: { fi?: string; en?: string }
}
interface LELocation {
  name?: { fi?: string; en?: string }
  street_address?: { fi?: string; en?: string }
  address_locality?: { fi?: string; en?: string }
  position?: { coordinates: [number, number] }
}
interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  description?: { fi?: string; en?: string }
  start_time: string
  end_time?: string
  images?: LEImage[]
  location?: LELocation
  offers?: LEOffer[]
  keywords?: { name: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

// ── Normalizer ────────────────────────────────────────────

function normalize(raw: LEEvent): Event {
  const loc = raw.location
  const offer = raw.offers?.[0]
  const isFree = offer?.is_free ?? false
  const keywords = (raw.keywords || [])
    .map(k => k.name?.fi || k.name?.en || '')
    .filter(Boolean)
    .slice(0, 3)

  return {
    id: raw.id,
    title: raw.name?.fi || raw.name?.en || raw.name?.sv || 'Avajaiset',
    shortDescription: raw.short_description?.fi || raw.short_description?.en || '',
    description: raw.description?.fi || raw.description?.en || '',
    startTime: raw.start_time,
    endTime: raw.end_time || null,
    location: loc ? {
      name: loc.name?.fi || loc.name?.en || '',
      streetAddress: loc.street_address?.fi || loc.street_address?.en || '',
      city: loc.address_locality?.fi || loc.address_locality?.en || 'Helsinki',
      lat: loc.position?.coordinates?.[1],
      lon: loc.position?.coordinates?.[0],
    } : null,
    image: raw.images?.[0]?.url ?? null,
    isFree,
    price: isFree ? null : (offer?.price?.fi || offer?.price?.en || null),
    ticketUrl: offer?.info_url?.fi || offer?.info_url?.en || null,
    infoUrl: raw.info_url?.fi || raw.info_url?.en || null,
    categories: ['Avajaiset', ...keywords],
    source: 'linked-events',
  }
}

// ── Google News RSS parser ────────────────────────────────
// Returns recent opening news as event-like items (last 14 days)

function parseNewsRss(xml: string, cutoffTs: number): Event[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
  const results: Event[] = []

  for (let i = 0; i < Math.min(items.length, 25); i++) {
    const item = items[i]
    const raw = (tag: string) =>
      item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]+)</${tag}>`))?.[1]?.trim()
      || item.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`))?.[2]?.trim()
      || ''

    const title = raw('title').replace(/<[^>]+>/g, '').replace(/ - [^-]+$/, '').trim()
    const link  = raw('link')
    const pub   = raw('pubDate')
    const source = raw('source')
    const desc  = raw('description').replace(/<[^>]+>/g, '').trim().slice(0, 200)

    const pubTs = pub ? new Date(pub).getTime() : 0
    if (!title || pubTs < cutoffTs) continue

    results.push({
      id: `opening-news-${Buffer.from(link || title).toString('base64').slice(0, 20)}-${i}`,
      title,
      shortDescription: desc,
      description: desc,
      startTime: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      endTime: null,
      location: source ? { name: source, streetAddress: '', city: 'Helsinki' } : null,
      image: null,
      isFree: true,
      price: null,
      ticketUrl: null,
      infoUrl: link || null,
      categories: ['Avajaiset', 'Uutinen'],
      source: 'linked-events',
    })
  }

  return results
}

// ── GET ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start  = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const keyword = searchParams.get('keyword') || ''

  // Don't add noise to keyword searches
  if (keyword) return NextResponse.json({ events: [] })

  const base = {
    format: 'json',
    division: 'helsinki',
    start,
    sort: 'start_time',
    include: 'location,keywords',
  }

  const le = (text: string, size: string) =>
    fetch(`https://api.hel.fi/linkedevents/v1/event/?${new URLSearchParams({ ...base, text, page_size: size })}`, {
      next: { revalidate: 3600, tags: ['events'] },
      signal: AbortSignal.timeout(10000),
    })

  // Run all searches in parallel: four LE text searches + Google News RSS
  const [r1, r2, r3, r4, rNews] = await Promise.allSettled([
    le('avajaiset',            '50'),
    le('näyttelyn avajaiset',  '30'),
    le('ravintolan avajaiset', '20'),
    le('baarin avajaiset',     '20'),
    fetch(`https://news.google.com/rss/search?q=avajaiset+Helsinki+ravintola+OR+baari+OR+kahvila+OR+galleria&hl=fi&gl=FI&ceid=FI:fi`, {
      signal: AbortSignal.timeout(6000),
    }),
  ])

  const seen = new Set<string>()
  const events: Event[] = []
  const startTs = new Date(start).getTime()

  // Merge LinkedEvents results
  for (const r of [r1, r2, r3, r4]) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue
    try {
      const data = await r.value.json()
      for (const raw of (data.data ?? []) as LEEvent[]) {
        if (seen.has(raw.id)) continue
        seen.add(raw.id)
        const e = normalize(raw)
        if (new Date(e.startTime).getTime() >= startTs - 86400000) events.push(e)
      }
    } catch { /* skip */ }
  }

  // Merge Google News (recent 14 days only)
  if (rNews.status === 'fulfilled' && rNews.value.ok) {
    try {
      const xml = await rNews.value.text()
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
      for (const e of parseNewsRss(xml, cutoff)) {
        if (!seen.has(e.id)) { seen.add(e.id); events.push(e) }
      }
    } catch { /* skip */ }
  }

  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  return NextResponse.json({ events })
}
