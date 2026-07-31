import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { helsinkiOffset } from '@/lib/helsinki-time'

// Fienta public events API — avoin, ei API-avainta, dokumentoitu OpenAPI:lla.
// Baltia-painotteinen, mutta ~160 Helsinki-tapahtumaa (indie/kulttuuri/teatteri).
// Kohinaa: lahjakortit yms. pitkät "tapahtumat" → suodatetaan yli 60 vrk spännit.

const BASE = 'https://fienta.com/api/v1/public/events'
const MAX_SPAN_DAYS = 60

interface FientaEvent {
  id: number
  title?: string
  starts_at?: string          // "2026-07-31 12:33:27" (paikallisaika)
  ends_at?: string
  venue?: string
  address?: string            // "Välimerenkatu 14, 00220 Helsinki"
  description?: string
  url?: string
  buy_tickets_url?: string
  image_url?: string
  categories?: string[]       // englanninkielisiä slugeja: "theatre", "music"...
  price_from_string?: string | null
  organizer_name?: string
}

// Yleisimmät Fienta-kategoriaslugit suomeksi (luokittelu hoidetaan muuallakin,
// mutta nämä näkyvät suoraan kategorioissa).
const CAT_FI: Record<string, string> = {
  theatre: 'Teatteri', music: 'Musiikki', concert: 'Konsertti', festival: 'Festivaali',
  comedy: 'Stand up', exhibition: 'Näyttely', dance: 'Tanssi', seminar: 'Luento',
  workshop: 'Työpaja', sports: 'Urheilu', club: 'Yöelämä', food: 'Ruoka',
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim()
}

// "2026-07-31 12:33:27" → ISO oikealla Helsinki-offsetilla (kesä/talviaika huomioiden)
function localToIso(s: string): string | null {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const probe = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi))
  return `${y}-${mo}-${d}T${h}:${mi}:00${helsinkiOffset(probe)}`
}

function normalize(raw: FientaEvent): Event | null {
  if (!raw.title || !raw.starts_at) return null
  const startTime = localToIso(raw.starts_at)
  if (!startTime) return null

  // Yli 60 vrk pitkät merkinnät ovat lahjakortteja/kausikortteja, ei tapahtumia
  if (raw.ends_at) {
    const spanMs = new Date(localToIso(raw.ends_at) ?? '').getTime() - new Date(startTime).getTime()
    if (spanMs > MAX_SPAN_DAYS * 24 * 60 * 60 * 1000) return null
  }

  const addrParts = (raw.address ?? '').split(',')
  const street = addrParts[0]?.trim() ?? ''
  return {
    id: `fienta-${raw.id}`,
    title: raw.title,
    shortDescription: raw.description ? stripHtml(raw.description).slice(0, 200) : '',
    description: '',
    startTime,
    endTime: raw.ends_at ? localToIso(raw.ends_at) : null,
    location: raw.venue || raw.address ? {
      name: raw.venue ?? '',
      streetAddress: street,
      city: 'Helsinki',
    } : null,
    image: raw.image_url ?? null,
    isFree: false, // Fienta ei kerro varmasti — price_from_string puuttuu usein
    price: raw.price_from_string ?? null,
    ticketUrl: raw.buy_tickets_url ?? raw.url ?? null,
    infoUrl: raw.url ?? null,
    categories: (raw.categories ?? []).map(c => CAT_FI[c] ?? c).slice(0, 4),
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  try {
    const startTs = new Date(start).getTime()
    const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

    // Max 2 sivua riittää (~200 tapahtumaa, joista osa kohinaa)
    let raw: FientaEvent[] = []
    for (let page = 1; page <= 2; page++) {
      const res = await fetch(`${BASE}?country=FI&city=Helsinki&per_page=100&page=${page}`, {
        next: { revalidate: 3600, tags: ['events'] },
        signal: AbortSignal.timeout(9000),
      })
      if (!res.ok) break
      const data = await res.json()
      const batch: FientaEvent[] = Array.isArray(data?.events) ? data.events : []
      raw = raw.concat(batch)
      if (batch.length < 100) break
    }

    const events = raw
      .map(normalize)
      .filter((e): e is Event => {
        if (!e) return false
        const ts = new Date(e.startTime).getTime()
        return ts >= startTs && ts <= endTs
      })

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Fienta error:', err)
    return NextResponse.json({ events: [] })
  }
}
