import { NextRequest, NextResponse } from 'next/server'
import { helsinkiToday } from '@/lib/helsinki-time'
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
      startTimeApprox: true, // päivä luetaan slugista, klo 19 on oletus
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
      signal: AbortSignal.timeout(2000),
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
    'https://oopperabaletti.fi/wp-json/wp/v2/production?per_page=8&_embed=1&lang=fi',
    { next: { revalidate: 3600, tags: ['events'] }, signal: AbortSignal.timeout(6000) }
  )
  if (!res.ok) return []

  const productions: OopperaProduction[] = await res.json()

  // Fetch dates for all productions in parallel, abort stragglers at 2 s
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
        startTimeApprox: true, // vain päivä tiedossa — klo 18 on oletus
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

// HKT POISTETTU LÄHTEENÄ 5.9.2026 (auditointi): hkt.fi/esitykset on
// OHJELMISTOSIVU (koko repertuaari), ei näytöskalenteri. Skrape keksi
// jokaiselle näytelmälle esitysajan "tänään klo 19" joka ikinen päivä —
// tuotannossa 18 tapahtumaa väärällä ajalla ja samalla id:llä
// (base64(url).slice(0,16) katkesi ennen erottelevaa osaa). Samat näytelmät
// tulevat sovellukseen lippu.fi:stä ja stadissasta OIKEILLA näytösajoilla
// ("& Julia" näkyi kolmena korttina, joista vain kaksi oli oikein).
// Jos HKT halutaan omana lähteenä takaisin, skrapattava näytelmäsivujen
// näytöskalenteri tai lippu.fi:n erid-sivu — ei ohjelmistosivua.

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  // Oletus HELSINKI-päivä: UTC-päivä on yöllä 00–03 eilinen (auditointi).
  const start = searchParams.get('start') || helsinkiToday()
  const end = searchParams.get('end') || start

  const [musiikkitaloRes, oopperaRes] = await Promise.allSettled([
    scrapeMusiikkitalo(),
    scrapeOoppera(),
  ])

  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

  let events: Event[] = [
    ...(musiikkitaloRes.status === 'fulfilled' ? musiikkitaloRes.value : []),
    ...(oopperaRes.status === 'fulfilled' ? oopperaRes.value : []),
  ]

  // Filter Musiikkitalo and Ooppera by date window
  events = events.filter((e) => {
    const ts = new Date(e.startTime).getTime()
    return ts >= startTs - 7 * 86400000 && ts <= endTs + 60 * 86400000
  })

  return NextResponse.json({ events })
}
