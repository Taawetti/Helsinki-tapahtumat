import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

interface AlEvent {
  id: number
  title: { rendered: string }
  link: string
  featured_media: number
  acf: {
    title?: string
    date?: string
    purchase_link?: { url?: string; title?: string }
  }
}

// Static Allas Live 2026 lineup — WP API only has 2025 season data
// Source: allaspool.fi/allas-live/ + kohokohdat.fi/helsinki/festivaalit-helsinki/
const ALLAS_LIVE_STATIC: { title: string; date: string }[] = [
  { title: 'Allas Live: Erika Vikman',                            date: '2026-06-19' },
  { title: 'Allas Live: Ismo Alanko',                             date: '2026-06-26' },
  { title: 'Allas Live: Olavi Uusivirta',                         date: '2026-06-27' },
  { title: 'Allas Live: Gregory Porter',                          date: '2026-06-30' },
  { title: 'Allas Live: Charlie Puth',                            date: '2026-07-01' },
  { title: 'Allas Live: Käärijä',                                 date: '2026-07-03' },
  { title: 'Allas Live: J. Karjalainen',                          date: '2026-07-09' },
  { title: 'Allas Live: Arppa',                                   date: '2026-07-10' },
  { title: 'Allas Live: Jenni Vartiainen',                        date: '2026-07-11' },
  { title: 'Allas Live: Alvaro Soler',                            date: '2026-07-23' },
  { title: 'Allas Live: Antti Autio & Maustetytöt',               date: '2026-07-24' },
  { title: 'Allas Live: Vesala',                                  date: '2026-07-31' },
  { title: 'Allas Live: Ares',                                    date: '2026-08-01' },
  { title: 'Allas Live: The Ark',                                 date: '2026-08-05' },
  { title: 'Allas Live: Haloo Helsinki!',                         date: '2026-08-07' },
  { title: 'Allas Live: Charon',                                  date: '2026-08-14' },
  { title: 'Allas Live: Emmylou Harris',                          date: '2026-08-24' },
  { title: 'Allas Live: Airbourne',                               date: '2026-08-31' },
  { title: 'Allas Live: Carnival by the Sea – Poets of the Fall', date: '2026-09-06' },
  { title: 'Allas Live: Pepe Willberg',                           date: '2026-09-10' },
  { title: 'Allas Live: Pyhimys',                                 date: '2026-09-11' },
  { title: 'Allas Live: Karri Koira',                             date: '2026-09-18' },
  { title: 'Allas Live: Melo',                                    date: '2026-09-19' },
]

function parseDate(yyyymmdd: string): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null
  const y = yyyymmdd.slice(0, 4)
  const m = yyyymmdd.slice(4, 6)
  const d = yyyymmdd.slice(6, 8)
  return `${y}-${m}-${d}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword')?.toLowerCase() || ''

  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

  const events: Event[] = []
  const seenDates = new Set<string>()

  try {
    // Fetch all al-events from WP API (max 100 — covers ~30–50 events)
    const res = await fetch(
      'https://www.allaspool.fi/wp-json/wp/v2/al-events?per_page=100&_fields=id,title,link,acf,featured_media',
      {
        next: { revalidate: 3600, tags: ['events'] },
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
        signal: AbortSignal.timeout(8000),
      }
    )

    if (res.ok) {
      const raw: AlEvent[] = await res.json()

      // Deduplicate — Finnish and English versions appear as separate WP posts
      const wpSeen = new Set<string>()
      const unique: AlEvent[] = []
      for (const e of raw) {
        const title = (e.acf?.title || e.title.rendered).trim()
        const date = e.acf?.date || ''
        const key = `${title.toLowerCase()}|${date}`
        if (!wpSeen.has(key)) { wpSeen.add(key); unique.push(e) }
      }

      // Filter by requested date range
      const inRange = unique.filter((e) => {
        const d = parseDate(e.acf?.date || '')
        if (!d) return false
        const ts = new Date(d).getTime()
        return ts >= startTs && ts <= endTs
      })

      // Batch-fetch images for events that have featured_media
      const mediaIds = [...new Set(inRange.map((e) => e.featured_media).filter(Boolean))]
      const imageMap = new Map<number, string>()
      if (mediaIds.length > 0) {
        try {
          const imgRes = await fetch(
            `https://www.allaspool.fi/wp-json/wp/v2/media?include=${mediaIds.join(',')}&_fields=id,source_url&per_page=100`,
            {
              next: { revalidate: 86400 },
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
              signal: AbortSignal.timeout(6000),
            }
          )
          if (imgRes.ok) {
            const imgs: { id: number; source_url: string }[] = await imgRes.json()
            for (const img of imgs) imageMap.set(img.id, img.source_url)
          }
        } catch {
          // images optional — proceed without
        }
      }

      for (const e of inRange) {
        const title = (e.acf?.title || e.title.rendered).trim()
        const date = parseDate(e.acf?.date || '')
        if (!title || !date) continue
        if (keyword && !title.toLowerCase().includes(keyword)) continue

        seenDates.add(date)
        events.push({
          id: `allas-${e.id}`,
          title,
          shortDescription: 'Allas Sea Pool — Helsinki',
          description: '',
          startTime: `${date}T19:00:00+03:00`,
          endTime: null,
          location: {
            name: 'Allas Sea Pool',
            streetAddress: 'Katajanokanlaituri 2a',
            city: 'Helsinki',
            lat: 60.1674,
            lon: 24.9565,
          },
          image: e.featured_media ? (imageMap.get(e.featured_media) ?? null) : null,
          isFree: false,
          price: null,
          ticketUrl: e.acf?.purchase_link?.url || e.link,
          infoUrl: e.link,
          categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
          source: 'linked-events',
        })
      }
    }
  } catch {
    // WP API unavailable — fall through to static list
  }

  // Static 2026 events — supplement WP API (which only has 2025 data)
  for (const s of ALLAS_LIVE_STATIC) {
    const ts = new Date(s.date).getTime()
    if (ts < startTs || ts > endTs) continue
    if (keyword && !s.title.toLowerCase().includes(keyword)) continue
    if (seenDates.has(s.date)) continue

    seenDates.add(s.date)
    events.push({
      id: `allas-static-${s.date.replace(/-/g, '')}`,
      title: s.title,
      shortDescription: 'Allas Sea Pool — Helsinki',
      description: '',
      startTime: `${s.date}T19:00:00+03:00`,
      endTime: null,
      location: {
        name: 'Allas Sea Pool',
        streetAddress: 'Katajanokanlaituri 2a',
        city: 'Helsinki',
        lat: 60.1674,
        lon: 24.9565,
      },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: 'https://www.allaspool.fi/allas-live/',
      infoUrl: 'https://www.allaspool.fi/allas-live/',
      categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events })
}
