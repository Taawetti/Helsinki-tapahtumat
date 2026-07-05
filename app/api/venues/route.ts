import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

interface VenueEvent {
  url: string
  date: string
  slug: string
  id: string
  title: string
  image: string | null
  city: string
  address: string
  venueName: string
  price: string | null
}

// ── Tavastia & Semifinal (same site, different URL) ──────────────────────────

async function scrapeTavastiaLike(pageUrl: string, venueName: string, address: string): Promise<VenueEvent[]> {
  const res = await fetch(pageUrl, {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const daysectionMatch = html.match(/id="block-tiketti-daylist"[\s\S]*/)
  const section = daysectionMatch ? daysectionMatch[0] : html

  const blockPattern = /<a href="(https:\/\/tavastiaklubi\.fi\/events\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/(\d+)\/?)"[^>]*class="item"[\s\S]*?<\/a>/g

  const results: VenueEvent[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = blockPattern.exec(section)) !== null) {
    const [block, url, date, slug, eid] = match
    if (seen.has(eid)) continue
    seen.add(eid)

    const titleMatch = block.match(/<div class="title">\s*([\s\S]*?)\s*<\/div>/)
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''
    if (!title) continue

    const priceMatch = block.match(/(\d+)\s*€/)
    const price = priceMatch ? `${priceMatch[1]} €` : null

    results.push({
      url,
      date,
      slug,
      id: eid,
      title,
      image: `https://www.tiketti.fi/kuvat/EV${eid}_7_768x470.jpg`,
      city: 'Helsinki',
      address,
      venueName,
      price,
    })
  }
  return results
}

// ── Kuudes Linja ─────────────────────────────────────────────────────────────

function parseFinnishDate(pvm: string): string {
  const m = pvm.match(/(\d{1,2})\.(\d{1,2})\./)
  if (!m) return new Date().toISOString().split('T')[0]
  const day = parseInt(m[1])
  const month = parseInt(m[2])
  const today = new Date()
  let year = today.getFullYear()
  if (new Date(year, month - 1, day) < today) year++
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function scrapeKuudesLinja(): Promise<VenueEvent[]> {
  const res = await fetch('https://kuudeslinja.com', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const articles = html.match(/<article class="event">([\s\S]*?)<\/article>/g) ?? []

  return articles.map((block, i): VenueEvent | null => {
    const pvmMatch = block.match(/class="pvm">([\s\S]*?)</)
    const titleMatch = block.match(/class="title">([\s\S]*?)</)
    const ticketMatch = block.match(/href="(https:\/\/[^"]*tiketti[^"]+)"/)
    const infoMatch = block.match(/class="info">([\s\S]*?)<\/div>/)

    const rawDate = pvmMatch?.[1]?.trim() ?? ''
    const title = titleMatch?.[1]?.trim() ?? ''
    if (!title || !rawDate) return null

    const date = parseFinnishDate(rawDate)
    const priceMatch = infoMatch?.[1]?.match(/(\d+)\s*€/)

    return {
      url: 'https://kuudeslinja.com',
      date,
      slug: `kuudeslinja-${i}`,
      id: `kl-${date}-${i}`,
      title,
      image: null,
      city: 'Helsinki',
      address: 'Hämeentie 13',
      venueName: 'Kuudes Linja',
      price: priceMatch ? `${priceMatch[1]} €` : null,
    }
  }).filter((e): e is VenueEvent => e !== null)
}

// ── Bar Loose ─────────────────────────────────────────────────────────────────

interface BarLooseEvent {
  id: number
  title: string
  start_date: string
  url: string
  image?: { url?: string }
  cost?: string
  description?: string
}

async function scrapeBarLoose(): Promise<VenueEvent[]> {
  const today = new Date().toISOString().split('T')[0]
  const res = await fetch(
    `https://barloose.com/wp-json/tribe/events/v1/events?per_page=50&start_date=${today}`,
    { next: { revalidate: 3600, tags: ['events'] }, signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return []

  const data = await res.json()
  const events: BarLooseEvent[] = data.events ?? []

  return events.map((e): VenueEvent => {
    const dt = new Date(e.start_date)
    const date = e.start_date.slice(0, 10)
    return {
      url: e.url,
      date,
      slug: `barloose-${e.id}`,
      id: String(e.id),
      title: e.title.replace(/&amp;/g, '&').replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"'),
      image: e.image?.url ?? null,
      city: 'Helsinki',
      address: 'Fredrikinkatu 34',
      venueName: 'Bar Loose',
      price: e.cost && e.cost !== '0' ? e.cost : null,
    }
  })
}

// ── Ääniwalli ─────────────────────────────────────────────────────────────────

async function scrapeAaniwalli(): Promise<VenueEvent[]> {
  const res = await fetch('https://aaniwalli.fi/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()

  // Match event anchors: <a href="/events/YYYY-MM-DD-slug">...</a>
  const eventPattern = /<a\s+href="(\/events\/(\d{4}-\d{2}-\d{2})[^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const results: VenueEvent[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null

  while ((m = eventPattern.exec(html)) !== null) {
    const [block, href, date, inner] = m
    if (seen.has(href)) continue
    seen.add(href)

    const titleMatch = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)
    const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim()
    if (!title) continue

    const imgMatch = inner.match(/<img[^>]+src="([^"]+)"/)
    const image = imgMatch?.[1] ? `https://aaniwalli.fi${imgMatch[1]}` : null

    // Adjacent "Osta liput" link immediately after this event block
    const after = html.slice(m.index + block.length, m.index + block.length + 400)
    const ticketMatch = after.match(/<a\s+href="([^"]+)"[^>]*>\s*Osta liput\s*<\/a>/)
    const ticketUrl = ticketMatch?.[1] ?? `https://aaniwalli.fi${href}`

    results.push({
      url: ticketUrl,
      date,
      slug: href.replace('/events/', ''),
      id: `aaniwalli-${href.replace('/events/', '')}`,
      title,
      image,
      city: 'Helsinki',
      address: '',
      venueName: 'Ääniwalli',
      price: null,
    })
  }
  return results
}

// ── Shared toEvent ─────────────────────────────────────────────────────────────

function toEvent(v: VenueEvent): Event {
  return {
    id: `venue-${v.venueName.toLowerCase().replace(/\s/g, '-')}-${v.id}`,
    title: v.title,
    shortDescription: `${v.venueName} — ${v.city}`,
    description: '',
    startTime: `${v.date}T19:00:00+03:00`,
    endTime: null,
    location: {
      name: v.venueName,
      streetAddress: v.address,
      city: v.city,
    },
    image: v.image,
    isFree: !v.price || v.price.toLowerCase().includes('vapaa'),
    price: v.price,
    ticketUrl: v.url,
    infoUrl: v.url,
    categories: ['Musiikki', 'Keikka'],
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword')?.toLowerCase() || ''

  const [tavastiaRes, semifinalRes, kuudesLinjaRes, barLooseRes, aaniwalliRes] = await Promise.allSettled([
    scrapeTavastiaLike('https://tavastiaklubi.fi/', 'Tavastia', 'Urho Kekkosen katu 4-6'),
    scrapeTavastiaLike('https://tavastiaklubi.fi/semifinal/', 'Semifinal', 'Urho Kekkosen katu 4-6'),
    scrapeKuudesLinja(),
    scrapeBarLoose(),
    scrapeAaniwalli(),
  ])

  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

  const allRaw = [tavastiaRes, semifinalRes, kuudesLinjaRes, barLooseRes, aaniwalliRes]
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

  let events = allRaw
    .map(toEvent)
    .filter((e) => {
      const ts = new Date(e.startTime).getTime()
      return ts >= startTs && ts <= endTs
    })

  return NextResponse.json({ events })
}
