import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// Finna.fi — Finnish national digital library/museum/archive API
// Public API, no key required. Covers exhibitions and collections from Finnish museums.
// API docs: https://api.finna.fi/api/v1/docs/swagger-ui.html

const FINNA_BASE = 'https://api.finna.fi/api/v1'

// Helsinki-area museum institution names (matched against Finna building values)
const HELSINKI_KEYWORDS = [
  'helsinki', 'espoo', 'vantaa', 'kiasma', 'ateneum', 'kansallismuseo',
  'designmuseo', 'hal ', 'ham ', 'kaupunginmuseo', 'sinebrychoff',
  'luonnontieteellinen', 'taidehalli', 'emma', 'weegeeworks', 'espoon museo',
]

interface FinnaRecord {
  id: string
  title?: string
  summary?: string[]
  images?: string[]
  buildings?: { value: string; translated?: string }[]
  urls?: { value: string; description?: string }[]
  year?: string
  formats?: { value: string; translated?: string }[]
}

function isHelsinki(record: FinnaRecord): boolean {
  const buildings = (record.buildings ?? []).map((b) => (b.translated || b.value).toLowerCase())
  return HELSINKI_KEYWORDS.some((kw) => buildings.some((b) => b.includes(kw)))
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  // Only show for current/future dates
  if (start < today) return NextResponse.json({ events: [] })

  try {
    const params = new URLSearchParams({
      lookfor: 'näyttely helsinki',
      type: 'AllFields',
      limit: '40',
      lng: 'fi',
      sort: 'relevance',
    })
    params.append('filter[]', 'sector_str_mv:"Museoala"')
    params.append('field[]', 'title')
    params.append('field[]', 'summary')
    params.append('field[]', 'images')
    params.append('field[]', 'buildings')
    params.append('field[]', 'urls')
    params.append('field[]', 'formats')

    const res = await fetch(`${FINNA_BASE}/search?${params}`, {
      next: { revalidate: 3600, tags: ['events'] },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return NextResponse.json({ events: [] })

    const data = await res.json()
    const records: FinnaRecord[] = data.records ?? []

    const events: Event[] = records
      .filter((r) => r.title && isHelsinki(r))
      .map((r): Event => {
        const building = r.buildings?.[0]
        const institutionName = building?.translated || building?.value || 'Helsinki'
        const url = r.urls?.[0]?.value ?? null
        const imageUrl = r.images?.[0]
          ? `https://api.finna.fi${r.images[0]}`
          : null

        return {
          id: `finna-${r.id}`,
          title: r.title!,
          shortDescription: r.summary?.[0]?.slice(0, 200) ?? '',
          description: r.summary?.[0] ?? '',
          startTime: `${start}T10:00:00`,
          endTime: `${start}T18:00:00`,
          location: {
            name: institutionName,
            streetAddress: '',
            city: 'Helsinki',
          },
          image: imageUrl,
          isFree: false,
          price: null,
          ticketUrl: url,
          infoUrl: url,
          categories: ['Museo', 'Näyttely', 'Kulttuuri'],
          source: 'linked-events',
        }
      })

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Finna error:', err)
    return NextResponse.json({ events: [] })
  }
}
