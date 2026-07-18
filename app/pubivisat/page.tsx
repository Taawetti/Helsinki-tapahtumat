import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchVisas, nextOccurrenceISO, WEEKDAY_FI, PUBIVISAT_SOURCE_URL } from '@/lib/pubivisat'

export const revalidate = 86400 // schedule changes rarely

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC = 'Kaikki Helsingin pubivisat viikonpäivittäin: missä baarissa on tietovisa maanantaina, tiistaina tai muina iltoina. Aikataulut ja osoitteet yhdessä paikassa.'

export const metadata: Metadata = {
  title: 'Pubivisat Helsinki — viikon tietovisat baareissa | Mitä tänään',
  description: DESC,
  alternates: { canonical: `${BASE}/pubivisat` },
  openGraph: { title: '🧠 Pubivisat Helsinki', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/pubivisat` },
}

export default async function PubivisatSivu() {
  const visas = await fetchVisas()

  // Group Mon..Sun (JS weekday 1..6, 0)
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
  const byDay = weekdayOrder
    .map((wd) => ({
      weekday: wd,
      label: WEEKDAY_FI[wd],
      visas: visas
        .filter((v) => v.weekday === wd)
        .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)),
    }))
    .filter((g) => g.visas.length > 0)

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Pubivisat Helsingissä',
    url: `${BASE}/pubivisat`,
    numberOfItems: visas.length,
    itemListElement: visas.slice(0, 20).map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: `Tietovisa – ${v.name}`,
        startDate: nextOccurrenceISO(v),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        location: {
          '@type': 'BarOrPub',
          name: v.name,
          address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
        },
      },
    })),
  }

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: byDay.slice(0, 4).map((g) => ({
      '@type': 'Question',
      name: `Missä on pubivisa ${g.label.toLowerCase()}na Helsingissä?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: g.visas.slice(0, 6).map((v) => `${v.name} klo ${String(v.hour).padStart(2, '0')}.${String(v.minute).padStart(2, '0')}`).join(', '),
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Pubivisat', item: `${BASE}/pubivisat` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-gray-500 mb-6 flex items-center gap-2">
            <Link href="/" className="hover:text-gray-300 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-white">Pubivisat</span>
          </nav>

          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">🧠 Pubivisat Helsingissä</h1>
            <p className="text-gray-400 mb-3">{visas.length} viikoittaista tietovisaa baareissa ympäri kaupunkia</p>
            <p className="text-sm text-gray-500 leading-relaxed">{DESC}</p>
          </div>

          {/* Related pages */}
          <div className="mb-8">
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Katso myös</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/tapahtumat/baari" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🍺 Baaritapahtumat</Link>
              <Link href="/yokerhot" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🪩 Yökerhot</Link>
              <Link href="/tapahtumat/yoelama" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🌃 Yöelämä</Link>
            </div>
          </div>

          {/* Weekly schedule */}
          {byDay.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">🧠</p>
              <p>Visalistaa ei saatu ladattua juuri nyt.</p>
              <a href={PUBIVISAT_SOURCE_URL} target="_blank" rel="noopener noreferrer"
                className="mt-4 inline-block text-blue-400 hover:text-blue-300 text-sm">
                Katso pubivisat.fi ↗
              </a>
            </div>
          ) : (
            <div className="space-y-8">
              {byDay.map((g) => (
                <section key={g.weekday}>
                  <h2 className="text-lg font-bold mb-3 text-white">{g.label}</h2>
                  <ul className="space-y-2">
                    {g.visas.map((v, i) => (
                      <li key={`${g.weekday}-${i}`}
                        className="flex items-center gap-3 bg-gray-900 rounded-xl p-4">
                        <span className="text-sm font-mono text-blue-300 flex-shrink-0 w-12">
                          {String(v.hour).padStart(2, '0')}.{String(v.minute).padStart(2, '0')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white leading-snug">{v.name}</h3>
                          <p className="text-sm text-gray-500 truncate">{v.address}</p>
                        </div>
                        <span className="text-green-400 text-xs font-medium flex-shrink-0">Ilmainen</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-gray-800 flex items-center justify-between">
            <Link href="/" className="text-blue-400 hover:text-blue-300 transition-colors text-sm">
              ← Kaikki Helsinki tapahtumat
            </Link>
            <a href={PUBIVISAT_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-gray-600 text-xs hover:text-gray-400">
              Lähde: pubivisat.fi
            </a>
          </div>
        </div>
      </main>
    </>
  )
}
