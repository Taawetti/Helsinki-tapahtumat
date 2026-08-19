import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { scrapeMeta } from '@/lib/scrape-meta'
import { parseTanssintaloEntries } from '@/lib/tanssintalo-parse'
import { helsinkiISO, helsinkiToday } from '@/lib/helsinki-time'

const VENUE = {
  name: 'Tanssin talo',
  address: 'Tallberginkatu 1',
  city: 'Helsinki',
  lat: 60.1619,
  lon: 24.9058,
  url: 'https://www.tanssintalo.fi',
}

// Craft CMS:n GraphQL-kysely — sama kuin sivuston oma ohjelmakalenteri
// (Vue-sovellus) tekee. endDate-suodatin ">= tänään" rajaa pois jo
// päättyneet esityssarjat; yksittäiset menneet esityskerrat karsii
// reitin ikkunafiltteri.
const GQL = `query ($endDate: [QueryArgument]) {
  entries(section: "experiences", site: "fi", hideFromLandingPage: false, orderBy: "startDate asc", endDate: $endDate) {
    ... on experience_Entry { id title url ticketLink irregularShowTimes { date time } }
  }
}`

// Tanssin talo: esitykset Craft CMS:n GraphQL-rajapinnasta (GET, jotta
// Nextin revalidate-välimuisti toimii kuten muissakin venue-skrapereissa).
async function scrape(): Promise<ReturnType<typeof parseTanssintaloEntries>> {
  const params = new URLSearchParams({
    query: GQL,
    variables: JSON.stringify({ endDate: `>= ${helsinkiToday()}` }),
  })
  const res = await fetch(`https://www.tanssintalo.fi/api?${params}`, {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseTanssintaloEntries(await res.json())
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
    console.error('[tanssintalo] scrape failed:', err)
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
      id: `tanssintalo-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Tanssin talo – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: helsinkiISO(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)), Number(e.date.slice(8, 10)), h, m),
      endTime: null,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: e.ticketUrl ?? e.url,
      infoUrl: e.url,
      categories: ['Tanssi', 'Kulttuuri', 'Näyttämötaide'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events, ...scrapeMeta(items.length, scrapeError) })
}
