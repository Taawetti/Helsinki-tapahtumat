import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// Nauramaan.com lists all Helsinki stand-up events in JSON-LD (schema.org ItemList)
// embedded in the HTML — no HTML parsing needed, just extract the script tag.
const URL = 'https://www.nauramaan.com/stand-up/helsinki'

interface ComedyEvent {
  '@type': string
  name: string
  url: string
  startDate: string
  endDate?: string
  location?: {
    name?: string
    address?: { addressLocality?: string; streetAddress?: string }
    geo?: { latitude?: number; longitude?: number }
  }
  image?: string[]
  offers?: { price?: string | number; url?: string }[]
  description?: string
}

interface ItemListElement {
  '@type': string
  item: ComedyEvent
}

interface JsonLd {
  '@type': string
  itemListElement?: ItemListElement[]
}

async function scrape(): Promise<ComedyEvent[]> {
  const res = await fetch(URL, {
    next: { revalidate: 3600, tags: ['events'] },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fi-FI,fi;q=0.9',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()

  // Extract all application/ld+json blocks
  const ldJsonRe = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  const events: ComedyEvent[] = []

  while ((m = ldJsonRe.exec(html)) !== null) {
    try {
      const data: JsonLd = JSON.parse(m[1])
      if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
        for (const el of data.itemListElement) {
          if (el.item?.['@type'] === 'ComedyEvent' && el.item.startDate) {
            events.push(el.item)
          }
        }
      }
    } catch {}
  }

  return events
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start

  const raw = await scrape().catch(() => [])
  if (raw.length === 0) console.warn('[nauramaan] scraper returned 0 events')

  const events: Event[] = []
  const seen = new Set<string>()

  for (const e of raw) {
    const date = e.startDate.slice(0, 10)
    if (date < start || date > end) continue

    const key = `${date}|${e.name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    const loc = e.location
    const image = Array.isArray(e.image) ? (e.image[0] ?? null) : (e.image ?? null)
    const offerUrl = e.offers?.[0]?.url ?? e.url
    const priceRaw = e.offers?.[0]?.price
    const price = priceRaw ? `${priceRaw} €` : null

    events.push({
      id: `nauramaan-${date.replace(/-/g, '')}-${e.name.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.name,
      shortDescription: loc?.name ? `${loc.name} – Helsinki` : 'Helsinki',
      description: e.description || '',
      startTime: e.startDate,
      endTime: e.endDate || null,
      location: {
        name: loc?.name || 'Helsinki',
        streetAddress: loc?.address?.streetAddress || '',
        city: loc?.address?.addressLocality || 'Helsinki',
        lat: loc?.geo?.latitude,
        lon: loc?.geo?.longitude,
      },
      image,
      isFree: priceRaw === 0 || priceRaw === '0',
      price,
      ticketUrl: offerUrl || e.url,
      infoUrl: e.url,
      categories: ['Komedia', 'Stand-up'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events })
}
