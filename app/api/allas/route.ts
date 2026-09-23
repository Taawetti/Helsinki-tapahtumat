import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { helsinkiToday } from '@/lib/helsinki-time'
import { ALLAS_EVENTS_API, mapAspEvent, onAllasLiveKeikka, parseAllasDate, type AspEvent } from '@/lib/allas'

// Kiinteä '+03:00' oli tunnin väärässä loka–maaliskuussa (EET = +02:00).
// helsinkiISO lukee offsetin kohdepäivältä.


export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  // Oletus HELSINKI-päivä: UTC-päivä on yöllä 00–03 eilinen.
  const start = searchParams.get('start') || helsinkiToday()
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword')?.toLowerCase() || ''

  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

  const events: Event[] = []

  try {
    // asp_event-tyyppi (/wp/v2/events) — EI al-events, jossa on vain 2025.
    // Ks. lib/allas.ts.
    const res = await fetch(ALLAS_EVENTS_API, {
      next: { revalidate: 3600, tags: ['events'] },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const raw: AspEvent[] = await res.json()
      const inRange = raw.filter((e) => {
        if (!onAllasLiveKeikka(e)) return false
        const d = parseAllasDate(e.acf?.end_date)
        if (!d) return false
        const ts = new Date(d).getTime()
        return ts >= startTs && ts <= endTs
      })
      const mediaIds = [...new Set(inRange.map((e) => e.featured_media).filter((x): x is number => !!x))]
      const imageMap = new Map<number, string>()
      if (mediaIds.length > 0) {
        try {
          const imgRes = await fetch(
            `https://www.allaspool.fi/wp-json/wp/v2/media?include=${mediaIds.join(',')}&_fields=id,source_url&per_page=100`,
            { next: { revalidate: 86400 }, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' }, signal: AbortSignal.timeout(6000) },
          )
          if (imgRes.ok) for (const img of (await imgRes.json()) as { id: number; source_url: string }[]) imageMap.set(img.id, img.source_url)
        } catch { /* kuvat ovat lisä */ }
      }
      const seen = new Set<string>()
      for (const e of inRange) {
        const ev = mapAspEvent(e, e.featured_media ? (imageMap.get(e.featured_media) ?? null) : null)
        if (!ev) continue
        const key = `${ev.title.toLowerCase()}|${ev.startTime.slice(0, 10)}`
        if (seen.has(key)) continue
        seen.add(key)
        if (keyword && !ev.title.toLowerCase().includes(keyword)) continue
        events.push(ev)
      }
    }
  } catch {
    // WP API alhaalla — palautetaan tyhjä. HUOM: stadissa tuo silloin vain
    // artistin nimen ilman kuvaa/kategoriaa, eikä keikka nouse mihinkään.
  }

  return NextResponse.json({ events })
}
