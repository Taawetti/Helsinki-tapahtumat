import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { parseSetlistText, stripHtml, type SetlistItem } from '@/lib/flyingdutchman-parse'
import { helsinkiISO } from '@/lib/helsinki-time'

// Kiinteä '+03:00' oli tunnin väärässä loka–maaliskuussa (EET = +02:00).
// helsinkiISO lukee offsetin kohdepäivältä.
function hkiISO(date: string, hour: number, minute: number): string {
  return helsinkiISO(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)), hour, minute)
}


const VENUE = {
  name: 'Flying Dutch',
  address: 'Pitkänsillanranta 2',
  city: 'Helsinki',
  lat: 60.1823,
  lon: 24.9519,
  url: 'https://flyingdutch.fi',
}

// Staattinen 2026 kesäsettilista — TÄYDENTÄÄ live-skrapen: jos parseri
// hajoaa tai sivu kaatuu, nämä päivät eivät katoa. Live voittaa aina
// saman päivän tapahtuman (tuoreempi tieto). Päivitetään uuden kauden
// myötä; ilman päivitystä live-skrape kantaa yksin.
// Lähde: flyingdutch.fi/HOME/ (haettu 2026-07-05)
const STATIC_2026: SetlistItem[] = [
  { title: 'Markus Holkko Quartet',                       date: '2026-05-23', time: '19:00' },
  { title: 'The Shubie Brothers',                         date: '2026-06-03', time: '19:00' },
  { title: 'Emma Salokoski & Jarmo Saari',                date: '2026-06-11', time: '19:00' },
  { title: 'DJ Borzin: Balkan Fever',                     date: '2026-06-12', time: '17:00' },
  { title: 'Tuomo',                                       date: '2026-06-25', time: '19:00' },
  { title: 'Flying Dutch: Stand Up',                      date: '2026-07-05', time: '19:00' },
  { title: 'The Stance Brothers',                         date: '2026-07-09', time: '19:00' },
  { title: 'Django Collective Helsinki',                  date: '2026-07-22', time: '19:00' },
  { title: 'Paleface DJ Set',                             date: '2026-07-25', time: '18:00' },
  { title: 'Paleface & Räjähtävä Nyrkki',                date: '2026-08-06', time: '19:00' },
  { title: 'Lightboxer',                                  date: '2026-08-20', time: '19:00' },
  { title: 'Season Wrap Up – DJs Daddy Pales & Borzin',  date: '2026-08-29', time: '19:00' },
]

async function scrapeLive(): Promise<{ lineup: SetlistItem[]; error: string | null }> {
  try {
    const res = await fetch('https://flyingdutch.fi/HOME/', {
      next: { revalidate: 3600, tags: ['events'] },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { lineup: [], error: `HTTP ${res.status}` }
    const lineup = parseSetlistText(stripHtml(await res.text()))
    // Parseri voi palauttaa 0 sivumuutoksessa — raportoi erroreksi, jotta
    // hiljainen kuolema näkyy meta-kentässä ja lokeissa (vrt. 8/2026-vika).
    return lineup.length > 0
      ? { lineup, error: null }
      : { lineup, error: 'parse yielded 0 (sivun rakenne muuttunut?)' }
  } catch (err) {
    return { lineup: [], error: String(err) }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start

  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

  const { lineup: live, error } = await scrapeLive()
  if (error) console.error('flyingdutchman scrape:', error)

  // Unioni: live päiväkohtaisesti ensisijainen, staattinen täydentää
  // puuttuvat päivät. Yksi keikka/ilta paikassa — dedup päivämäärällä.
  const liveDates = new Set(live.map((e) => e.date))
  const staticFill = STATIC_2026.filter((s) => !liveDates.has(s.date))
  const lineup = [...live, ...staticFill]

  const events: Event[] = []
  for (const e of lineup) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue

    events.push({
      id: `flyingdutchman-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Flying Dutch – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: hkiISO(e.date, Number(e.time.slice(0, 2)), Number(e.time.slice(3, 5))),
      endTime: null,
      location: {
        name: VENUE.name,
        streetAddress: VENUE.address,
        city: VENUE.city,
        lat: VENUE.lat,
        lon: VENUE.lon,
      },
      image: null,
      isFree: true,
      price: null,
      ticketUrl: VENUE.url,
      infoUrl: VENUE.url,
      categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({
    events,
    meta: { live: live.length, staticFill: staticFill.length, scrapeError: error },
  })
}
