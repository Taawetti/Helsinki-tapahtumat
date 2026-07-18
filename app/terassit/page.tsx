import type { Metadata } from 'next'
import Link from 'next/link'
import { HELSINKI_NIGHTCLUBS } from '@/lib/helsinki-nightclubs'
import { TERRACE_REGEX } from '@/lib/nightlife'
import { helsinkiDateRange, formatEventDate } from '@/lib/helsinki-time'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC = 'Helsingin terassit ja terassitapahtumat: kattoterassit, rooftop-baarit ja ulkoilmatapahtumat seuraavan kahden viikon ajalta yhdessä paikassa.'

export const metadata: Metadata = {
  title: 'Terassit Helsinki — kattoterassit & terassitapahtumat | Mitä tänään',
  description: DESC,
  alternates: { canonical: `${BASE}/terassit` },
  openGraph: { title: '☀️ Terassit Helsinki', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/terassit` },
}

interface PageEvent {
  id: string
  title: string
  startTime: string
  venue: string
  isFree: boolean
  price: string | null
  image: string | null
}

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  start_time: string
  images?: { url: string }[]
  location?: { name?: { fi?: string; en?: string } }
  offers?: { is_free: boolean; price?: { fi?: string } }[]
  keywords?: { name: { fi?: string; en?: string } }[]
}

// Two text queries, merged + deduped — mirrors the /tapahtumat/[slug] fetchByText pattern
async function fetchTerraceEvents(): Promise<PageEvent[]> {
  const { start, end } = helsinkiDateRange(14)

  const buildParams = (text: string) =>
    new URLSearchParams({ text, format: 'json', start, end, page_size: '50', include: 'location,keywords', sort: 'start_time', division: 'helsinki' })

  const fetches = ['terassi', 'ulkoilma'].map((text) =>
    fetch(`https://api.hel.fi/linkedevents/v1/event/?${buildParams(text)}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    })
  )

  const results = await Promise.allSettled(fetches)
  const events: PageEvent[] = []
  const seen = new Set<string>()
  // LinkedEvents `start=` matches events still ONGOING at that date — a
  // May-started all-summer program would top the list with a past startDate.
  // Same past-start guard as /ohjelma/[venue], 24h grace for tonight.
  const cutoff = new Date(start).getTime() - 24 * 60 * 60 * 1000

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue
    const data = await r.value.json()
    for (const raw of (data.data || []) as LEEvent[]) {
      if (seen.has(raw.id)) continue
      seen.add(raw.id)
      if (new Date(raw.start_time).getTime() < cutoff) continue
      // Text search is permissive — require an actual terrace/outdoor keyword match
      const haystack = [
        raw.name?.fi || '', raw.short_description?.fi || '',
        ...(raw.keywords || []).map((k) => k.name?.fi || ''),
      ].join(' ').toLowerCase()
      if (!TERRACE_REGEX.test(haystack)) continue
      const offer = raw.offers?.[0]
      const isFree = offer?.is_free ?? false
      events.push({
        id: raw.id,
        title: raw.name?.fi || raw.name?.en || 'Tapahtuma',
        startTime: raw.start_time,
        venue: raw.location?.name?.fi || raw.location?.name?.en || '',
        isFree,
        price: isFree ? null : (offer?.price?.fi || null),
        image: raw.images?.[0]?.url || null,
      })
    }
  }

  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  return events.slice(0, 40)
}

export default async function TerassitSivu() {
  const events = await fetchTerraceEvents()
  const rooftops = HELSINKI_NIGHTCLUBS.filter((v) => v.subCategories.includes('katto'))

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Terassit ja terassitapahtumat Helsingissä',
    url: `${BASE}/terassit`,
    numberOfItems: events.length + rooftops.length,
    itemListElement: [
      ...rooftops.map((v, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'BarOrPub',
          name: v.name,
          address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
          geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lon },
          ...(v.www ? { url: v.www } : {}),
        },
      })),
      ...events.slice(0, 10).map((e, i) => ({
        '@type': 'ListItem',
        position: rooftops.length + i + 1,
        item: {
          '@type': 'Event',
          name: e.title,
          startDate: e.startTime,
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          location: { '@type': 'Place', name: e.venue || 'Helsinki', address: { '@type': 'PostalAddress', addressLocality: 'Helsinki', addressCountry: 'FI' } },
          ...(e.isFree ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } } : {}),
          url: `${BASE}/e/${encodeURIComponent(e.id)}`,
        },
      })),
    ],
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Terassit', item: `${BASE}/terassit` },
    ],
  }

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
            <span className="text-white">Terassit</span>
          </nav>

          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">☀️ Terassit Helsingissä</h1>
            <p className="text-gray-400 mb-3">Kattoterassit, rooftop-baarit ja terassitapahtumat</p>
            <p className="text-sm text-gray-500 leading-relaxed">{DESC}</p>
          </div>

          {/* Related pages */}
          <div className="mb-8">
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Katso myös</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/yokerhot" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🪩 Yökerhot</Link>
              <Link href="/tapahtumat/baari" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🍺 Baaritapahtumat</Link>
              <Link href="/tapahtumat/ilmaiset" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🎁 Ilmaiset tapahtumat</Link>
            </div>
          </div>

          {/* Rooftop bars */}
          <section className="mb-10">
            <h2 className="text-lg font-bold mb-1 text-white">🌇 Kattoterassit & rooftop-baarit</h2>
            <p className="text-sm text-gray-500 mb-3">Drinkit kaupungin kattojen yllä — auki säällä kuin säällä.</p>
            <ul className="space-y-2">
              {rooftops.map((v) => (
                <li key={v.id} className="bg-gray-900 rounded-xl p-4">
                  <h3 className="font-semibold text-white leading-snug">
                    {v.www ? (
                      <a href={v.www} target="_blank" rel="noopener noreferrer" className="hover:text-blue-300 transition-colors">
                        {v.name} ↗
                      </a>
                    ) : v.name}
                  </h3>
                  <p className="text-sm text-gray-500 truncate">{v.address}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* Terrace events */}
          <section>
            <h2 className="text-lg font-bold mb-1 text-white">🎪 Terassi- ja ulkoilmatapahtumat</h2>
            <p className="text-sm text-gray-500 mb-3">Seuraavan kahden viikon ohjelma — mm. Superterassin ja Allas Sea Poolin menot.</p>
            {events.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-4xl mb-3">🍂</p>
                <p>Ei terassitapahtumia listattuna juuri nyt — terassikausi on kesä–elokuussa.</p>
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
                        <h3 className="font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug">
                          {e.title}
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">
                          {formatEventDate(e.startTime)}
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
          </section>

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
