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
        city: loc.address_locality?.fi || loc.address_locality?.en || 'Espoo',
        lat: loc.position?.coordinates?.[1],
        lon: loc.position?.coordinates?.[0],
      }
    : null

  const offer = raw.offers?.[0]
  const isFree = offer?.is_free ?? false
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
    categories,
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const startAfter = searchParams.get('startAfter') || ''
  const keyword = searchParams.get('keyword') || ''

  // SIVUTETTU. Tämä reitti oli rakenteellisesti IDENTTINEN helmet-reitin
  // kanssa — nouseva sort=start_time, yksi sivu, ja suodatin ilman ylärajaa
  // (`>= start - 24 h`) — eli sama muoto joka palautti helmetissä mitatusti
  // nolla tapahtumaa: pitkäkestoiset rivit täyttivät sivun 1 ja suodatin
  // pudotti ne kaikki.
  //
  // PALVELIN VAIHDETTU. Tämä reitti osoitti Espoon omaan instanssiin
  // `linkedevents.espoo.fi`, joka on LOPETETTU: domainilla ei ole enää
  // DNS-tietuetta lainkaan (`dig +short` palauttaa tyhjän, kun taas espoo.fi ja
  // api.hel.fi vastaavat normaalisti), eikä `api.espoo.fi` vastaa muuta kuin
  // HTTP 503:a millään polulla. Koska alla oleva virheenkäsittely palauttaa
  // `{ events: [] }` HTTP 200:lla, aggregaatti piti lähdettä ELOSSA ja
  // lähdeterveys näki vain nollan tapahtumaa — hiljainen kuolema, sama kuvio
  // josta RA-lähde jäi aiemmin kiinni vasta kanarian kautta.
  //
  // Espoon tapahtumat saa Helsingin samasta rajapinnasta parametrilla
  // `division=espoo`: mitattu 594 osumaa 30 päivälle, ja 100 rivin otoksesta
  // 100/100 sijaitsi Espoossa (Ison Omenan, Lippulaivan ja Tapiolan kirjastot,
  // EMMA, Laajalahden kirjasto). Muoto on identtinen, joten normalize toimii
  // muuttumattomana.
  //
  // Nyt kun palvelin on api.hel.fi, myös laskeva lajittelu on turvallista
  // (todistetusti tuettu) — aiemmin se jäi tekemättä vain siksi, ettei Espoon
  // omaa instanssia voinut testata. Syy poistui: instanssia ei ole.
  const buildUrl = (page: number) => {
    const params = new URLSearchParams({
      format: 'json',
      division: 'espoo',
      start: startAfter || start,
      end,
      page: String(page),
      page_size: String(LE_MAX_PAGE_SIZE),
      include: 'location,keywords',
      sort: '-start_time',
    })
    if (!keyword) params.set('language', 'fi')
    if (keyword) params.set('text', keyword)
    return `https://api.hel.fi/linkedevents/v1/event/?${params}`
  }

  try {
    const { rows, ok, truncated, total, pagesFailed } = await fetchLinkedEventsAll<LinkedEventsEvent>(
      buildUrl,
      () => ({ next: { revalidate: 300, tags: ['events'] }, signal: AbortSignal.timeout(8000) }),
    )
    if (!ok) return NextResponse.json({ events: [] })
    if (truncated) console.warn(`Espoo: ${total} osumaa ylitti sivutuskaton — tulos vajaa`)
    if (pagesFailed > 0) console.warn(`Espoo: ${pagesFailed} sivua petti — tulos vajaa`)

    const startTs = new Date(start).getTime()
    const events: Event[] = rows
      .map(normalize)
      .filter((e: Event) => new Date(e.startTime).getTime() >= startTs - 24 * 60 * 60 * 1000)

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Espoo Linked Events error:', err)
    return NextResponse.json({ events: [] })
  }
}
