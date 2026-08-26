// Helsinki nightlife — englanninkielinen vastine sivulle /yokerhot.
//
// MIKSI TÄMÄ SIVU. Mitattu DataForSEOsta 26.8.2026: "helsinki nightlife"
// 2 400 hakua/kk, "helsinki bars" 2 900 hakua/kk ja "helsinki clubs" päälle —
// kaikki matalalla kilpailulla. Sauna-sivun jälkeen arvokkain englanninkielinen
// laskeutumissivu, ja klubiopas oli tähän asti vain suomeksi eli näille
// hakijoille näkymätön.
//
// Sisältö on paikkojen nimiä ja osoitteita, joten se toimii englanniksi
// sellaisenaan — toisin kuin tapahtumapohjaisilla sivuilla, joiden otsikot
// tulevat lähteistä suomeksi.
//
// Data on sama kuratoitu lista kuin suomenkielisellä sivulla
// (lib/helsinki-nightclubs.ts) eikä sitä haeta mistään uudestaan. Arvosanojen
// Supabase-kysely on toistettu tässä tiedostossa, koska suomenkielisen sivun
// fetchRatings on sen oma paikallinen funktio — sen nostaminen libiin olisi
// muutos suomenkieliseen sivuun, ja se pidetään koskemattomana.

import type { Metadata } from 'next'
import { HELSINKI_NIGHTCLUBS, type CuratedVenue } from '@/lib/helsinki-nightclubs'
import { supabase } from '@/lib/supabase'
import EnGuidePage from '@/components/EnGuidePage'

export const revalidate = 86400 // curated list changes rarely — sama kuin /yokerhot

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Helsinki nightlife in one place: the best clubs, techno venues, karaoke bars and rooftop bars, hand-picked with addresses, ratings and tips for planning a night out.'

export const metadata: Metadata = {
  title: 'Helsinki nightlife — the best clubs, bars & karaoke',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/nightclubs`,
    languages: { fi: `${BASE}/yokerhot`, en: `${BASE}/en/nightclubs`, 'x-default': `${BASE}/yokerhot` },
  },
  openGraph: {
    title: '🪩 Helsinki nightlife',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/nightclubs`,
  },
}

// Sections in priority order — each venue lands in its FIRST matching section.
// Avaimet ovat suomenkielisen datan avaimia (lib/helsinki-nightclubs.ts), vain
// näkyvä teksti on englanniksi.
const SECTIONS: { key: string; emoji: string; title: string; blurb: string }[] = [
  { key: 'tekno',   emoji: '🎛', title: 'Techno & electronic',   blurb: 'Techno, house and visiting international DJs.' },
  { key: 'klubi',   emoji: '🪩', title: 'Clubs & live music bars', blurb: 'Club nights, live gigs and dance floors.' },
  { key: 'karaoke', emoji: '🎤', title: 'Karaoke bars',          blurb: 'Where the night warms up — a song for every taste.' },
  { key: 'katto',   emoji: '🌇', title: 'Rooftop bars',          blurb: 'Drinks above the city rooftops.' },
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
      // is invalid structured data and '★ 4.2 (0)' looks broken in the UI
      if (row.google_rating != null && ((row.review_count as number) ?? 0) > 0) {
        out[row.venue_key as string] = { rating: row.google_rating as number, reviewCount: row.review_count as number }
      }
    }
    return out
  } catch {
    return {}
  }
}

export default async function EnNightclubsPage() {
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
    name: 'Helsinki nightlife — clubs, bars and karaoke',
    url: `${BASE}/en/nightclubs`,
    numberOfItems: HELSINKI_NIGHTCLUBS.length,
    inLanguage: 'en-GB',
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
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'Nightlife', item: `${BASE}/en/nightclubs` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <EnGuidePage
        emoji="🪩"
        title="Helsinki nightlife"
        crumb="Nightlife"
        stat={`${HELSINKI_NIGHTCLUBS.length} hand-picked clubs, bars and rooftop terraces`}
        intro={DESC}
        seeAlso={[
          { href: '/en', label: '🎉 Events today' },
          { href: '/en/terraces', label: '☀️ Terraces' },
          { href: '/en/saunas', label: '🧖 Saunas' },
        ]}
        sources="Sources: a hand-kept list drawn from MyHelsinki, Resident Advisor, Parasta Stadissa and the venues' own sites, with ratings from Google. Opening hours, door policies and club nights change — check the venue's own channels before you head out."
      >
        <div className="space-y-9">
          {grouped.map((g) => (
            <section key={g.key}>
              <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mb-1">
                {g.emoji} {g.title} <span className="text-white/30 font-bold">· {g.venues.length}</span>
              </h2>
              <p className="text-[12.5px] text-white/40 mb-3">{g.blurb}</p>
              <ul className="space-y-2">
                {g.venues.map((v) => {
                  const r = ratings[v.name.toLowerCase().trim()]
                  return (
                    <li key={v.id} className="rounded-xl p-3.5"
                      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-bold text-white text-[15px] leading-snug">
                            {v.www ? (
                              <a href={v.www} target="_blank" rel="noopener noreferrer" className="hover:text-blue-300 transition-colors">
                                {v.name} ↗
                              </a>
                            ) : v.name}
                          </h3>
                          <p className="text-[12.5px] text-white/50 truncate">{v.address}</p>
                        </div>
                        {r && (
                          <span className="shrink-0 text-[12.5px] font-bold" style={{ color: '#e8c06a' }}>
                            ★ {r.rating.toFixed(1)} <span className="text-white/35 font-normal">({r.reviewCount})</span>
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
      </EnGuidePage>
    </>
  )
}
