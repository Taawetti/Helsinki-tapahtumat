import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const RA_URL = 'https://ra.co/graphql'
const RA_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Helsinki-Tapahtumat/1.0 (timo.heinamaki@datagorilla.fi)',
  'Referer': 'https://ra.co/',
}

let cachedAreaId: number | null = null

async function getHelsinkiAreaId(): Promise<number | null> {
  if (cachedAreaId !== null) return cachedAreaId

  const res = await fetch(RA_URL, {
    method: 'POST',
    headers: RA_HEADERS,
    body: JSON.stringify({
      query: '{ areas(searchTerm: "helsinki", limit: 5) { id name country { name } } }',
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) return null

  const data = await res.json()
  const areas: { id: number; name: string }[] = data?.data?.areas ?? []
  const match = areas.find((a) => a.name.toLowerCase().includes('helsinki'))
  if (!match) return null

  cachedAreaId = match.id
  return cachedAreaId
}

interface RAVenue {
  name?: string
  address?: string
}

interface RAImage {
  filename?: string
}

interface RAGenre {
  name?: string
}

interface RAEventPayload {
  id: string
  title: string
  date?: string
  startTime?: string
  endTime?: string
  contentUrl?: string
  venue?: RAVenue
  images?: RAImage[]
  genres?: RAGenre[]
  artists?: { name?: string }[]
}

function mapCategories(genres: RAGenre[]): string[] {
  const names = genres.map((g) => g.name?.toLowerCase() ?? '')

  for (const n of names) {
    if (n.includes('techno') || n.includes('tech house') || n.includes('industrial')) {
      return ['Techno', 'Klubi', 'Yöelämä']
    }
    if (n.includes('house') || n.includes('deep house') || n.includes('disco')) {
      return ['House', 'Klubi', 'Yöelämä']
    }
    if (n.includes('drum and bass') || n.includes('dnb') || n.includes('drum & bass')) {
      return ['Drum & Bass', 'Klubi']
    }
    if (n.includes('ambient') || n.includes('experimental')) {
      return ['Ambient', 'Elektroninen']
    }
    if (n.includes('electronic') || n.includes('elektroni')) {
      return ['Elektroninen', 'Klubi', 'Yöelämä']
    }
  }

  return ['Klubi', 'Yöelämä', 'DJ']
}

function normalize(raw: RAEventPayload): Event {
  const genres = raw.genres ?? []
  const genreNames = genres
    .slice(0, 3)
    .map((g) => g.name ?? '')
    .filter(Boolean)
    .join(', ')

  const imageFilename = raw.images?.[0]?.filename
  const image =
    imageFilename && imageFilename.startsWith('/')
      ? `https://ra.co${imageFilename}`
      : null

  const ticketUrl = raw.contentUrl ? `https://ra.co${raw.contentUrl}` : null

  return {
    id: `ra-${raw.id}`,
    title: raw.title,
    shortDescription: `${raw.venue?.name || 'Helsinki'} — ${genreNames}`,
    description: '',
    startTime: raw.startTime ?? `${raw.date}T22:00:00`,
    endTime: raw.endTime ?? null,
    location: {
      name: raw.venue?.name ?? '',
      streetAddress: raw.venue?.address ?? '',
      city: 'Helsinki',
    },
    image,
    isFree: false,
    price: null,
    ticketUrl,
    infoUrl: ticketUrl,
    categories: mapCategories(genres),
    source: 'linked-events' as const,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  try {
    const areaId = await getHelsinkiAreaId()
    if (areaId === null) return NextResponse.json({ events: [] })

    const res = await fetch(RA_URL, {
      method: 'POST',
      headers: RA_HEADERS,
      body: JSON.stringify({
        query:
          'query GetEvents($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) { eventListings(filters: $filters, pageSize: $pageSize, page: $page) { data { event { id title date startTime endTime contentUrl venue { name address } images { filename } genres { name } artists { name } } } totalResults } }',
        variables: {
          filters: {
            areas: { eq: areaId },
            listingDate: {
              gte: `${start}T00:00:00.000Z`,
              lte: `${end}T23:59:59.000Z`,
            },
          },
          pageSize: 50,
          page: 1,
        },
      }),
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 3600, tags: ['events'] },
    })

    if (!res.ok) return NextResponse.json({ events: [] })

    const data = await res.json()
    const listings: { event: RAEventPayload }[] = data?.data?.eventListings?.data ?? []
    const events: Event[] = listings.map((l) => normalize(l.event))

    return NextResponse.json({ events })
  } catch {
    return NextResponse.json({ events: [] })
  }
}
