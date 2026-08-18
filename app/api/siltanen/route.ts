import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { scrapeMeta } from '@/lib/scrape-meta'
import { parseSiltanenGrid } from '@/lib/siltanen-parse'
import { helsinkiISO, helsinkiToday } from '@/lib/helsinki-time'

const VENUE = {
  name: 'Siltanen',
  address: 'Hämeentie 13 B',
  city: 'Helsinki',
  lat: 60.1812,
  lon: 24.9503,
  url: 'https://siltanen.org',
}

// Siltanen: klubi- ja terassiohjelma etusivun Simple Calendar -ruudukosta.
// Ruudukko näyttää aina KULUVAN kuukauden (AJAX-navigaatio vaatii noncen,
// joten tulevia kuukausia ei haeta — venuen ohjelma julkistuu käytännössä
// kuluvan kuukauden verran eteenpäin).
async function scrape(): Promise<ReturnType<typeof parseSiltanenGrid>> {
  const res = await fetch('https://siltanen.org/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseSiltanenGrid(await res.text(), helsinkiToday().slice(0, 7))
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || helsinkiToday()
  const end = searchParams.get('end') || start
  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 86400000

  let items: Awaited<ReturnType<typeof scrape>> = []
  let scrapeError: string | null = null
  try {
    items = await scrape()
  } catch (err) {
    scrapeError = String(err)
    console.error('[siltanen] scrape failed:', err)
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
      id: `siltanen-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Siltanen – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: helsinkiISO(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)), Number(e.date.slice(8, 10)), h, m),
      endTime: null,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: e.ticketUrl ?? VENUE.url,
      infoUrl: e.ticketUrl ?? VENUE.url,
      categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events, ...scrapeMeta(items.length, scrapeError) })
}
