import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// ── Bars using WordPress "The Events Calendar" plugin (same API as Bar Loose) ─

interface TribeEvent {
  id: number
  title: string
  start_date: string   // "YYYY-MM-DD HH:MM:SS"
  url: string
  image?: { url?: string }
  cost?: string
  description?: string
  venue?: { address?: string; city?: string }
}

interface BarDef {
  base: string
  name: string
  address: string
  city: string
  lat?: number
  lon?: number
  defaultCats: string[]
}

const TRIBE_BARS: BarDef[] = [
  {
    base: 'https://williamk.fi',
    name: 'William K',
    address: 'Kaisaniemenkatu 5',
    city: 'Helsinki',
    lat: 60.1706, lon: 24.9476,
    defaultCats: ['Baari', 'Yöelämä'],
  },
  {
    base: 'https://storyville.fi',
    name: 'Storyville',
    address: 'Museokatu 8',
    city: 'Helsinki',
    lat: 60.1737, lon: 24.9230,
    defaultCats: ['Jazz', 'Musiikki', 'Baari'],
  },
  {
    base: 'https://dtmhelsinki.fi',
    name: 'DTM Helsinki',
    address: 'Iso Roobertinkatu 28',
    city: 'Helsinki',
    lat: 60.1638, lon: 24.9412,
    defaultCats: ['Yöelämä', 'Baari'],
  },
  {
    base: 'https://tiivistamo.fi',
    name: 'Tiivistämö',
    address: 'Sörnäisten rantatie 22',
    city: 'Helsinki',
    lat: 60.1862, lon: 24.9731,
    defaultCats: ['Musiikki', 'Klubi', 'Yöelämä'],
  },
  {
    base: 'https://kaivohuone.fi',
    name: 'Kaivohuone',
    address: 'Iso Puistotie 1',
    city: 'Helsinki',
    lat: 60.1558, lon: 24.9445,
    defaultCats: ['Yöelämä', 'Klubi'],
  },
  {
    base: 'https://mollymalones.fi',
    name: 'Molly Malones',
    address: 'Kaisaniemenkatu 1C',
    city: 'Helsinki',
    lat: 60.1706, lon: 24.9465,
    defaultCats: ['Baari', 'Yöelämä'],
  },
  {
    base: 'https://www.libertyor.death',
    name: 'Liberty or Death',
    address: 'Annankatu 18',
    city: 'Helsinki',
    lat: 60.1648, lon: 24.9381,
    defaultCats: ['Baari', 'Cocktail', 'Yöelämä'],
  },
  {
    base: 'https://kerma.fi',
    name: 'Kermä',
    address: 'Fredrikinkatu 67',
    city: 'Helsinki',
    lat: 60.1637, lon: 24.9301,
    defaultCats: ['Baari', 'Musiikki', 'Yöelämä'],
  },
  // Pienet trubaduuri- ja akustinen-musiikki -baarit
  {
    base: 'https://glivelab.fi',
    name: 'G Livelab Helsinki',
    address: 'Yrjönkatu 3',
    city: 'Helsinki',
    lat: 60.1663, lon: 24.9342,
    defaultCats: ['Keikka', 'Live', 'Musiikki'],
  },
  {
    base: 'https://lepakkomies.fi',
    name: 'Lepakkomies',
    address: 'Helsinginkatu 18',
    city: 'Helsinki',
    lat: 60.1794, lon: 24.9476,
    defaultCats: ['Keikka', 'Baari', 'Indie'],
  },
  {
    base: 'https://kaiku.fi',
    name: 'Kaiku',
    address: 'Sörnäisten rantatie 23',
    city: 'Helsinki',
    lat: 60.1857, lon: 24.9713,
    defaultCats: ['Klubi', 'DJ', 'Yöelämä'],
  },
  {
    base: 'https://www.keltainenverstas.fi',
    name: 'Keltainen Verstas',
    address: 'Dagmarinkatu 2',
    city: 'Helsinki',
    lat: 60.1738, lon: 24.9264,
    defaultCats: ['Keikka', 'Akustinen', 'Baari'],
  },
  {
    base: 'https://barflowa.fi',
    name: 'Bar Flöwa',
    address: 'Helsinginkatu 23',
    city: 'Helsinki',
    lat: 60.1790, lon: 24.9481,
    defaultCats: ['Baari', 'Live', 'Musiikki'],
  },
  {
    base: 'https://baarikarpanen.fi',
    name: 'Baarikärpänen',
    address: '',
    city: 'Helsinki',
    defaultCats: ['Baari', 'Yöelämä'],
  },
  {
    base: 'https://barloose.fi',
    name: 'Bar Loose',
    address: 'Fredrikinkatu 34',
    city: 'Helsinki',
    lat: 60.1635, lon: 24.9358,
    defaultCats: ['Musiikki', 'Rock', 'Baari'],
  },
]

function detectCategories(title: string, desc: string): string[] {
  const text = (title + ' ' + desc).toLowerCase()
  const cats = new Set<string>()

  if (/pubivisa|pub\s*quiz|tietovisa|quiz\s*night|trivia/i.test(text)) {
    cats.add('Pubivisa'); cats.add('Baari')
  }
  if (/karaoke/i.test(text)) {
    cats.add('Karaoke'); cats.add('Baari')
  }
  if (/drag|dragshow|drag\s*show|lip\s*sync/i.test(text)) {
    cats.add('Drag show'); cats.add('Yöelämä')
  }
  if (/jazz|soul|r&b|blues|swing/i.test(text)) {
    cats.add('Jazz'); cats.add('Musiikki')
  }
  if (/\bdj\b|klubi|club\s*night|disko|rave|techno|house/i.test(text)) {
    cats.add('DJ'); cats.add('Klubi'); cats.add('Yöelämä')
  }
  if (/stand[- ]?up|komedia|comedy/i.test(text)) {
    cats.add('Stand up')
  }
  if (/teema|theme\s*night|costume|halloween|neon|disco\s*fever|80s|90s|70s/i.test(text)) {
    cats.add('Teemailta'); cats.add('Yöelämä')
  }
  if (/live|keikka|bändi|konsertti|band/i.test(text)) {
    cats.add('Keikka'); cats.add('Musiikki')
  }
  if (/burleski|burlesque/i.test(text)) {
    cats.add('Burleski'); cats.add('Yöelämä')
  }
  if (/bingo/i.test(text)) {
    cats.add('Bingo'); cats.add('Baari')
  }
  if (/speed\s*dating|dating/i.test(text)) {
    cats.add('Treffailta')
  }
  if (/trubaduuri|akustinen|acoustic|unplugged|open\s*mic|open\s*stage/i.test(text)) {
    cats.add('Trubaduuri'); cats.add('Akustinen'); cats.add('Live')
  }
  if (/singer[\s-]?songwriter|soololaulu|soolo/i.test(text)) {
    cats.add('Trubaduuri'); cats.add('Live')
  }
  if (/jazz\s*session|jam\s*session|session/i.test(text)) {
    cats.add('Jazz'); cats.add('Live'); cats.add('Jam')
  }
  if (/afterwork|after\s*work/i.test(text)) {
    cats.add('Afterwork'); cats.add('Baari')
  }

  return cats.size > 0 ? [...cats] : ['Baari', 'Yöelämä']
}

async function fetchTribeBar(bar: BarDef, start: string): Promise<Event[]> {
  const endpoint = `${bar.base}/wp-json/tribe/events/v1/events?per_page=50&start_date=${start}`
  const res = await fetch(endpoint, {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) return []

  const data = await res.json()
  const tribeEvents: TribeEvent[] = data.events ?? []

  return tribeEvents.map((e): Event => {
    const title = e.title
      .replace(/&amp;/g, '&')
      .replace(/&#8217;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .trim()
    const desc = (e.description ?? '').replace(/<[^>]+>/g, '').slice(0, 200).trim()
    const isFree = !e.cost || e.cost === '0' || /vapaa|free|ilmai/i.test(e.cost)

    return {
      id: `bar-${bar.name.toLowerCase().replace(/\s/g, '-')}-${e.id}`,
      title,
      shortDescription: desc || bar.name,
      description: desc,
      startTime: e.start_date.replace(' ', 'T'),
      endTime: null,
      location: {
        name: bar.name,
        streetAddress: bar.address,
        city: bar.city,
        lat: bar.lat,
        lon: bar.lon,
      },
      image: e.image?.url ?? null,
      isFree,
      price: isFree ? null : (e.cost ?? null),
      ticketUrl: e.url,
      infoUrl: e.url,
      categories: detectCategories(title, desc).length > 0
        ? detectCategories(title, desc)
        : bar.defaultCats,
      source: 'linked-events',
    }
  })
}

// ── Quiz Night Finland ────────────────────────────────────────────────────────
// quiznightfinland.fi lists Helsinki pub quiz events

async function scrapeQuizNightFinland(): Promise<Event[]> {
  const res = await fetch('https://quiznightfinland.fi/tapahtumat/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()

  // Look for JSON-LD EventSeries / Event blocks first
  const ldMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []
  const events: Event[] = []

  for (const block of ldMatches) {
    try {
      const raw = block.replace(/<script[^>]*>|<\/script>/g, '')
      const json = JSON.parse(raw)
      const items = Array.isArray(json) ? json : (json['@graph'] ?? [json])
      for (const item of items) {
        if (item['@type'] !== 'Event' && item['@type'] !== 'SocialEvent') continue
        const title = item.name ?? ''
        const startTime = item.startDate ? new Date(item.startDate).toISOString() : ''
        if (!title || !startTime) continue
        const loc = item.location
        events.push({
          id: `quiznightfi-${Buffer.from(title + startTime).toString('base64').slice(0, 16)}`,
          title,
          shortDescription: 'Quiz Night Finland — pubivisa',
          description: item.description ?? '',
          startTime,
          endTime: item.endDate ? new Date(item.endDate).toISOString() : null,
          location: loc ? {
            name: loc.name ?? '',
            streetAddress: loc.address?.streetAddress ?? '',
            city: loc.address?.addressLocality ?? 'Helsinki',
          } : null,
          image: item.image ?? null,
          isFree: false,
          price: null,
          ticketUrl: item.url ?? null,
          infoUrl: item.url ?? null,
          categories: ['Pubivisa', 'Baari'],
          source: 'linked-events',
        })
      }
    } catch { /* ignore */ }
  }

  // Fallback: scrape article cards if JSON-LD returned nothing
  if (events.length === 0) {
    const cards = html.match(/<article[^>]*class="[^"]*tribe-event[^"]*"[^>]*>([\s\S]*?)<\/article>/g) ?? []
    for (const card of cards) {
      const titleM = card.match(/<h[23][^>]*class="[^"]*tribe-event[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      const dateM = card.match(/datetime="([^"]+)"/)
      if (!titleM || !dateM) continue
      const title = titleM[2].replace(/<[^>]+>/g, '').trim()
      const venueM = card.match(/class="[^"]*tribe-venue[^"]*"[^>]*>([\s\S]*?)<\//)
      const venue = venueM?.[1]?.replace(/<[^>]+>/g, '').trim() ?? ''
      events.push({
        id: `quiznightfi-${Buffer.from(title + dateM[1]).toString('base64').slice(0, 16)}`,
        title,
        shortDescription: `Quiz Night Finland — ${venue || 'pubivisa'}`,
        description: '',
        startTime: new Date(dateM[1]).toISOString(),
        endTime: null,
        location: venue ? { name: venue, streetAddress: '', city: 'Helsinki' } : null,
        image: null,
        isFree: false,
        price: null,
        ticketUrl: titleM[1],
        infoUrl: titleM[1],
        categories: ['Pubivisa', 'Baari'],
        source: 'linked-events',
      })
    }
  }

  return events.filter(e => /helsinki|helsingfors/i.test(
    (e.location?.city ?? '') + (e.location?.streetAddress ?? '') + (e.shortDescription ?? '')
  ) || events.length < 5) // keep all if location unknown
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  const results = await Promise.allSettled([
    ...TRIBE_BARS.map(bar => fetchTribeBar(bar, start)),
    scrapeQuizNightFinland(),
  ])

  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

  const events = results
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(e => {
      const ts = new Date(e.startTime).getTime()
      return ts >= startTs && ts <= endTs
    })

  return NextResponse.json({ events })
}
