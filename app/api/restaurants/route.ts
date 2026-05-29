import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import type { Restaurant } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────

interface OSMElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// ── OpenStreetMap Overpass ────────────────────────────────
// Helsinki+Espoo+Vantaa bounding box (south,west,north,east)

const OSM_BBOX = '60.09,24.58,60.41,25.26'
const OSM_QUERY = `[out:json][timeout:30][bbox:${OSM_BBOX}];(node["amenity"~"^(restaurant|cafe|bar|pub|fast_food|food_court|biergarten)$"]["name"];way["amenity"~"^(restaurant|cafe|bar|pub|fast_food|food_court|biergarten)$"]["name"];);out center;`

// Mirrors in priority order — main Overpass is behind CloudFlare and blocks some IPs
const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const OSM_HEADERS = {
  'User-Agent': 'Helsinki-Tapahtumat/1.0 (https://github.com/Taawetti/Helsinki-tapahtumat)',
  'Accept': 'application/json',
}

function osmAmenityToType(amenity?: string): Restaurant['type'] {
  switch (amenity) {
    case 'cafe': return 'kahvila'
    case 'bar':
    case 'pub':
    case 'biergarten': return 'baari'
    case 'fast_food':
    case 'food_court': return 'pikaruoka'
    case 'restaurant': return 'ravintola'
    default: return 'muu'
  }
}

function osmAddress(tags?: Record<string, string>): string {
  if (!tags) return ''
  const street = tags['addr:street'] ?? ''
  const num = tags['addr:housenumber'] ?? ''
  return street ? `${street}${num ? ` ${num}` : ''}` : ''
}

async function _fetchOSM(): Promise<Restaurant[]> {
  const url = `?data=${encodeURIComponent(OSM_QUERY)}`

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror + url, {
        headers: OSM_HEADERS,
        signal: AbortSignal.timeout(35000),
      })
      if (!res.ok) continue

      const data: { elements: OSMElement[] } = await res.json()
      const results: Restaurant[] = []

      for (const el of data.elements ?? []) {
        const name = el.tags?.name || el.tags?.['name:fi'] || ''
        if (!name) continue
        const lat = el.type === 'node' ? el.lat : el.center?.lat
        const lon = el.type === 'node' ? el.lon : el.center?.lon
        if (!lat || !lon) continue

        results.push({
          id: `osm-${el.type[0]}${el.id}`,
          name,
          description: el.tags?.cuisine?.replace(/_/g, ' ') ?? '',
          address: osmAddress(el.tags),
          city: el.tags?.['addr:city'] ?? '',
          lat,
          lon,
          image: null,
          www: el.tags?.website ?? el.tags?.url ?? el.tags?.['contact:website'] ?? null,
          phone: el.tags?.phone ?? el.tags?.['contact:phone'] ?? null,
          type: osmAmenityToType(el.tags?.amenity),
        })
      }

      console.log(`[restaurants] OSM: ${results.length} results from ${mirror}`)
      return results
    } catch (err) {
      console.warn(`[restaurants] OSM mirror ${mirror} failed:`, (err as Error).message)
    }
  }

  console.error('[restaurants] All OSM mirrors failed')
  return []
}

// ── Cached wrapper ────────────────────────────────────────

export const fetchOSMCached = unstable_cache(_fetchOSM, ['restaurants-osm-v4'], {
  revalidate: 86400,
  tags: ['restaurants'],
})

// Palvelukartta intentionally removed:
// its q-search returns city services (nursing homes, schools) not restaurants.
// OSM Overpass is the canonical source for restaurant POIs.
export const fetchPKCached = async () => [] as Restaurant[]

// ── Route handler ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() ?? ''

  const osmList = await fetchOSMCached()

  let restaurants = osmList

  if (q) {
    restaurants = restaurants.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    )
  }

  restaurants.sort((a, b) => {
    const s = (r: Restaurant) =>
      (r.address ? 2 : 0) + (r.www ? 1 : 0) + (r.phone ? 1 : 0)
    return s(b) - s(a)
  })

  return NextResponse.json({ restaurants, total: restaurants.length })
}
