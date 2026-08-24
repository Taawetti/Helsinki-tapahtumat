// Kirpputorit & second hand — omistajan valitsema opas: second hand -Helsinkiä
// ei ole koottu missään. Liikkeet OSM:stä (data/secondhand.json, viikkohaku),
// kirppistapahtumat LinkedEventsistä samalla kuviolla kuin /terassit.

import type { Metadata } from 'next'
import Link from 'next/link'
import { formatEventDate } from '@/lib/helsinki-time'
import { fetchKirppisEvents, mapSecondhandShops, type GuideEvent } from '@/lib/guide-data'
import GuidePlaceList, { type GuidePlace } from '@/components/GuidePlaceList'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Kirpputorit ja second hand -liikkeet Helsingissä, Espoossa ja Vantaalla — aukiolot ja kartta, sekä tulevat kirppistapahtumat ja vintage-myyjäiset.'

export const metadata: Metadata = {
  title: 'Kirpputorit Helsinki — second hand -liikkeet & kirppistapahtumat | Mitä tänään',
  description: DESC,
  alternates: { canonical: `${BASE}/kirpputorit` },
  openGraph: { title: '🛍 Kirpputorit & second hand', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/kirpputorit` },
}

// Tekstihaku on löyhä — vaadi aito kirppissana otsikosta/kuvauksesta.
// Datahaku + KIRPPIS_REGEX jaettu lib/guide-data.ts:ään.
type PageEvent = GuideEvent

export default async function KirpputoritSivu() {
  const events = await fetchKirppisEvents()
  const shops: GuidePlace[] = mapSecondhandShops()

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Kirpputorit ja second hand -liikkeet pääkaupunkiseudulla',
    url: `${BASE}/kirpputorit`,
    numberOfItems: shops.length,
    itemListElement: shops.slice(0, 25).map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Store',
        name: s.name,
        ...(s.address ? { address: { '@type': 'PostalAddress', streetAddress: s.address, addressLocality: 'Helsinki', addressCountry: 'FI' } } : {}),
        ...(s.lat && s.lon ? { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lon } } : {}),
      },
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <main className="min-h-screen text-white" style={{ background: '#0a0a0c' }}>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <nav className="text-sm text-white/35 mb-6 flex items-center gap-2">
            <Link href="/" className="hover:text-white/70 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-white">Kirpputorit</span>
          </nav>

          <div className="mb-6">
            <h1 className="text-3xl font-black mb-2" style={{ letterSpacing: '-0.02em' }}>🛍 Kirpputorit & second hand</h1>
            <p className="text-white/50 mb-3">{shops.length} liikettä pääkaupunkiseudulla · tulevat kirppistapahtumat</p>
            <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
          </div>

          {/* Tapahtumat ensin — ne vanhenevat, liikkeet pysyvät */}
          {events.length > 0 && (
            <section className="mb-8">
              <h2 className="text-[15px] font-black tracking-[.08em] uppercase mb-3" style={{ color: '#fcd34d' }}>
                🎪 Kirppistapahtumat <span className="text-white/30 font-bold">· {events.length}</span>
              </h2>
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/e/${encodeURIComponent(e.id)}`}
                      className="block rounded-xl p-3.5 transition-colors hover:bg-white/6"
                      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                      <p className="font-bold text-white text-[14px] leading-snug">{e.title}</p>
                      <p className="text-[12.5px] text-white/50 mt-0.5">
                        {formatEventDate(e.startTime)}{e.venue ? ` · ${e.venue}` : ''}
                        {e.isFree ? ' · 🎁 maksuton' : ''}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mb-3">
            Liikkeet <span className="text-white/30 font-bold">· {shops.length}</span>
          </h2>
          <GuidePlaceList places={shops} emoji="🛍" />

          <div className="mt-10">
            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Katso myös</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/uutta-helsingissa" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🆕 Uutta Helsingissä</Link>
              <Link href="/ilmaiset-museot" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🏛 Ilmaiset museot</Link>
              <Link href="/" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🎉 Tapahtumat tänään</Link>
            </div>
          </div>

          <p className="mt-8 text-[11px] text-white/25 leading-relaxed">
            Liikkeet: OpenStreetMap (Helsinki, Espoo, Vantaa; second hand-,
            kierrätys- ja antiikkiliikkeet). Tapahtumat: Helsingin
            LinkedEvents. Puuttuuko liike? Se lisätään OpenStreetMapiin, josta
            sivu päivittyy itsestään.
          </p>
        </div>
      </main>
    </>
  )
}
