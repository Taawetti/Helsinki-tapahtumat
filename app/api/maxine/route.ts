import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { scrapeMeta } from '@/lib/scrape-meta'
import { parseMaxineTribe } from '@/lib/maxine-parse'
import { helsinkiISO } from '@/lib/helsinki-time'

const VENUE = {
  name: 'Maxine',
  address: 'Urho Kekkosen katu 1',
  city: 'Helsinki',
  lat: 60.1688,
  lon: 24.9483,
  url: 'https://maxine.fi',
}

// Maxine: klubi-illat The Events Calendar -pluginin valmiista REST-rajapinnasta.
// Rajapinta palauttaa oletuksena vain tulevat tapahtumat nousevassa
// järjestyksessä; ajat ovat Europe/Helsinki-aikaa.
async function scrape(): Promise<ReturnType<typeof parseMaxineTribe>> {
  const res = await fetch('https://maxine.fi/wp-json/tribe/events/v1/events?per_page=50', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseMaxineTribe(await res.json())
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
    console.error('[maxine] scrape failed:', err)
  }
  if (items.length === 0 && !scrapeError) {
    scrapeError = 'parse yielded 0 (sivun rakenne muuttunut?)'
  }

  const events: Event[] = []
  for (const e of items) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue
    const [h, m] = e.time.split(':').map(Number)
    // Klubit päättyvät vasta aamuyöllä — loppuaika mukana kun API sen kertoo
    const endTime = e.endDate && e.endTime
      ? helsinkiISO(Number(e.endDate.slice(0, 4)), Number(e.endDate.slice(5, 7)), Number(e.endDate.slice(8, 10)), Number(e.endTime.slice(0, 2)), Number(e.endTime.slice(3, 5)))
      : null
    events.push({
      id: `maxine-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Maxine – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: helsinkiISO(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)), Number(e.date.slice(8, 10)), h, m),
      endTime,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: e.image,
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
