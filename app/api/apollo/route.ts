import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { scrapeMeta } from '@/lib/scrape-meta'
import { parseApolloGrid } from '@/lib/apollo-parse'
import { helsinkiISO } from '@/lib/helsinki-time'

const VENUE = {
  name: 'Apollo Live Club',
  address: 'Mannerheimintie 16',
  city: 'Helsinki',
  lat: 60.1689,
  lon: 24.9394,
  url: 'https://apolloliveclub.fi',
}

// Apollo Live Club: keikat /tapahtumat/-sivun The Post Grid -ruudukosta.
// Ruudukko listaa kaikki julkaistut tulevat keikat kerralla (excerptissä
// koko päivämäärä vuosineen), joten yksi haku riittää.
async function scrape(): Promise<ReturnType<typeof parseApolloGrid>> {
  const res = await fetch('https://apolloliveclub.fi/tapahtumat/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseApolloGrid(await res.text())
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start
  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 86400000

  let items: Awaited<ReturnType<typeof scrape>> = []
  let scrapeError: string | null = null
  try {
    items = await scrape()
  } catch (err) {
    scrapeError = String(err)
    console.error('[apollo] scrape failed:', err)
  }
  if (items.length === 0 && !scrapeError) {
    scrapeError = 'parse yielded 0 (sivun rakenne muuttunut?)'
  }

  const events: Event[] = []
  for (const e of items) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue
    const [h, m] = e.time.split(':').map(Number)
    events.push({
      id: `apollo-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Apollo Live Club – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: helsinkiISO(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)), Number(e.date.slice(8, 10)), h, m),
      endTime: null,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: null,
      isFree: false,
      price: e.price,
      ticketUrl: e.url || VENUE.url,
      infoUrl: e.url || VENUE.url,
      categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events, ...scrapeMeta(items.length, scrapeError) })
}
