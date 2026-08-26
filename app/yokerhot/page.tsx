import type { Metadata } from 'next'
import Link from 'next/link'
import HomeShell from '@/components/HomeShell'
import { HELSINKI_NIGHTCLUBS, type CuratedVenue } from '@/lib/helsinki-nightclubs'
import { supabase } from '@/lib/supabase'

export const revalidate = 86400 // curated list changes rarely

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC = 'Yökerhot Helsingissä: parhaat klubit, teknoklubit, karaokebaarit ja kattoterassit kuratoituna — osoitteet, arvosanat ja vinkit yhden illan suunnitteluun.'

const OG_TITLE = "Yökerhot Helsinki — parhaat klubit, tekno & karaoke"

export const metadata: Metadata = {
  title: 'Yökerhot Helsinki — parhaat klubit, tekno & karaoke',
  description: DESC,
  alternates: {
    canonical: `${BASE}/yokerhot`,
    languages: { fi: `${BASE}/yokerhot`, en: `${BASE}/en/nightclubs`, 'x-default': `${BASE}/yokerhot` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }], title: '🪩 Yökerhot Helsinki', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/yokerhot` },
}

// Sections in priority order — each venue lands in its FIRST matching section
const SECTIONS: { key: string; emoji: string; title: string; blurb: string }[] = [
  { key: 'tekno',   emoji: '🎛', title: 'Tekno & elektroninen', blurb: 'Teknoa, housea ja kansainvälisiä DJ-vieraita.' },
  { key: 'klubi',   emoji: '🪩', title: 'Klubit & keikkabaarit', blurb: 'Klubi-iltoja, livekeikkoja ja tanssilattioita.' },
  { key: 'karaoke', emoji: '🎤', title: 'Karaokebaarit', blurb: 'Illan äänenavaus — karaokea joka makuun.' },
  { key: 'katto',   emoji: '🌇', title: 'Kattoterassit & rooftop-baarit', blurb: 'Drinkit kaupungin kattojen yllä.' },
]

interface RatingInfo { rating: number; reviewCount: number }

async function fetchRatings(names: string[]): Promise<Record<string, RatingInfo>> {
  if (!supabase) return {}
  try {
    const keys = names.map((n) => n.toLowerCase().trim())
    const { data, error } = await supabase
      .from('venue_ratings')
      .select('venue_key, google_rating, review_count')
      .in('venue_key', keys)
    if (error || !data) return {}
    const out: Record<string, RatingInfo> = {}
    for (const row of data) {
      // Require a positive review count — AggregateRating with reviewCount 0
      // is invalid structured data and '⭐ 4.2 (0)' looks broken in the UI
      if (row.google_rating != null && ((row.review_count as number) ?? 0) > 0) {
        out[row.venue_key as string] = { rating: row.google_rating as number, reviewCount: row.review_count as number }
      }
    }
    return out
  } catch {
    return {}
  }
}

export default async function YokerhotSivu() {
  const ratings = await fetchRatings(HELSINKI_NIGHTCLUBS.map((v) => v.name))

  // Assign each venue to its first matching section (avoids duplicates)
  const assigned = new Set<string>()
  const grouped = SECTIONS.map((s) => {
    const venues = HELSINKI_NIGHTCLUBS.filter((v) => !assigned.has(v.id) && v.subCategories.includes(s.key))
    venues.forEach((v) => assigned.add(v.id))
    return { ...s, venues }
  }).filter((g) => g.venues.length > 0)

  const clubLd = (v: CuratedVenue) => ({
    '@type': v.type === 'yokerho' ? 'NightClub' : 'BarOrPub',
    name: v.name,
    address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
    geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lon },
    ...(v.www ? { url: v.www } : {}),
    ...(ratings[v.name.toLowerCase().trim()]
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: ratings[v.name.toLowerCase().trim()].rating,
            reviewCount: ratings[v.name.toLowerCase().trim()].reviewCount,
          },
        }
      : {}),
  })

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Yökerhot Helsingissä',
    url: `${BASE}/yokerhot`,
    numberOfItems: HELSINKI_NIGHTCLUBS.length,
    itemListElement: grouped.flatMap((g) => g.venues).map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: clubLd(v),
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Yökerhot', item: `${BASE}/yokerhot` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {/* Sovellusnäkymä valmiiksi tämän sivun suodattimella — sama tila kuin
          jos käyttäjä säätäisi sen itse etusivulla. Sivun oma sisältö jää
          alle: se on tämän sivun hakukonearvo, eikä sitä saa menettää. */}
      <HomeShell initialVibes={['yoelama']} initialDateFilter="week" />

      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
          {/* Breadcrumb */}

          {/* Page header */}
          <div className="mb-8">
            <h1 className="sr-only">🪩 Yökerhot Helsingissä</h1>
            <p className="text-gray-400 mb-3">{HELSINKI_NIGHTCLUBS.length} kuratoitua klubia, baaria ja kattoterassia</p>
            <p className="text-sm text-gray-500 leading-relaxed">{DESC}</p>
          </div>

          {/* Related pages */}
          <div className="mb-8">
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Katso myös</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/tapahtumat/yoelama" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🌃 Illan tapahtumat</Link>
              <Link href="/ohjelma/kaiku" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🎛 Kaiku — ohjelma</Link>
              <Link href="/ohjelma/tavastia" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🎸 Tavastia — ohjelma</Link>
              <Link href="/pubivisat" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🧠 Pubivisat</Link>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-10">
            {grouped.map((g) => (
              <section key={g.key}>
                <h2 className="text-lg font-bold mb-1 text-white">{g.emoji} {g.title}</h2>
                <p className="text-sm text-gray-500 mb-3">{g.blurb}</p>
                <ul className="space-y-2">
                  {g.venues.map((v) => {
                    const r = ratings[v.name.toLowerCase().trim()]
                    return (
                      <li key={v.id} className="bg-gray-900 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-white leading-snug">
                              {v.www ? (
                                <a href={v.www} target="_blank" rel="noopener noreferrer" className="hover:text-blue-300 transition-colors">
                                  {v.name} ↗
                                </a>
                              ) : v.name}
                            </h3>
                            <p className="text-sm text-gray-500 truncate">{v.address}</p>
                          </div>
                          {r && (
                            <span className="flex-shrink-0 text-xs text-amber-400">
                              ⭐ {r.rating.toFixed(1)} <span className="text-gray-600">({r.reviewCount})</span>
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>

          <div className="mt-10 pt-6 border-t border-gray-800">
            <Link href="/" className="text-blue-400 hover:text-blue-300 transition-colors text-sm">
              ← Kaikki Helsinki tapahtumat
            </Link>
          </div>
      </section>
    </>
  )
}
