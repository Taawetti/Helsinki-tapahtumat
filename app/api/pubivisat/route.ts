import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const SOURCE_URL = 'https://pubivisat.fi/helsinki'

const WEEKDAY_JS: Record<string, number> = {
  maanantai: 1,
  tiistai:   2,
  keskiviikko: 3,
  torstai:   4,
  perjantai: 5,
  lauantai:  6,
  sunnuntai: 0,
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#[0-9]+;/g, '').trim()
}

interface PubVisa {
  name: string
  address: string
  weekday: number
  hour: number
  minute: number
}

function parseTime(raw: string): { hour: number; minute: number } | null {
  const m = raw.trim().match(/^(\d{1,2})[.:](\d{2})$/)
  if (!m) return null
  return { hour: parseInt(m[1]), minute: parseInt(m[2]) }
}

function parseRows(html: string): PubVisa[] {
  const results: PubVisa[] = []

  // Extract all <tr>...</tr> blocks
  const trMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)
  for (const trMatch of trMatches) {
    const tr = trMatch[1]
    // Extract TD cell texts
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => stripTags(m[1]))
    if (cells.length < 4) continue

    // Columns: name, time, address, weekday (+ optional rating col)
    const [nameRaw, timeRaw, addressRaw, weekdayRaw] = cells

    const name = nameRaw.trim()
    if (!name || name.length < 2) continue

    const time = parseTime(timeRaw)
    if (!time) continue

    const address = addressRaw.trim()

    // Only include Helsinki proper (filter out Kerava, Lohja, etc.)
    const isHelsinki =
      /\b0[0-9]{4}\b/.test(address) // Helsinki postal codes 00xxx
        ? /\b0[0-9]{3}[0-9]\b/.test(address) && !/(kerava|espoo|vantaa|lohja|järvenpää|nurmijärvi|kirkkonummi)/i.test(address)
        : !/(kerava|espoo|vantaa|lohja|järvenpää|nurmijärvi|kirkkonummi)/i.test(address)

    if (!isHelsinki) continue

    const weekdayKey = weekdayRaw.toLowerCase().trim()
    const weekday = WEEKDAY_JS[weekdayKey]
    if (weekday === undefined) continue

    results.push({ name, address, weekday, hour: time.hour, minute: time.minute })
  }

  return results
}

function generateOccurrences(visa: PubVisa, startDate: Date, endDate: Date, index: number): Event[] {
  const events: Event[] = []
  const cursor = new Date(startDate)
  cursor.setHours(0, 0, 0, 0)

  // Skip address cleanup — keep as-is, strip postal code for street display
  const streetAddress = visa.address.replace(/,?\s*\d{5}\s*\w+\s*$/, '').trim()

  while (cursor <= endDate) {
    if (cursor.getDay() === visa.weekday) {
      const startDt = new Date(cursor)
      startDt.setHours(visa.hour, visa.minute, 0, 0)
      const endDt = new Date(startDt.getTime() + 2 * 60 * 60 * 1000) // 2h default

      const dateKey = cursor.toISOString().slice(0, 10).replace(/-/g, '')
      events.push({
        id: `pubivisa-${index}-${dateKey}`,
        title: `Tietovisa – ${visa.name}`,
        shortDescription: `Viikoittainen tietovisa ${visa.name}ssa`,
        description: `Viikoittainen tietovisa. Lähde: pubivisat.fi`,
        startTime: startDt.toISOString(),
        endTime: endDt.toISOString(),
        location: {
          name: visa.name,
          streetAddress,
          city: 'Helsinki',
        },
        image: null,
        isFree: true,
        price: null,
        ticketUrl: null,
        infoUrl: SOURCE_URL,
        categories: ['Tietovisa', 'Pubivisa', 'Baari'],
        source: 'linked-events',
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return events
}

let cachedVisas: PubVisa[] | null = null
let cacheTime = 0
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h — schedule changes rarely

async function fetchVisas(): Promise<PubVisa[]> {
  if (cachedVisas && Date.now() - cacheTime < CACHE_TTL) return cachedVisas

  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-tapahtumat/1.0)' },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 86400 },
  })
  if (!res.ok) return cachedVisas ?? []

  const html = await res.text()
  const visas = parseRows(html)
  if (visas.length > 0) {
    cachedVisas = visas
    cacheTime = Date.now()
  }
  return cachedVisas ?? []
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  try {
    const visas = await fetchVisas()
    const startDate = new Date(start)
    const endDate = new Date(end)
    endDate.setHours(23, 59, 59, 999)

    const events: Event[] = visas.flatMap((v, i) =>
      generateOccurrences(v, startDate, endDate, i)
    )
    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    return NextResponse.json({ events, total: events.length, source: 'pubivisat' })
  } catch (err) {
    console.error('pubivisat error:', err)
    return NextResponse.json({ events: [] })
  }
}
