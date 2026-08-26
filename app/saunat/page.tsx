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
import SaunatView from '@/components/SaunatView'
import { buildSaunaRows } from '@/lib/guide-data'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Yleiset saunat Helsingissä: aukiolot, hinnat, arvosanat ja uudet saunat — Löyly, Kotiharju, Sompasauna, Uusi Sauna ja koko kaupungin saunakartta yhdessä paikassa.'

const OG_TITLE = "Saunat Helsinki — yleiset saunat, aukiolot & uudet saunat"

export const metadata: Metadata = {
  title: 'Saunat Helsinki — yleiset saunat, aukiolot & uudet saunat',
  description: DESC,
  // Kielipari: englanninkielinen vastine on /en/saunas. Vastavuoroisuus on
  // hreflangin ehto — Google jättää yksipuolisen parin huomiotta.
  alternates: {
    canonical: `${BASE}/saunat`,
    languages: { fi: `${BASE}/saunat`, en: `${BASE}/en/saunas`, 'x-default': `${BASE}/saunat` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }], title: '🧖 Saunat Helsingissä', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/saunat` },
}

export default async function SaunatSivu() {
  // Datakompositio jaettu lib/guide-data.ts:ään — sama data etusivun
  // in-app-oppaassa (/api/guides/saunat) ja tässä SEO-sivussa.
  const saunas = await buildSaunaRows()

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
