// Ilmaiset museot & galleriat — omistajan valitsema opas. REHELLISYYSRAJAUS:
// tämä sivu listaa paikat joihin on AINA vapaa pääsy (OSM:n fee=no -tieto,
// 37 paikkaa) — ei yksittäisiä ilmaispäiviä (Kiasman perjantait ym.), koska
// niille ei ole luotettavaa rakenteista lähdettä eikä tietoja kovakoodata
// (talon sääntö: toistuvat poikkeukset vanhenevat käsissä). Jos ilmais-
// päivälähde löytyy myöhemmin, se lisätään tähän omana osionaan.

import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchActivitiesCached } from '@/app/api/activities/route'
import GuidePlaceList, { type GuidePlace } from '@/components/GuidePlaceList'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Museot ja galleriat joihin on aina vapaa pääsy Helsingissä — Helsingin kaupunginmuseo, Rahamuseo, Ratikkamuseo ja kymmenet galleriat. Aukiolot ja kartta.'

export const metadata: Metadata = {
  title: 'Ilmaiset museot Helsinki — vapaan pääsyn museot & galleriat | Mitä tänään',
  description: DESC,
  alternates: { canonical: `${BASE}/ilmaiset-museot` },
  openGraph: { title: '🏛 Ilmaiset museot & galleriat', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/ilmaiset-museot` },
}

export default async function IlmaisetMuseotSivu() {
  const activities = await fetchActivitiesCached()

  // fee === false on OSM:n oma "maksuton"-merkintä — todennettua tietoa,
  // ei päättelyä. Sama paikka voi olla datassa kahdesti (solmu + alue).
  const seen = new Set<string>()
  const toPlace = (category: 'museo' | 'galleria'): GuidePlace[] =>
    activities
      .filter((a) => a.category === category && a.fee === false)
      .filter((a) => {
        const key = a.name.toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((a) => ({
        id: a.id,
        name: a.name,
        address: a.address ?? null,
        lat: a.lat ?? null,
        lon: a.lon ?? null,
        openingHours: a.openingHours ?? null,
        www: a.www ?? null,
        image: a.image ?? null,
        rating: a.rating ?? null,
        reviews: a.reviewCount ?? null,
        sub: a.city && a.city !== 'Helsinki' ? a.city : null,
      }))
      .sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0))

  const museums = toPlace('museo')
  const galleries = toPlace('galleria')

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Vapaan pääsyn museot ja galleriat Helsingissä',
    url: `${BASE}/ilmaiset-museot`,
    numberOfItems: museums.length + galleries.length,
    itemListElement: [...museums, ...galleries].slice(0, 25).map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Museum',
        name: m.name,
        isAccessibleForFree: true,
        ...(m.address ? { address: { '@type': 'PostalAddress', streetAddress: m.address, addressLocality: 'Helsinki', addressCountry: 'FI' } } : {}),
        ...(m.lat && m.lon ? { geo: { '@type': 'GeoCoordinates', latitude: m.lat, longitude: m.lon } } : {}),
        ...(m.www ? { url: /^https?:\/\//i.test(m.www) ? m.www : `https://${m.www}` } : {}),
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
            <span className="text-white">Ilmaiset museot</span>
          </nav>

          <div className="mb-6">
            <h1 className="text-3xl font-black mb-2" style={{ letterSpacing: '-0.02em' }}>🏛 Ilmaiset museot & galleriat</h1>
            <p className="text-white/50 mb-3">
              {museums.length} museota ja {galleries.length} galleriaa, joihin on aina vapaa pääsy
            </p>
            <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
          </div>

          <section className="mb-8">
            <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mb-3">
              Museot <span className="text-white/30 font-bold">· {museums.length}</span>
            </h2>
            <GuidePlaceList places={museums} emoji="🏛" />
          </section>

          <section>
            <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mb-3">
              Galleriat <span className="text-white/30 font-bold">· {galleries.length}</span>
            </h2>
            <GuidePlaceList places={galleries} emoji="🖼" />
          </section>

          <div className="mt-10">
            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Katso myös</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/uutta-helsingissa" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🆕 Uutta Helsingissä</Link>
              <Link href="/tapahtumat/museo" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🏛 Museotapahtumat</Link>
              <Link href="/" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🎉 Tapahtumat tänään</Link>
            </div>
          </div>

          <p className="mt-8 text-[11px] text-white/25 leading-relaxed">
            Maksuttomuustieto tulee OpenStreetMapista (fee-merkintä) — lista
            kattaa paikat joihin on aina vapaa pääsy. Monella maksullisella
            museolla on lisäksi yksittäisiä ilmaispäiviä; tarkista ne museon
            omalta sivulta. Aukiolot voivat muuttua.
          </p>
        </div>
      </main>
    </>
  )
}
