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
import HomeShell from '@/components/HomeShell'
import { jsonLdHtml } from '@/lib/json-ld'

export const revalidate = 86400 // curated list changes rarely — sama kuin /yokerhot

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC =
  'Helsinki nightlife in one place: the best clubs, techno venues, karaoke bars and rooftop bars, hand-picked with addresses, ratings and tips for planning a night out.'

const OG_TITLE = "Helsinki nightlife — the best clubs, bars & karaoke"

export const metadata: Metadata = {
  title: 'Helsinki nightlife — the best clubs, bars & karaoke',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/nightclubs`,
    languages: { fi: `${BASE}/yokerhot`, en: `${BASE}/en/nightclubs`, 'x-default': `${BASE}/yokerhot` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />
      {/* Sovellusnäkymä valmiiksi tämän sivun suodattimella — sama tila kuin
          jos käyttäjä säätäisi sen itse etusivulla. Sivun oma sisältö jää
          alle: se on tämän sivun hakukonearvo. */}
      {/* Restaurants → Clubs, same as /yokerhot (owner 5.11.2026): clubs are
          places, not events, so the app opens on the Clubs type of the
          Restaurants tab with the app's own place cards and info panels. */}
      <HomeShell initialMode="restaurants" initialRestaurantFilter={{ restType: 'yokerhot', subCat: 'all' }} />

      <EnGuidePage
        asSection
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
        {/* Text only — the clubs themselves are the app view above (Restaurants →
            Clubs). The old card list duplicated the app with a different look. */}
        <div className="text-sm text-white/45 leading-relaxed space-y-3">
          <p>
            Helsinki&apos;s nightlife splits in two. <strong className="text-white/70">Downtown and Kamppi</strong> have
            the big clubs and chart music (Kaarle XII, Apollo Live Club, Maxine) and the rock clubs Tavastia and
            On The Rocks. <strong className="text-white/70">Kallio and Sörnäinen</strong> are the alternative,
            electronic side: Kaiku, Post Bar, Siltanen and Kuudes Linja around Hämeentie, plus Ääniwalli in an old
            industrial hall in Vallila.
          </p>
          <p>
            <strong className="text-white/70">Good to know:</strong> most clubs stay open until 4 am. Age limits vary:
            18 is enough in many bars and techno clubs, while downtown clubs often ask for 20–22 at weekends. Entry is
            often free or under 20 euros, bigger guest nights cost more, and the cloakroom is paid separately. The clubs
            are in the app view above; tonight&apos;s club nights and gigs are under the Events tab with the Nightlife
            filter and on each venue&apos;s programme page.
          </p>
        </div>
      </EnGuidePage>
    </>
  )
}
