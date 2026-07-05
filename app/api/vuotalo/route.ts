import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// LinkedEvents location id for Vuotalo (tprek:7260)
const LOCATION_ID = 'tprek:7260'

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
    shortDescription: raw.short_description?.fi || raw.short_description?.en || 'Vuotalo – Mosaiikkitori 2, Helsinki',
    description: '',
    startTime: raw.start_time,
    endTime: raw.end_time || null,
    location: {
      name: 'Vuotalo',
      streetAddress: 'Mosaiikkitori 2',
      city: 'Helsinki',
      lat: 60.2086,
      lon: 25.1488,
    },
    image: raw.images?.[0]?.url ?? null,
    isFree: offer?.is_free ?? true,
    price: offer?.price?.fi || offer?.price?.en || null,
    ticketUrl: offer?.info_url?.fi || offer?.info_url?.en || null,
    infoUrl: raw.info_url?.fi || raw.info_url?.en || null,
    categories: ['Kulttuuri', 'Yhteisö'],
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start

  const url = `https://api.hel.fi/linkedevents/v1/event/?location=${LOCATION_ID}&start=${start}&end=${end}&format=json&page_size=100&sort=start_time`

  const res = await fetch(url, {
    next: { revalidate: 3600, tags: ['events'] },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)

  if (!res?.ok) return NextResponse.json({ events: [] })

  const data = await res.json()
  const events: Event[] = (data.data || []).map(normalize).filter(Boolean)
  return NextResponse.json({ events })
}
