import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// ── Musiikkitalo (RSS feed, date parsed from URL slug) ───────────────────────

async function scrapeMusiikkitalo(): Promise<Event[]> {
  const res = await fetch('https://musiikkitalo.fi/konsertit-ja-tapahtumat/feed/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const xml = await res.text()
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []

  return items.map((item): Event | null => {
    const title = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim()
    const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()
    const desc = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]
      ?.replace(/<[^>]+>/g, '').slice(0, 200).trim()
    const imgMatch = item.match(/<media:content[^>]+url="([^"]+)"/i) ||
      item.match(/src="(https:\/\/musiikkitalo\.fi[^"]+\.(?:jpg|jpeg|png|webp))"/i)

    if (!title || !link) return null

    // Date is embedded in the slug: "event-name-31-10-2026" or "event-name-31-10-2026-2"
    const dateInSlug = link.match(/(\d{1,2})-(\d{1,2})-(\d{4})(?:-\d+)?(?:\/)?$/)
    let startTime: string
    if (dateInSlug) {
      const [, day, month, year] = dateInSlug
      startTime = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T19:00:00`
    } else {
      return null // skip items without parseable date
    }

    return {
      id: `musiikkitalo-${Buffer.from(link).toString('base64').slice(0, 16)}`,
      title,
      shortDescription: desc ?? '',
      description: desc ?? '',
      startTime,
      endTime: null,
      location: { name: 'Musiikkitalo', streetAddress: 'Mannerheimintie 13 A', city: 'Helsinki' },
      image: imgMatch?.[1] ?? null,
      isFree: false,
      price: null,
      ticketUrl: link,
      infoUrl: link,
      categories: ['Klassinen musiikki', 'Konsertti'],
      source: 'linked-events',
    }
  }).filter((e): e is Event => e !== null)
}

// ── Kansallisooppera ja -baletti (WP REST API + individual page dates) ────────

interface OopperaProduction {
  title: { rendered: string }
  link: string
  _embedded?: { 'wp:featuredmedia'?: { source_url?: string }[] }
}

async function fetchProductionDate(pageUrl: string): Promise<{ start: string; end: string } | null> {
  try {
    const res = await fetch(pageUrl, {
      next: { revalidate: 86400, tags: ['events'] },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const html = await res.text()

    // JSON-LD EventSeries has startDate/endDate
    const ldBlocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []
    for (const block of ldBlocks) {
      try {
        const json = JSON.parse(block.replace(/<script[^>]*>|<\/script>/g, ''))
        const graph = json['@graph'] ?? [json]
        for (const node of graph) {
          if (node.startDate) return { start: node.startDate, end: node.endDate ?? node.startDate }
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return null
}

async function scrapeOoppera(): Promise<Event[]> {
  const res = await fetch(
    'https://oopperabaletti.fi/wp-json/wp/v2/production?per_page=20&_embed=1&lang=fi',
    { next: { revalidate: 3600, tags: ['events'] }, signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return []

  const productions: OopperaProduction[] = await res.json()

  // Fetch dates for all productions in parallel
  const dated = await Promise.all(
    productions.map(async (p) => {
      const dates = await fetchProductionDate(p.link)
      return { p, dates }
    })
  )

  const today = new Date().toISOString().split('T')[0]

  return dated
    .filter(({ dates }) => dates && dates.end >= today)
    .map(({ p, dates }): Event => {
      const img = p._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null
      const title = p.title.rendered.replace(/&amp;/g, '&').replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
      return {
        id: `ooppera-${Buffer.from(p.link).toString('base64').slice(0, 16)}`,
        title,
        shortDescription: 'Kansallisooppera ja -baletti',
        description: '',
        startTime: `${dates!.start}T18:00:00`,
        endTime: null,
        location: { name: 'Kansallisooppera', streetAddress: 'Helsinginkatu 58', city: 'Helsinki' },
        image: img,
        isFree: false,
        price: null,
        ticketUrl: p.link,
        infoUrl: p.link,
        categories: ['Ooppera', 'Baletti', 'Kulttuuri'],
        source: 'linked-events',
      }
    })
}

// ── Helsingin Kaupunginteatteri (HTML, show list) ─────────────────────────────

async function scrapeHKT(): Promise<Event[]> {
  const res = await fetch('https://hkt.fi/esitykset/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const articles = html.match(/<article class="show--list-item">([\s\S]*?)<\/article>/g) ?? []

  const today = new Date().toISOString().split('T')[0]

  return articles.map((block): Event | null => {
    const imgMatch = block.match(/src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))[^"]*"/)
    const titleMatch = block.match(/<h2[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    const ticketMatch = block.match(/href="(https:\/\/www\.lippu\.fi\/[^"]+)"/)

    if (!titleMatch) return null
    const [, showUrl, rawTitle] = titleMatch
    const title = rawTitle.replace(/<[^>]+>/g, '').trim()
    if (!title) return null

    return {
      id: `hkt-${Buffer.from(showUrl).toString('base64').slice(0, 16)}`,
      title,
      shortDescription: 'Helsingin Kaupunginteatteri',
      description: '',
      startTime: `${today}T19:00:00`,
      endTime: null,
      location: { name: 'Helsingin Kaupunginteatteri', streetAddress: 'Eläintarhantie 5', city: 'Helsinki' },
      image: imgMatch?.[1] ?? null,
      isFree: false,
      price: null,
      ticketUrl: ticketMatch?.[1] ?? showUrl,
      infoUrl: showUrl,
      categories: ['Teatteri', 'Kulttuuri'],
      source: 'linked-events',
    }
  }).filter((e): e is Event => e !== null)
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  const [musiikkitaloRes, oopperaRes, hktRes] = await Promise.allSettled([
    scrapeMusiikkitalo(),
    scrapeOoppera(),
    scrapeHKT(),
  ])

  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000
  const startDate = start

  let events: Event[] = [
    ...(musiikkitaloRes.status === 'fulfilled' ? musiikkitaloRes.value : []),
    ...(oopperaRes.status === 'fulfilled' ? oopperaRes.value : []),
    // HKT shows are ongoing productions — include them if dateFilter covers current week
    ...(hktRes.status === 'fulfilled' ? hktRes.value : []).filter(() => {
      const diffDays = (new Date(end).getTime() - new Date(start).getTime()) / 86400000
      return diffDays >= 1 || startDate <= new Date().toISOString().split('T')[0]
    }),
  ]

  // Filter Musiikkitalo and Ooppera by date window
  events = events.filter((e) => {
    if (e.id.startsWith('hkt-')) return true // HKT always passes (ongoing productions)
    const ts = new Date(e.startTime).getTime()
    return ts >= startTs - 7 * 86400000 && ts <= endTs + 60 * 86400000
  })

  return NextResponse.json({ events })
}
