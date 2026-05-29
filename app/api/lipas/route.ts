import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// City codes: 91=Helsinki, 49=Espoo, 92=Vantaa
// Type codes: 1520=luistelukenttä, 1530=kaukalo (tekojää), 4401=frisbeegolf, 1160=ulkokuntoilupaikka
const CITY_CODES = '91,49,92'
const TYPE_CODES = '1520,1530,4401,1160'

interface LipasLocation {
  address?: string
  'postal-office'?: string
  city?: { 'city-code'?: number }
  geometries?: {
    features?: { geometry?: { coordinates?: [number, number] } }[]
  }
}

interface LipasSite {
  'lipas-id': number
  name: string
  type?: { 'type-code'?: number }
  status?: string
  www?: string
  'phone-number'?: string
  location?: LipasLocation
  properties?: {
    'free-use?'?: boolean
  }
}

const CITY_NAMES: Record<number, string> = {
  91: 'Helsinki',
  49: 'Espoo',
  92: 'Vantaa',
}

const TYPE_LABELS: Record<number, { title: string; categories: string[] }> = {
  1520: { title: 'Luistelukenttä', categories: ['Luistelu', 'Liikunta', 'Ulkoilu'] },
  1530: { title: 'Tekojääkaukalo', categories: ['Luistelu', 'Liikunta', 'Ulkoilu'] },
  4401: { title: 'Frisbeegolfrata', categories: ['Frisbeegolf', 'Liikunta', 'Ulkoilu'] },
  1160: { title: 'Ulkokuntoilupaikka', categories: ['Kuntoilu', 'Liikunta', 'Ulkoilu'] },
}

function siteToEvent(s: LipasSite, today: string): Event {
  const typeCode = s.type?.['type-code'] ?? 0
  const label = TYPE_LABELS[typeCode]
  const cityCode = s.location?.city?.['city-code'] ?? 91
  const city = CITY_NAMES[cityCode] ?? 'Helsinki'
  const coords = s.location?.geometries?.features?.[0]?.geometry?.coordinates

  const isFree = s.properties?.['free-use?'] ?? true

  return {
    id: `lipas-${s['lipas-id']}`,
    title: s.name,
    shortDescription: label ? `${label.title} — ${city}` : city,
    description: '',
    startTime: `${today}T08:00:00`,
    endTime: `${today}T22:00:00`,
    location: {
      name: s.name,
      streetAddress: s.location?.address ?? '',
      city,
      lat: coords ? coords[1] : undefined,
      lon: coords ? coords[0] : undefined,
    },
    image: null,
    isFree,
    price: null,
    ticketUrl: s.www ?? null,
    infoUrl: s.www ?? null,
    categories: label?.categories ?? ['Liikunta', 'Ulkoilu'],
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  // Only show outdoor facilities for current/near-future dates
  if (start < today) return NextResponse.json({ events: [] })

  try {
    const res = await fetch(
      `https://api.lipas.fi/v2/sports-sites?city-codes=${CITY_CODES}&type-codes=${TYPE_CODES}&page=1&pageSize=200`,
      {
        next: { revalidate: 86400, tags: ['events'] },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) return NextResponse.json({ events: [] })

    const sites: LipasSite[] = await res.json()

    const events = sites
      .filter((s) => s.status === 'active')
      .map((s) => siteToEvent(s, start))

    return NextResponse.json({ events })
  } catch (err) {
    console.error('LIPAS error:', err)
    return NextResponse.json({ events: [] })
  }
}
