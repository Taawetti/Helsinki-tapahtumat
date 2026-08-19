import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { scrapeMeta } from '@/lib/scrape-meta'
import { helsinkiISO } from '@/lib/helsinki-time'
import { parseLepakkomiesEvents, type LepakkomiesItem } from '@/lib/lepakkomies-parse'

const VENUE = {
  name: 'Lepakkomies',
  address: 'Helsinginkatu 1',
  city: 'Helsinki',
  lat: 60.1882,
  lon: 24.9491,
  url: 'https://lepis.fi',
}

async function scrape(): Promise<LepakkomiesItem[]> {
  const res = await fetch('https://lepis.fi/tapahtumat/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return parseLepakkomiesEvents(await res.text())
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start
  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 86400000

  let lineup: LepakkomiesItem[] = []
  let scrapeError: string | null = null
  try {
    lineup = await scrape()
    // 0 tulosta ilman kovaa virhettä = sivun rakenne todennäköisesti muuttunut
    if (lineup.length === 0) scrapeError = 'parse yielded 0 (sivun rakenne muuttunut?)'
  } catch (err) {
    scrapeError = String(err)
    console.error('[lepakkomies] scrape failed:', err)
  }
  const events: Event[] = []

  for (const e of lineup) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue
    const [y, mo, d] = e.date.split('-').map(Number)
    const [hh, mm] = e.time.split(':').map(Number)
    events.push({
      id: `lepakkomies-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Lepakkomies – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: helsinkiISO(y, mo, d, hh, mm),
      endTime: null,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: e.ticketUrl,
      infoUrl: e.ticketUrl,
      categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events, ...scrapeMeta(lineup.length, scrapeError) })
}
