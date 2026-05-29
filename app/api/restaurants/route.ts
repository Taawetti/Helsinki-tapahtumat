import { NextRequest, NextResponse } from 'next/server'
import type { Restaurant } from '@/lib/types'

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

interface PalvelukarttaResponse {
  count: number
  results: PalvelukarttaUnit[]
}

async function fetchByKeyword(q: string): Promise<PalvelukarttaUnit[]> {
  const url = `https://api.hel.fi/servicemap/v2/unit/?format=json&municipality=helsinki&q=${encodeURIComponent(q)}&page_size=200`
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400, tags: ['restaurants'] },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data: PalvelukarttaResponse = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

function detectType(name: string, desc: string): Restaurant['type'] {
  const text = (name + ' ' + desc).toLowerCase()
  if (/kahvila|café|cafe|coffee/.test(text)) return 'kahvila'
  if (/\bbaari\b|\bbar\b|pub/.test(text)) return 'baari'
  if (/ravintola|restaurant|bistro|kitchen|grill|sushi|pizzeria|kebab|lounas/.test(text)) return 'ravintola'
  return 'muu'
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = searchParams.get('q')?.toLowerCase().trim() ?? ''

  const [r1, r2, r3, r4] = await Promise.allSettled([
    fetchByKeyword('ravintola'),
    fetchByKeyword('kahvila'),
    fetchByKeyword('baari'),
    fetchByKeyword('bistro'),
  ])

  const all = [
    ...(r1.status === 'fulfilled' ? r1.value : []),
    ...(r2.status === 'fulfilled' ? r2.value : []),
    ...(r3.status === 'fulfilled' ? r3.value : []),
    ...(r4.status === 'fulfilled' ? r4.value : []),
  ]

  const seen = new Set<number>()
  const unique = all.filter(u => {
    if (!u.name?.fi && !u.name?.en) return false
    if (seen.has(u.id)) return false
    seen.add(u.id)
    return true
  })

  let restaurants: Restaurant[] = unique.map(u => {
    const name = u.name?.fi || u.name?.en || u.name?.sv || ''
    const desc = u.short_description?.fi || u.short_description?.en || ''
    return {
      id: `restaurant-${u.id}`,
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
      type: detectType(name, desc),
    }
  })

  if (q) {
    restaurants = restaurants.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    )
  }

  return NextResponse.json({ restaurants })
}
