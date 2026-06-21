import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const EVENTIM_BASE = 'https://public-api.eventim.com/websearch/search/api/exploration/v1/products'

interface EventimProduct {
  name: string
  description?: string
  imageUrl?: string
  link: string
  price?: number
  currency?: string
  inStock?: boolean
  status?: string
  productId: string
  categories?: { name: string; parentCategory?: { name: string } }[]
  typeAttributes?: {
    liveEntertainment?: {
      startDate?: string
      endDate?: string
      location?: {
        name?: string
        city?: string
        postalCode?: string
        geoLocation?: { latitude: number; longitude: number }
      }
    }
  }
}

function normalize(p: EventimProduct, today: string): Event | null {
  const le = p.typeAttributes?.liveEntertainment
  if (!le?.startDate) return null

  const startTime = le.startDate
  const startDate = startTime.slice(0, 10)
  if (startDate < today) return null

  const venueName = le.location?.name || ''
  const city = le.location?.city || 'Helsinki'
  const lat = le.location?.geoLocation?.latitude
  const lon = le.location?.geoLocation?.longitude

  const isFree = p.price === 0
  const priceStr = p.price && p.price > 0
    ? `${p.price.toFixed(2).replace('.', ',')} €`
    : null

  const categories = (p.categories || [])
    .filter(c => !c.parentCategory)
    .map(c => c.name)
    .filter(Boolean)
    .slice(0, 3)

  return {
    id: `lippu-${p.productId}`,
    title: p.name,
    shortDescription: p.description || '',
    description: p.description || '',
    startTime,
    endTime: le.endDate || null,
    location: {
      name: venueName,
      streetAddress: '',
      city,
      ...(lat !== undefined && lon !== undefined ? { lat, lon } : {}),
    },
    image: p.imageUrl || null,
    isFree,
    price: priceStr,
    ticketUrl: p.link,
    infoUrl: p.link,
    categories,
    source: 'lippu',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start
  const today = new Date().toISOString().slice(0, 10)

  const params = new URLSearchParams({
    webId: 'web__lippu-fi',
    language: 'fi',
    retail_partner: 'LPU',
    city_names: 'Helsinki',
    page: '1',
    top: '100',
    date_from: start,
    date_to: end,
  })

  try {
    const res = await fetch(`${EVENTIM_BASE}?${params}`, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    })

    if (!res.ok) return NextResponse.json({ events: [] })

    const data = await res.json()
    const products: EventimProduct[] = data.products || []

    const events: Event[] = products
      .map(p => normalize(p, today))
      .filter((e): e is Event => e !== null)

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Lippu.fi API error:', err)
    return NextResponse.json({ events: [] })
  }
}
