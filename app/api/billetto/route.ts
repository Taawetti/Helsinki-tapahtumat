import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// Billetto Public Event Search API (publisher-ohjelma, ilmainen avainpari).
// Auth: Api-Keypair-header muodossa "<public>:<secret>". FI-endpoint kattaa Suomen.
// Huom: API palauttaa toisinaan 401 "Invalid credentials" kuormapiikeissä →
// yksi retry, muuten graceful empty (aggregaattori jatkaa ilman tätä lähdettä).

const BASE = 'https://billetto.fi/api/v3/public/events'
const CITIES = new Set(['helsinki', 'espoo', 'vantaa', 'kauniainen'])

interface BillettoEvent {
  id: string
  title?: string
  description?: string
  url?: string
  branded_url?: string
  image_link?: string
  minimum_price?: { amount_in_cents?: number; currency?: string }
  categorization?: {
    category_localized?: string
    subcategory_localized?: string
    type_localized?: string
  }
  location?: {
    location_name?: string
    address_line?: string
    city?: string
    country_code?: string
  }
  startdate?: string
  enddate?: string
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalize(raw: BillettoEvent): Event | null {
  if (!raw.title || !raw.startdate) return null
  const loc = raw.location
  const cents = raw.minimum_price?.amount_in_cents
  const isFree = cents === 0
  return {
    id: `billetto-${raw.id}`,
    title: raw.title,
    shortDescription: raw.description ? stripHtml(raw.description).slice(0, 200) : '',
    description: '',
    startTime: raw.startdate,
    endTime: raw.enddate ?? null,
    location: loc ? {
      name: loc.location_name ?? '',
      streetAddress: loc.address_line ?? '',
      city: loc.city ?? 'Helsinki',
    } : null,
    image: raw.image_link ?? null,
    isFree,
    price: !isFree && cents ? `${Math.round(cents / 100)} €` : null,
    ticketUrl: raw.url ?? null,
    infoUrl: raw.branded_url ?? raw.url ?? null,
    categories: [
      raw.categorization?.type_localized,
      raw.categorization?.category_localized,
      raw.categorization?.subcategory_localized,
    ].filter((c): c is string => Boolean(c)).slice(0, 4),
    source: 'linked-events',
  }
}

async function fetchPage(url: string, auth: string): Promise<{ events: BillettoEvent[]; next: string | null }> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'Api-Keypair': auth },
    next: { revalidate: 3600, tags: ['events'] },
    signal: AbortSignal.timeout(9000),
  })
  if (!res.ok) throw new Error(`Billetto HTTP ${res.status}`)
  const data = await res.json()
  if (data?.error) throw new Error(`Billetto: ${data.error.message ?? data.error}`)
  return {
    events: Array.isArray(data?.data) ? data.data : [],
    next: data?.has_more && data?.next_url ? data.next_url : null,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  const key = process.env.BILLETTO_API_KEY
  const secret = process.env.BILLETTO_API_SECRET
  if (!key || !secret) return NextResponse.json({ events: [] })

  try {
    const startTs = new Date(start).getTime()
    const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000
    const auth = `${key}:${secret}`

    // Paging: max 2 sivua (100/sivu) riittää FI-inventaarioon. Yksi retry,
    // koska API palauttaa satunnaisesti 401 kuormapiikeissä.
    let raw: BillettoEvent[] = []
    let url: string | null = `${BASE}?limit=100`
    for (let page = 0; page < 2 && url; page++) {
      try {
        const r = await fetchPage(url, auth)
        raw = raw.concat(r.events)
        url = r.next
      } catch {
        if (page === 0) {
          await new Promise(r => setTimeout(r, 1200))
          const r = await fetchPage(`${BASE}?limit=100`, auth)
          raw = raw.concat(r.events)
        }
        break
      }
    }

    const events = raw
      .map(normalize)
      .filter((e): e is Event => {
        if (!e) return false
        const city = (e.location?.city ?? '').toLowerCase()
        if (!CITIES.has(city)) return false
        const ts = new Date(e.startTime).getTime()
        return ts >= startTs && ts <= endTs
      })

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Billetto error:', err)
    return NextResponse.json({ events: [] })
  }
}
