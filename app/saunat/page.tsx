// Saunat Helsingissä — yleisten saunojen referenssisivu. Omistajan linjaus:
// saunat ovat se osa tekemistä-dataa, jolle EI ole hyvää yhtä paikkaa
// netissä — aukiolot, hinnat, arvosanat, uudet saunat ja saunauutiset
// yhdessä. Sama vertikaalisivujen sarja kuin /terassit ja /yokerhot;
// talvella tämä on sovelluksen relevantein sivu siinä missä Terassit
// kesällä.
//
// Data: OSM-saunat /api/activities-putkesta (jaettu välimuisti), Google-
// kortit data/sauna-cards.json (viikkorikastus), uutuudet activity-reasons-
// tiedoston newPlaces-osiosta ja uutiset tunneittain uutisputkesta.

import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchActivitiesCached } from '@/app/api/activities/route'
import { fetchRestaurantNews } from '@/lib/restaurant-news'
import { matchNewsToRestaurants } from '@/lib/restaurant-news-match'
import { credibilityScore } from '@/lib/credibility'
import { reasonKey } from '@/lib/restaurant-reasons'
import type { ReasonFile } from '@/lib/restaurant-reasons'
import SaunatView, { type SaunaRow } from '@/components/SaunatView'
import saunaCardData from '@/data/sauna-cards.json'
import activityReasonData from '@/data/activity-reasons.json'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Yleiset saunat Helsingissä: aukiolot, hinnat, arvosanat ja uudet saunat — Löyly, Kotiharju, Sompasauna, Uusi Sauna ja koko kaupungin saunakartta yhdessä paikassa.'

export const metadata: Metadata = {
  title: 'Saunat Helsinki — yleiset saunat, aukiolot & uudet saunat | Mitä tänään',
  description: DESC,
  alternates: { canonical: `${BASE}/saunat` },
  openGraph: { title: '🧖 Saunat Helsingissä', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/saunat` },
}

interface SaunaCardEntry {
  image: string | null
  address: string | null
  www: string | null
  phone: string | null
  priceLevel: string | null
}

const MONTHS_INESSIVE = [
  'tammikuussa', 'helmikuussa', 'maaliskuussa', 'huhtikuussa', 'toukokuussa', 'kesäkuussa',
  'heinäkuussa', 'elokuussa', 'syyskuussa', 'lokakuussa', 'marraskuussa', 'joulukuussa',
]

export default async function SaunatSivu() {
  const activities = await fetchActivitiesCached()
  const cards = (saunaCardData as { cards?: Record<string, SaunaCardEntry> }).cards ?? {}

  // OSM:n uudet saunat (karttamerkintä ≤ 180 pv) → "Uusi elokuussa" -merkki.
  // Päivä on merkinnän luontipäivä, ei todennettu avauspäivä → vain kuukausi.
  const reasonFile = activityReasonData as unknown as ReasonFile
  const newSaunaByKey = new Map<string, string>()
  for (const p of reasonFile.newPlaces ?? []) {
    if (p.venueType === 'sauna' && p.venue && p.date) {
      const m = new Date(p.date + 'T12:00:00Z').getUTCMonth()
      newSaunaByKey.set(reasonKey(p.venue), `Uusi ${MONTHS_INESSIVE[m] ?? ''}`)
    }
  }

  const saunas: SaunaRow[] = activities
    .filter((a) => a.category === 'sauna')
    .map((a) => {
      const card = cards[a.name.toLowerCase().trim()]
      return {
        id: a.id,
        name: a.name,
        address: a.address ?? card?.address?.split(',')[0] ?? null,
        lat: a.lat ?? null,
        lon: a.lon ?? null,
        image: a.image ?? card?.image ?? null,
        www: a.www ?? card?.www ?? null,
        phone: a.phone ?? card?.phone ?? null,
        openingHours: a.openingHours ?? null,
        charge: a.charge ?? null,
        priceLevel: card?.priceLevel ?? null,
        rating: a.rating ?? null,
        reviews: a.reviewCount ?? null,
        newLabel: newSaunaByKey.get(reasonKey(a.name)) ?? null,
        news: null,
      }
    })
    // Uskottavimmat ensin (sama Wilson-kaava kuin muuallakin); uudet saunat
    // ilman arvosteluja nousevat omaan osioonsa näkymässä.
    .sort((a, b) => credibilityScore(b.rating, b.reviews) - credibilityScore(a.rating, a.reviews))

  // Tuore lehtijuttu saunasta → 📰-rivi kortille. Uutisputken kaatuminen ei
  // kaada sivua.
  try {
    const news = await fetchRestaurantNews()
    const matches = matchNewsToRestaurants(news, saunas.map((s) => ({ id: s.id, name: s.name })))
    const byId = new Map(matches.map((m) => [m.restaurantId, m]))
    for (const s of saunas) {
      const m = byId.get(s.id)
      if (!m) continue
      const ageDays = (Date.now() - Date.parse(m.pubDate)) / 86_400_000
      if (Number.isNaN(ageDays) || ageDays > 30) continue
      s.news = { title: m.headline, url: m.link, source: m.source }
    }
  } catch { /* ei uutisia tällä kertaa */ }

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Yleiset saunat Helsingissä',
    url: `${BASE}/saunat`,
    numberOfItems: saunas.length,
    itemListElement: saunas.slice(0, 20).map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'LocalBusiness',
        name: s.name,
        ...(s.address ? { address: { '@type': 'PostalAddress', streetAddress: s.address, addressLocality: 'Helsinki', addressCountry: 'FI' } } : {}),
        ...(s.lat && s.lon ? { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lon } } : {}),
        ...(s.www ? { url: /^https?:\/\//i.test(s.www) ? s.www : `https://${s.www}` } : {}),
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Saunat', item: `${BASE}/saunat` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <main className="min-h-screen text-white" style={{ background: '#0a0a0c' }}>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <nav className="text-sm text-white/35 mb-6 flex items-center gap-2">
            <Link href="/" className="hover:text-white/70 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-white">Saunat</span>
          </nav>

          <div className="mb-6">
            <h1 className="text-3xl font-black mb-2" style={{ letterSpacing: '-0.02em' }}>🧖 Saunat Helsingissä</h1>
            <p className="text-white/50 mb-3">
              {saunas.length} yleistä saunaa · aukiolot, hinnat ja arvosanat
            </p>
            <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
          </div>

          <SaunatView saunas={saunas} />

          <div className="mt-10">
            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Katso myös</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/uutta-helsingissa" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🆕 Uutta Helsingissä</Link>
              <Link href="/terassit" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>☀️ Terassit</Link>
              <Link href="/" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🎉 Tapahtumat tänään</Link>
            </div>
          </div>

          <p className="mt-8 text-[11px] text-white/25 leading-relaxed">
            Lähteet: OpenStreetMap (saunat, aukiolot), Google (kuvat ja arvosanat)
            ja suomalaiset uutislähteet. Aukiolot voivat muuttua — tarkista
            saunan omalta sivulta ennen lähtöä. Puuttuuko sauna? Se lisätään
            OpenStreetMapiin, josta sivu päivittyy itsestään.
          </p>
        </div>
      </main>
    </>
  )
}
