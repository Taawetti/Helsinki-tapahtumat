import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import type { Restaurant } from '@/lib/types'

// ── Types ────────────────────────────────────────────────

interface OSMElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface PalvelukarttaUnit {
  id: number
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  street_address?: { fi?: string; en?: string }
  municipality?: string
  www?: string
  phone?: string
  picture_url?: string
  location?: { type: string; coordinates: [number, number] }
}

// ── OpenStreetMap Overpass ────────────────────────────────

const OSM_BBOX = '60.09,24.58,60.41,25.26'
const OSM_QUERY = `[out:json][timeout:30][bbox:${OSM_BBOX}];(node["amenity"~"^(restaurant|cafe|bar|pub|fast_food|food_court|biergarten)$"]["name"];way["amenity"~"^(restaurant|cafe|bar|pub|fast_food|food_court|biergarten)$"]["name"];);out center;`

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
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: OSM_QUERY,
      headers: { 'Content-Type': 'text/plain' },
      signal: AbortSignal.timeout(35000),
    })
    if (!res.ok) return []

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
    return results
  } catch (err) {
    console.error('[restaurants] OSM fetch error:', err)
    return []
  }
}

// ── Palvelukartta ─────────────────────────────────────────

async function fetchPK(q: string): Promise<PalvelukarttaUnit[]> {
  try {
    const url = `https://api.hel.fi/servicemap/v2/unit/?format=json&municipality=helsinki,espoo,vantaa&q=${encodeURIComponent(q)}&page_size=200`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch { return [] }
}

const PK_KEYWORDS = [
  'ravintola', 'kahvila', 'baari', 'bistro', 'pub', 'lounas',
  'pizza', 'sushi', 'kebab', 'burger', 'grill', 'ruokala',
]

function pkDetectType(name: string, desc: string): Restaurant['type'] {
  const t = (name + ' ' + desc).toLowerCase()
  if (/kahvila|café|cafe|coffee/.test(t)) return 'kahvila'
  if (/\bbaari\b|\bbar\b|pub|biergarten/.test(t)) return 'baari'
  if (/pikaruoka|fast.?food|hampurilainen/.test(t)) return 'pikaruoka'
  if (/ravintola|restaurant|bistro|grill|lounas|sushi/.test(t)) return 'ravintola'
  return 'muu'
}

async function _fetchAllPK(): Promise<Restaurant[]> {
  const settled = await Promise.allSettled(PK_KEYWORDS.map(fetchPK))
  const units: PalvelukarttaUnit[] = []
  const seen = new Set<number>()

  for (const r of settled) {
    if (r.status !== 'fulfilled') continue
    for (const u of r.value) {
      if (seen.has(u.id)) continue
      seen.add(u.id)
      units.push(u)
    }
  }

  return units
    .filter(u => u.name?.fi || u.name?.en)
    .map(u => {
      const name = u.name?.fi || u.name?.en || u.name?.sv || ''
      const desc = u.short_description?.fi || u.short_description?.en || ''
      return {
        id: `pk-${u.id}`,
        name,
        description: desc,
        address: u.street_address?.fi || u.street_address?.en || '',
        city: u.municipality
          ? u.municipality.charAt(0).toUpperCase() + u.municipality.slice(1)
          : 'Helsinki',
        lat: u.location?.coordinates?.[1],
        lon: u.location?.coordinates?.[0],
        image: u.picture_url ?? null,
        www: u.www ?? null,
        phone: u.phone ?? null,
        type: pkDetectType(name, desc),
      }
    })
}

// ── Cached wrappers (unstable_cache works for POST + non-fetch sources) ───────

export const fetchOSMCached = unstable_cache(_fetchOSM, ['restaurants-osm'], {
  revalidate: 86400,
  tags: ['restaurants'],
})

export const fetchPKCached = unstable_cache(_fetchAllPK, ['restaurants-pk'], {
  revalidate: 86400,
  tags: ['restaurants'],
})

// ── Route handler ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() ?? ''

  const [osmResult, pkResult] = await Promise.allSettled([
    fetchOSMCached(),
    fetchPKCached(),
  ])

  const osmList = osmResult.status === 'fulfilled' ? osmResult.value : []
  const pkList  = pkResult.status  === 'fulfilled' ? pkResult.value  : []

  const osmNameSet = new Set(osmList.map(r => r.name.toLowerCase().trim()))
  const pkExtra = pkList.filter(r => !osmNameSet.has(r.name.toLowerCase().trim()))

  let restaurants: Restaurant[] = [...osmList, ...pkExtra]

  if (q) {
    restaurants = restaurants.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    )
  }

  restaurants.sort((a, b) => {
    const s = (r: Restaurant) =>
      (r.address ? 2 : 0) + (r.www ? 1 : 0) + (r.phone ? 1 : 0) + (r.image ? 1 : 0)
    return s(b) - s(a)
  })

  return NextResponse.json({ restaurants, total: restaurants.length })
}
