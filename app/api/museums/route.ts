import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const LOCATION_IDS = [
  // Art museums
  'tprek:8675',   // HAM Helsinki Art Museum
  'tprek:20861',  // Kiasma
  'tprek:20444',  // Ateneum
  // Cultural centers
  'tprek:7255',   // Kanneltalo
  'tprek:7259',   // Stoa
  'tprek:7256',   // Caisa
  'tprek:8740',   // Malmitalo
  'tprek:7254',   // Annantalo (lasten kulttuurikeskus)
  // Major cultural venues
  'tprek:9355',   // Kaapelitehdas
  'tprek:20633',  // Musiikkitalo
  'tprek:20784',  // Kansallisooppera ja -baletti
  'tprek:20879',  // Suomen Kansallisteatteri
  'tprek:9294',   // Finlandia-talo
  // Suomenlinna
  'tprek:20909',  // Suomenlinnan merilinnoitus
  'tprek:21190',  // Suomenlinna-museo
  // Other museums & venues
  'tprek:21319',  // Arkkitehtuuri- ja designmuseo
  'tprek:20996',  // Helsingin Taidehalli
  'tprek:24182',  // Cirko - Uuden sirkuksen keskus
  'tprek:21030',  // Semifinal
  'tprek:20888',  // Olympiastadion
  // Theatres & dance
  'tprek:9302',   // Helsingin Kaupunginteatteri (HKT)
  'tprek:46367',  // Arena-näyttämö (HKT toinen näyttämö)
  'tprek:67887',  // Tanssin talo – Dance House Helsinki
  'tprek:20668',  // Aleksanterin teatteri
  'tprek:7258',   // Savoy-teatteri
  // Community & culture centers
  'tprek:7260',   // Vuotalo
  'tprek:9340',   // Studio Pasila
  // More museums & art spaces
  'tprek:55959',  // Amos Rex
  'tprek:20615',  // Bio Rex Lasipalatsi
  'tprek:20929',  // Lasipalatsin aukio (ulkotapahtumat)
  'tprek:58438',  // Lasipalatsi-kompleksi
  // Additional theatres & clubs with Linked Events data
  'tprek:20956',  // KOM-teatteri
  'tprek:20815',  // Kulttuuritehdas Korjaamo
  'tprek:20566',  // Tavastia-klubi
  'tprek:9353',   // Lilla Teatern
  // Libraries & public cultural spaces
  'tprek:51342',  // Keskustakirjasto Oodi
  // Historic venues & museums
  'tprek:8645',   // Hakasalmen huvila
  'tprek:8663',   // Helsingin kaupunginmuseo
  'tprek:20465',  // Sinebrychoffin taidemuseo
  // Arena & sports
  'tprek:20999',  // Bolt Arena
].join(',')

const PLACES: Record<string, string> = {
  'tprek:8675':  'HAM Helsinki Art Museum',
  'tprek:20861': 'Kiasma',
  'tprek:20444': 'Ateneum',
  'tprek:7255':  'Kanneltalo',
  'tprek:7259':  'Stoa',
  'tprek:7256':  'Caisa',
  'tprek:8740':  'Malmitalo',
  'tprek:7254':  'Annantalo',
  'tprek:9355':  'Kaapelitehdas',
  'tprek:20633': 'Musiikkitalo',
  'tprek:20784': 'Suomen kansallisooppera ja -baletti',
  'tprek:20879': 'Suomen Kansallisteatteri',
  'tprek:9294':  'Finlandia-talo',
  'tprek:20909': 'Suomenlinnan merilinnoitus',
  'tprek:21190': 'Suomenlinna-museo',
  'tprek:21319': 'Arkkitehtuuri- ja designmuseo',
  'tprek:20996': 'Helsingin Taidehalli',
  'tprek:24182': 'Cirko',
  'tprek:21030': 'Semifinal',
  'tprek:20888': 'Olympiastadion',
  'tprek:9302':  'Helsingin Kaupunginteatteri',
  'tprek:46367': 'Helsingin Kaupunginteatteri – Arena-näyttämö',
  'tprek:67887': 'Tanssin talo',
  'tprek:20668': 'Aleksanterin teatteri',
  'tprek:7258':  'Savoy-teatteri',
  'tprek:7260':  'Vuotalo',
  'tprek:9340':  'Studio Pasila',
  'tprek:55959': 'Amos Rex',
  'tprek:20615': 'Bio Rex Lasipalatsi',
  'tprek:20929': 'Lasipalatsin aukio',
  'tprek:58438': 'Lasipalatsi',
  'tprek:20956': 'KOM-teatteri',
  'tprek:20815': 'Kulttuuritehdas Korjaamo',
  'tprek:20566': 'Tavastia-klubi',
  'tprek:9353':  'Lilla Teatern',
  'tprek:51342': 'Keskustakirjasto Oodi',
  'tprek:8645':  'Hakasalmen huvila',
  'tprek:8663':  'Helsingin kaupunginmuseo',
  'tprek:20465': 'Sinebrychoffin taidemuseo',
  'tprek:20999': 'Bolt Arena',
}

const ART_MUSEUMS = new Set(['tprek:8675', 'tprek:20861', 'tprek:20444'])

function venueFromId(atId?: string): string {
  if (!atId) return ''
  for (const [key, name] of Object.entries(PLACES)) {
    if (atId.includes(key)) return name
  }
  return ''
}

function placeKeyFromId(atId?: string): string {
  if (!atId) return ''
  for (const key of Object.keys(PLACES)) {
    if (atId.includes(key)) return key
  }
  return ''
}

interface LinkedEventsImage {
  url: string
}

interface LinkedEventsOffer {
  is_free: boolean
  price?: { fi?: string; en?: string }
  info_url?: { fi?: string; en?: string }
}

interface LinkedEventsLocation {
  name?: { fi?: string; en?: string }
  street_address?: { fi?: string; en?: string }
  address_locality?: { fi?: string; en?: string }
  position?: { coordinates: [number, number] }
  '@id'?: string
}

interface LinkedEventsEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  description?: { fi?: string; en?: string }
  start_time: string
  end_time?: string
  images?: LinkedEventsImage[]
  location?: LinkedEventsLocation
  offers?: LinkedEventsOffer[]
  keywords?: { name: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

function normalize(raw: LinkedEventsEvent): Event {
  const atId = raw.location?.['@id']
  const venueName = venueFromId(atId)
  const placeKey = placeKeyFromId(atId)

  const title = raw.name?.fi || raw.name?.en || raw.name?.sv || 'Tapahtuma'

  const shortDescription =
    raw.short_description?.fi ||
    raw.short_description?.en ||
    venueName

  const rawDesc = raw.description?.fi || raw.description?.en || ''
  const description = rawDesc.slice(0, 200)

  const loc = raw.location
  const locationObj = loc
    ? {
        name: loc.name?.fi || loc.name?.en || venueName,
        streetAddress: loc.street_address?.fi || loc.street_address?.en || '',
        city: loc.address_locality?.fi || loc.address_locality?.en || 'Helsinki',
        lat: loc.position?.coordinates?.[1],
        lon: loc.position?.coordinates?.[0],
      }
    : null

  const offer = raw.offers?.[0]
  const isFree = offer?.is_free ?? false
  const price = isFree ? null : (offer?.price?.fi || offer?.price?.en || null)
  const ticketUrl = offer?.info_url?.fi || offer?.info_url?.en || null
  const infoUrl = raw.info_url?.fi || raw.info_url?.en || null

  const image = raw.images?.[0]?.url || null

  const keywordCategories = (raw.keywords || [])
    .map((k) => k.name?.fi || k.name?.en || '')
    .filter(Boolean)
    .slice(0, 4)

  let categories: string[]
  if (keywordCategories.length > 0) {
    categories = keywordCategories
  } else if (ART_MUSEUMS.has(placeKey)) {
    categories = ['Taide', 'Kulttuuri', 'Näyttely']
  } else {
    categories = ['Kulttuuri', 'Tapahtumat']
  }

  return {
    id: `museum-${raw.id}`,
    title,
    shortDescription,
    description,
    startTime: raw.start_time,
    endTime: raw.end_time || null,
    location: locationObj,
    image,
    isFree,
    price,
    ticketUrl,
    infoUrl,
    categories,
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  const params = new URLSearchParams({
    location: LOCATION_IDS,
    start,
    end,
    format: 'json',
    page_size: '500',
    include: 'location,keywords',
    sort: 'start_time',
  })

  try {
    const res = await fetch(
      `https://api.hel.fi/linkedevents/v1/event/?${params}`,
      {
        next: { revalidate: 3600, tags: ['events'] },
        signal: AbortSignal.timeout(8000),
      }
    )

    if (!res.ok) {
      console.error('Museums API error:', res.status, res.statusText)
      return NextResponse.json({ events: [] })
    }

    const data = await res.json()

    const startTs = new Date(start).getTime()
    const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

    const events: Event[] = (data.data || [])
      .map(normalize)
      .filter((e: Event) => {
        const ts = new Date(e.startTime).getTime()
        return ts >= startTs && ts <= endTs
      })

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Museums route error:', err)
    return NextResponse.json({ events: [] })
  }
}
