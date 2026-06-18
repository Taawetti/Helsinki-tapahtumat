import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

interface AlEvent {
  id: number
  title: { rendered: string }
  link: string
  featured_media: number
  acf: {
    title?: string
    date?: string
    purchase_link?: { url?: string; title?: string }
  }
}

function parseDate(yyyymmdd: string): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null
  const y = yyyymmdd.slice(0, 4)
  const m = yyyymmdd.slice(4, 6)
  const d = yyyymmdd.slice(6, 8)
  return `${y}-${m}-${d}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword')?.toLowerCase() || ''

  try {
    // Fetch all al-events (max 100 — Allas has ~30–50 events total)
    const res = await fetch(
      'https://www.allaspool.fi/wp-json/wp/v2/al-events?per_page=100&_fields=id,title,link,acf,featured_media',
      {
        next: { revalidate: 3600, tags: ['events'] },
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return NextResponse.json({ events: [] })

    const raw: AlEvent[] = await res.json()

    // Deduplicate — Finnish and English versions appear as separate posts
    const seen = new Set<string>()
    const unique: AlEvent[] = []
    for (const e of raw) {
      const title = (e.acf?.title || e.title.rendered).trim()
      const date = e.acf?.date || ''
      const key = `${title.toLowerCase()}|${date}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(e)
      }
    }

    // Filter by date range
    const startTs = new Date(start).getTime()
    const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

    const inRange = unique.filter((e) => {
      const d = parseDate(e.acf?.date || '')
      if (!d) return false
      const ts = new Date(d).getTime()
      return ts >= startTs && ts <= endTs
    })

    if (inRange.length === 0) return NextResponse.json({ events: [] })

    // Batch-fetch images for all events that have featured_media
    const mediaIds = [...new Set(inRange.map((e) => e.featured_media).filter(Boolean))]
    const imageMap = new Map<number, string>()

    if (mediaIds.length > 0) {
      try {
        const imgRes = await fetch(
          `https://www.allaspool.fi/wp-json/wp/v2/media?include=${mediaIds.join(',')}&_fields=id,source_url&per_page=100`,
          {
            next: { revalidate: 86400 },
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
            signal: AbortSignal.timeout(6000),
          }
        )
        if (imgRes.ok) {
          const imgs: { id: number; source_url: string }[] = await imgRes.json()
          for (const img of imgs) imageMap.set(img.id, img.source_url)
        }
      } catch {
        // images optional — proceed without
      }
    }

    const events: Event[] = inRange
      .map((e): Event | null => {
        const title = (e.acf?.title || e.title.rendered).trim()
        const date = parseDate(e.acf?.date || '')
        if (!title || !date) return null

        const ticketUrl = e.acf?.purchase_link?.url || e.link
        const image = e.featured_media ? (imageMap.get(e.featured_media) ?? null) : null

        if (keyword && !title.toLowerCase().includes(keyword)) return null

        return {
          id: `allas-${e.id}`,
          title,
          shortDescription: 'Allas Sea Pool — Helsinki',
          description: '',
          startTime: `${date}T19:00:00+03:00`,
          endTime: null,
          location: {
            name: 'Allas Sea Pool',
            streetAddress: 'Katajanokanlaituri 2a',
            city: 'Helsinki',
            lat: 60.1674,
            lon: 24.9565,
          },
          image,
          isFree: false,
          price: null,
          ticketUrl,
          infoUrl: e.link,
          categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
          source: 'linked-events',
        }
      })
      .filter((e): e is Event => e !== null)

    return NextResponse.json({ events })
  } catch {
    return NextResponse.json({ events: [] })
  }
}
