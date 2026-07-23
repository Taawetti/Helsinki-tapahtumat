import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { VIBES, NEIGHBORHOODS, type Vibe, type Neighborhood } from '@/lib/types'
import { classifyEvent, extractYsoIds } from '@/lib/event-classify'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

// Finnish locative forms for neighborhood names
const LOCATIVE: Record<string, string> = {
  kallio:      'Kalliossa',
  punavuori:   'Punavuoressa',
  keskusta:    'Keskustassa',
  kamppi:      'Kampissa',
  'sornäinen': 'Sörnäisissä',
  hakaniemi:   'Hakaniemessä',
  toolo:       'Töölössä',
  vallila:     'Vallilassa',
  kruununhaka: 'Kruununhaassa',
  hermanni:    'Hermannissa',
  tapiola:     'Tapiolassa',
  leppavaara:  'Leppävaarassa',
  tikkurila:   'Tikkurilassa',
}

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  start_time: string
  end_time?: string | null
  images?: { url: string }[]
  location?: {
    name?: { fi?: string; en?: string }
    street_address?: { fi?: string; en?: string }
    address_locality?: { fi?: string; en?: string }
    '@id'?: string
  }
  keywords?: { '@id'?: string; name?: { fi?: string; en?: string } }[]
  offers?: { is_free: boolean; price?: { fi?: string }; info_url?: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

interface PageEvent {
  id: string
  title: string
  shortDescription: string
  startTime: string
  endTime: string | null
  venue: string
  address: string
  categories: string[]
  ysoIds: string[]
  isFree: boolean
  price: string | null
  ticketUrl: string | null
  image: string | null
}

function normalizeLE(raw: LEEvent): PageEvent {
  const title = raw.name?.fi || raw.name?.en || raw.name?.sv || 'Tapahtuma'
  const shortDescription = raw.short_description?.fi || raw.short_description?.en || ''
  const venue = raw.location?.name?.fi || raw.location?.name?.en || ''
  const address = raw.location?.street_address?.fi || raw.location?.street_address?.en || ''
  // slice(0,4) TÄSMÄLLEEN kuten /api/events normalize — muuten sama tapahtuma
  // luokittuisi eri tavoin sovelluksessa ja SEO-sivulla (rikkoisi "yksi totuus")
  const categories = (raw.keywords || []).map((k) => k.name?.fi || k.name?.en || '').filter(Boolean).slice(0, 4)
  const ysoIds = extractYsoIds(raw.keywords)
  const offer = raw.offers?.[0]
  const isFree = offer?.is_free ?? false
  const price = isFree ? null : (offer?.price?.fi || null)
  const ticketUrl = offer?.info_url?.fi || offer?.info_url?.en || raw.info_url?.fi || raw.info_url?.en || null
  const image = raw.images?.[0]?.url || null
  return { id: raw.id, title, shortDescription, startTime: raw.start_time, endTime: raw.end_time || null, venue, address, categories, ysoIds, isFree, price, ticketUrl, image }
}

function dateRange() {
  const now = new Date()
  const start = now.toISOString().split('T')[0]
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  return { start, end }
}

async function fetchByText(keywords: string[]): Promise<PageEvent[]> {
  const { start, end } = dateRange()
  const [primary, secondary] = keywords

  const buildParams = (text: string) =>
    new URLSearchParams({ text, format: 'json', start, end, page_size: '30', include: 'location,keywords', sort: 'start_time', division: 'helsinki' })

  const fetches = [
    fetch(`https://api.hel.fi/linkedevents/v1/event/?${buildParams(primary)}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    }),
    ...(secondary && secondary !== primary
      ? [fetch(`https://api.hel.fi/linkedevents/v1/event/?${buildParams(secondary)}`, {
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(8000),
        })]
      : []),
  ]

  const results = await Promise.allSettled(fetches)
  const events: PageEvent[] = []
  const seen = new Set<string>()

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue
    const data = await r.value.json()
    for (const raw of data.data || []) {
      if (!seen.has(raw.id)) {
        seen.add(raw.id)
        events.push(normalizeLE(raw))
      }
    }
  }

  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  return events.slice(0, 40)
}

async function fetchByBbox(neighborhood: Neighborhood): Promise<PageEvent[]> {
  const { start, end } = dateRange()

  const params = new URLSearchParams({
    bbox: neighborhood.bbox,
    format: 'json',
    start,
    end,
    page_size: '50',
    include: 'location,keywords',
    sort: 'start_time',
  })

  try {
    const res = await fetch(`https://api.hel.fi/linkedevents/v1/event/?${params}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    const events: PageEvent[] = (data.data || []).map(normalizeLE)
    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    return events.slice(0, 40)
  } catch {
    return []
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fi-FI', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const VIBE_DESCRIPTIONS: Record<string, string> = {
  keikka:   'Helsingin parhaat live-keikkat ja konsertit yhdessä paikassa. Tavastia, Circus Helsinki, On the Rocks, G Livelab ja kaikki muut keikkapaikat — ohjelma päivitetään automaattisesti päivittäin.',
  yoelama:  'Helsinki yöelämä — yökerhot, klubit, disko ja afterpartyt. Löydä parhaat bileet tänä iltana ja tulevina viikonloppuina Helsingissä.',
  baari:    'Pubikeikat, pubivisat, karaoke-illat ja baaritapahtumat Helsingissä. Löydä tänään paras baari- tai pub-ilta pääkaupunkiseudulla.',
  urheilu:  'Urheilutapahtumat Helsingissä: jalkapallopelit, jääkiekko-ottelut (HIFK, Jokerit), juoksukilpailut ja muut urheilutapahtumat. Ottelukalenteri aina ajan tasalla.',
  standup:  'Stand up -keikat ja komediaesitykset Helsingissä. Parhaat suomalaiset ja kansainväliset koomikot sekä avoin mikki -illat.',
  museo:    'Museot ja näyttelyt Helsingissä — Ateneum, Kiasma, HAM, Suomen kansallismuseo ja paljon muuta. Löydä ilmaiset ja maksulliset näyttelyt aukioloaikoineen.',
  lapset:   'Tapahtumat lapsille ja perheille Helsingissä: ilmaiset lastentapahtumat, satutunnit, luovuuspajat, lasten teatteriesitykset ja perhekonsertit.',
  tyopaja:  'Kurssit, työpajat ja koulutustapahtumat Helsingissä. Kuvaamataitoa, kokkikursseja, tanssia, käsitöitä — uusia taitoja ja elämyksiä kaikille.',
  teatteri: 'Teatteriesitykset ja tanssiesitykset Helsingissä. Kansallisteatteri, Helsingin kaupunginteatteri, Svenska Teatern, itsenäiset teatterit ja vierailevat ryhmät.',
  taide:    'Taidenäyttelyt ja galleriat Helsingissä. Kuvataidetta, valokuvaa, designia ja nykytaidetta — aukioloajat ja tapahtumat päivitetään automaattisesti.',
}

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return [
    ...VIBES.map((v) => ({ slug: v.id })),
    ...NEIGHBORHOODS.map((n) => ({ slug: n.id })),
  ]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  const vibe = VIBES.find((v) => v.id === slug)
  if (vibe) {
    const desc = `Kaikki ${vibe.label.toLowerCase()} tapahtumat Helsingissä. Löydä parhaat ${vibe.keywords.slice(0, 3).join(', ')} -tapahtumat aikatauluineen.`
    return {
      title: `${vibe.label} Helsinki – tapahtumat | Mitä tänään`,
      description: desc,
      alternates: { canonical: `${BASE}/tapahtumat/${slug}` },
      openGraph: { title: `${vibe.emoji} ${vibe.label} Helsinki`, description: desc, locale: 'fi_FI', type: 'website', url: `${BASE}/tapahtumat/${slug}` },
    }
  }

  const n = NEIGHBORHOODS.find((nb) => nb.id === slug)
  if (n) {
    const locative = LOCATIVE[slug] || `${n.name}ssa`
    const desc = `Kaikki tapahtumat ${locative} – ${n.vibe}. Löydä tulevat tapahtumat, konsertit, näyttelyt ja muut menot ${n.name}sta.`
    return {
      title: `Tapahtumat ${locative} | Mitä tänään`,
      description: desc,
      alternates: { canonical: `${BASE}/tapahtumat/${slug}` },
      openGraph: { title: `${n.emoji} ${n.name} tapahtumat`, description: desc, locale: 'fi_FI', type: 'website', url: `${BASE}/tapahtumat/${slug}` },
    }
  }

  return {}
}

export default async function TapahtumaSivu({ params }: Props) {
  const { slug } = await params

  const vibe: Vibe | undefined = VIBES.find((v) => v.id === slug)
  const neighborhood: Neighborhood | undefined = NEIGHBORHOODS.find((n) => n.id === slug)

  if (!vibe && !neighborhood) notFound()

  const events = vibe
    ? (await fetchByText(vibe.keywords)).filter((e) =>
        // Yksi totuus: sama kerroksellinen luokittelu kuin sovelluksessa
        // (lib/event-classify) — tekstihaku tuo kandidaatit, classifyEvent
        // rajaa ne oikeaan kategoriaan (vetot mukaan lukien)
        classifyEvent({
          title: e.title,
          shortDescription: e.shortDescription,
          categories: e.categories,
          ysoIds: e.ysoIds,
          location: { name: e.venue },
        }).includes(slug)
      )
    : await fetchByBbox(neighborhood!)

  const pageTitle = vibe
    ? `${vibe.emoji} ${vibe.label} Helsingissä`
    : `${neighborhood!.emoji} Tapahtumat ${LOCATIVE[slug] || neighborhood!.name + 'ssa'}`

  const pageSubtitle = vibe
    ? `${events.length} tapahtumaa seuraavan 30 päivän aikana`
    : neighborhood!.vibe

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: pageTitle,
    url: `${BASE}/tapahtumat/${slug}`,
    numberOfItems: events.length,
    itemListElement: events.slice(0, 15).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: e.title,
        startDate: e.startTime,
        ...(e.endTime ? { endDate: e.endTime } : {}),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: e.venue || 'Helsinki',
          address: { '@type': 'PostalAddress', streetAddress: e.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
        },
        ...(e.isFree
          ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }
          : e.ticketUrl
          ? { offers: { '@type': 'Offer', url: e.ticketUrl, priceCurrency: 'EUR' } }
          : {}),
        url: `${BASE}/e/${encodeURIComponent(e.id)}`,
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Tapahtumat', item: `${BASE}/tapahtumat` },
      { '@type': 'ListItem', position: 3, name: vibe ? vibe.label : neighborhood!.name, item: `${BASE}/tapahtumat/${slug}` },
    ],
  }

  const staticDesc = vibe
    ? VIBE_DESCRIPTIONS[vibe.id]
    : `Kaikki tapahtumat ${LOCATIVE[slug] || neighborhood!.name + 'ssa'} — ${neighborhood!.vibe}. Löydä tulevat tapahtumat, konsertit, näyttelyt ja muut menot ${neighborhood!.name}sta.`

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-gray-500 mb-6 flex items-center gap-2">
            <Link href="/" className="hover:text-gray-300 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-gray-300">Tapahtumat</span>
            <span>/</span>
            <span className="text-white">{vibe ? vibe.label : neighborhood!.name}</span>
          </nav>

          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">{pageTitle}</h1>
            <p className="text-gray-400 mb-3">{pageSubtitle}</p>
            {staticDesc && (
              <p className="text-sm text-gray-500 leading-relaxed">{staticDesc}</p>
            )}
          </div>

          {/* Category chips */}
          <div className="mb-6">
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">
              {vibe ? 'Muut kategoriat' : 'Muut alueet'}
            </p>
            <div className="flex flex-wrap gap-2">
              {vibe
                ? VIBES.filter((v) => v.id !== slug).map((v) => (
                    <Link key={v.id} href={`/tapahtumat/${v.id}`}
                      className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">
                      {v.emoji} {v.label}
                    </Link>
                  ))
                : NEIGHBORHOODS.filter((n) => n.id !== slug && n.municipality === neighborhood!.municipality).map((n) => (
                    <Link key={n.id} href={`/tapahtumat/${n.id}`}
                      className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">
                      {n.emoji} {n.name}
                    </Link>
                  ))}
            </div>
          </div>

          {/* Crosslink: show categories on neighborhood pages and vice versa */}
          {neighborhood && (
            <div className="mb-8">
              <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Kategoriat</p>
              <div className="flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <Link key={v.id} href={`/tapahtumat/${v.id}`}
                    className="text-sm bg-gray-900 hover:bg-gray-800 text-gray-400 px-3 py-1.5 rounded-full transition-colors">
                    {v.emoji} {v.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Event list */}
          {events.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">{vibe?.emoji || neighborhood?.emoji}</p>
              <p>Ei tapahtumia löydetty tällä hetkellä.</p>
              <Link href="/" className="mt-4 inline-block text-blue-400 hover:text-blue-300 text-sm">
                ← Katso kaikki tapahtumat
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id}>
                  <Link href={`/e/${encodeURIComponent(e.id)}`}
                    className="flex items-start gap-3 bg-gray-900 hover:bg-gray-800 rounded-xl p-4 transition-colors group">
                    {e.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.image} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug">
                        {e.title}
                      </h2>
                      <p className="text-sm text-gray-400 mt-1">
                        {formatDate(e.startTime)}
                        {e.venue && <span className="text-gray-500"> • {e.venue}</span>}
                      </p>
                    </div>
                    <div className="flex-shrink-0 self-center">
                      {e.isFree ? (
                        <span className="text-green-400 text-xs font-medium">Ilmainen</span>
                      ) : e.price ? (
                        <span className="text-gray-400 text-xs">{e.price}</span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10 pt-6 border-t border-gray-800">
            <Link href="/" className="text-blue-400 hover:text-blue-300 transition-colors text-sm">
              ← Kaikki Helsinki tapahtumat
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
