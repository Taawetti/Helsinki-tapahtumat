import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { fetchLinkedEventsAll, LE_MAX_PAGE_SIZE } from '@/lib/linked-events'

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
  const title = raw.name?.fi || raw.name?.en || raw.name?.sv || 'Nimetön tapahtuma'
  const shortDescription = raw.short_description?.fi || raw.short_description?.en || ''
  const description = raw.description?.fi || raw.description?.en || ''
  const image = raw.images?.[0]?.url ?? null

  const loc = raw.location
  const locationObj = loc
    ? {
        name: loc.name?.fi || loc.name?.en || '',
        streetAddress: loc.street_address?.fi || loc.street_address?.en || '',
        city: loc.address_locality?.fi || loc.address_locality?.en || 'Helsinki',
        lat: loc.position?.coordinates?.[1],
        lon: loc.position?.coordinates?.[0],
      }
    : null

  const offer = raw.offers?.[0]
  const isFree = offer?.is_free ?? true // library events are typically free
  const price = isFree ? null : (offer?.price?.fi || offer?.price?.en || null)
  const ticketUrl = offer?.info_url?.fi || offer?.info_url?.en || null
  const infoUrl = raw.info_url?.fi || raw.info_url?.en || null

  const categories = (raw.keywords || [])
    .map((k) => k.name?.fi || k.name?.en || '')
    .filter(Boolean)
    .slice(0, 4)

  return {
    id: raw.id,
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
    categories: categories.length > 0 ? categories : ['Kirjasto', 'Kulttuuri'],
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const startAfter = searchParams.get('startAfter') || ''
  const keyword = searchParams.get('keyword') || ''

  // Query Helsinki Linked Events filtered to Helmet (Kirjastopalvelukokonaisuus)
  // publisher=ahjo:u48040050 — no language filter to catch events in all languages
  // SIVUTETTU JA LASKEVA. Aiemmin tämä haki 50 riviä nousevassa
  // järjestyksessä — yhdistelmä palautti tuotannossa TÄSMÄLLEEN NOLLA
  // tapahtumaa, joka päivä, huomaamatta.
  //
  // Syy: kirjastojen syötteessä on satoja pitkäkestoisia rivejä (näyttelyt,
  // lukupiirit, "koko vuoden" merkinnät), joiden start_time on menneisyydessä.
  // `start=`-rajaus osuu niihin, nouseva lajittelu nostaa ne kärkeen, ja 50
  // rivin sivu 1 täyttyi kokonaan niistä: mitattu sivun 1 viimeinen rivi oli
  // 20.8. kun alaraja oli 21.8. → alla oleva suodatin pudotti KAIKKI 50.
  // Mitattu: 0/108 tapahtumaa (7 pv) ja 0/624 (30 pv).
  //
  // Laskeva järjestys nostaa kärkeen ikkunassa oikeasti alkavat, ja sivutus
  // hakee loput. HUOM: laskeva on tässä myös pakollinen, ei vain optimointi —
  // ilman ylärajaa suodattimessa (`>= start - 24 h`) nouseva järjestys pitäisi
  // jatkosivujen roskarivit mukana laskennassa mutta hylkäisi ne lopussa.
  const buildUrl = (page: number) => {
    const params = new URLSearchParams({
      format: 'json',
      publisher: 'ahjo:u48040050',
      start: startAfter || start,
      end,
      page: String(page),
      page_size: String(LE_MAX_PAGE_SIZE),
      include: 'location,keywords',
      sort: '-start_time',
    })
    if (keyword) params.set('text', keyword)
    return `https://api.hel.fi/linkedevents/v1/event/?${params}`
  }

  try {
    const { rows, ok, truncated, total, pagesFailed } = await fetchLinkedEventsAll<LinkedEventsEvent>(
      buildUrl,
      () => ({ next: { revalidate: 300, tags: ['events'] }, signal: AbortSignal.timeout(8000) }),
    )
    if (!ok) return NextResponse.json({ events: [] })
    if (truncated) console.warn(`Helmet: ${total} osumaa ylitti sivutuskaton — tulos vajaa`)
    if (pagesFailed > 0) console.warn(`Helmet: ${pagesFailed} sivua petti — tulos vajaa`)

    const startTs = new Date(start).getTime()
    const events: Event[] = rows
      .map(normalize)
      .filter((e: Event) => new Date(e.startTime).getTime() >= startTs - 24 * 60 * 60 * 1000)

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Helmet events error:', err)
    return NextResponse.json({ events: [] })
  }
}
