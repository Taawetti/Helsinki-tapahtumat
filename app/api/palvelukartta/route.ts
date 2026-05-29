import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// service_node IDs: 745 = museot, 2436 = uimahallit/liikuntahallit
const SERVICE_NODES = [745, 2436]

interface PalvelukarttaUnit {
  id: number
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  description?: { fi?: string; en?: string }
  street_address?: { fi?: string; en?: string }
  address_postal_full?: { fi?: string; en?: string }
  municipality?: string
  www?: string
  picture_url?: string
  location?: { type: string; coordinates: [number, number] }
  service_nodes?: number[]
}

function unitToEvent(u: PalvelukarttaUnit, today: string): Event {
  const name = u.name?.fi || u.name?.en || u.name?.sv || 'Nimetön paikka'
  const address = u.street_address?.fi || u.street_address?.en || ''
  const city = u.municipality
    ? u.municipality.charAt(0).toUpperCase() + u.municipality.slice(1)
    : 'Helsinki'
  const desc = u.short_description?.fi || u.short_description?.en || ''

  const isMuseum = u.service_nodes?.some((n) => [745, 362, 363, 746, 747].includes(n)) ?? false
  const isSwimming = u.service_nodes?.some((n) => [2436, 2432, 2434, 2435].includes(n)) ?? false

  const categories = isMuseum
    ? ['Museo', 'Kulttuuri']
    : isSwimming
    ? ['Uimahalli', 'Liikunta']
    : ['Kulttuuri']

  return {
    id: `palvelukartta-${u.id}`,
    title: name,
    shortDescription: desc,
    description: desc,
    startTime: `${today}T10:00:00`,
    endTime: `${today}T20:00:00`,
    location: {
      name,
      streetAddress: address,
      city,
      lat: u.location?.coordinates?.[1],
      lon: u.location?.coordinates?.[0],
    },
    image: u.picture_url ?? null,
    isFree: isMuseum ? false : true,
    price: null,
    ticketUrl: u.www ?? null,
    infoUrl: u.www ?? null,
    categories,
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  // Only show places when the requested date is today or near future (not past searches)
  if (start < today) return NextResponse.json({ events: [] })

  try {
    const fetches = SERVICE_NODES.map((node) =>
      fetch(
        `https://api.hel.fi/servicemap/v2/unit/?format=json&service_node=${node}&municipality=helsinki,espoo,vantaa&page_size=100`,
        {
          next: { revalidate: 86400, tags: ['events'] },
          signal: AbortSignal.timeout(8000),
        }
      ).then((r) => (r.ok ? r.json() : { results: [] }))
    )

    const results = await Promise.all(fetches)
    const units: PalvelukarttaUnit[] = results.flatMap((r) => r.results ?? [])

    // Deduplicate by ID (a unit can match multiple service nodes)
    const seen = new Set<number>()
    const unique = units.filter((u) => {
      if (seen.has(u.id)) return false
      seen.add(u.id)
      return true
    })

    const events = unique.map((u) => unitToEvent(u, start))

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Palvelukartta error:', err)
    return NextResponse.json({ events: [] })
  }
}
