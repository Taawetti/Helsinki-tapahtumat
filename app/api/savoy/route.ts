import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { scrapeMeta } from '@/lib/scrape-meta'
import { fetchLinkedEventsAll, LE_MAX_PAGE_SIZE } from '@/lib/linked-events'

// LinkedEvents location id for Savoy-teatteri (tprek:7258)
const LOCATION_ID = 'tprek:7258'

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  start_time: string
  end_time?: string
  images?: { url: string }[]
  offers?: { is_free: boolean; price?: { fi?: string; en?: string }; info_url?: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

function normalize(raw: LEEvent): Event {
  const title = raw.name?.fi || raw.name?.en || raw.name?.sv || ''
  if (!title) return null as unknown as Event
  const offer = raw.offers?.[0]
  return {
    id: raw.id,
    title,
    shortDescription: raw.short_description?.fi || raw.short_description?.en || 'Savoy-teatteri – Kasarmikatu 46, Helsinki',
    description: '',
    startTime: raw.start_time,
    endTime: raw.end_time || null,
    location: {
      name: 'Savoy-teatteri',
      streetAddress: 'Kasarmikatu 46',
      city: 'Helsinki',
      lat: 60.1634,
      lon: 24.9516,
    },
    image: raw.images?.[0]?.url ?? null,
    isFree: offer?.is_free ?? false,
    price: offer?.price?.fi || offer?.price?.en || null,
    ticketUrl: offer?.info_url?.fi || offer?.info_url?.en || null,
    infoUrl: raw.info_url?.fi || raw.info_url?.en || null,
    categories: ['Musiikki', 'Konsertti', 'Teatteri'],
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start

  // Sivutettu ja laskeva — ks. lib/linked-events.ts. Yhden talon osumamäärä
  // mahtuu yhdelle sivulle tänään, mutta yksi sivu ilman sivutusta on sama
  // viritetty ansa joka pudotti museums- ja helmet-reitit: kun raja ylittyy,
  // API vastaa 200:lla eikä mikään kerro katkaisusta.
  const buildUrl = (page: number) =>
    `https://api.hel.fi/linkedevents/v1/event/?${new URLSearchParams({
      location: LOCATION_ID,
      start,
      end,
      format: 'json',
      page: String(page),
      page_size: String(LE_MAX_PAGE_SIZE),
      sort: '-start_time',
    })}`

  const { rows, ok, truncated, total, reason, pagesFailed } = await fetchLinkedEventsAll<LEEvent>(
    buildUrl,
    () => ({ next: { revalidate: 3600, tags: ['events'] }, signal: AbortSignal.timeout(8000) }),
  )

  // HTTP 200 säilyy virheestäkin, jotta aggregaatti ei merkitse lähdettä kuolleeksi
  if (!ok) return NextResponse.json({ events: [], ...scrapeMeta(0, reason ?? 'LinkedEvents-haku epäonnistui') })
  if (truncated) console.warn(`Savoy: ${total} osumaa ylitti sivutuskaton — tulos vajaa`)
  if (pagesFailed > 0) console.warn(`Savoy: ${pagesFailed} sivua petti — tulos vajaa`)

  const events: Event[] = rows.map(normalize).filter(Boolean)
  return NextResponse.json({ events, ...scrapeMeta(rows.length) })
}
