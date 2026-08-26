// Flea markets & second hand — englanninkielinen vastine sivulle /kirpputorit.
//
// MIKSI: mitattu DataForSEOsta 26.8.2026, englanninkieliset Helsinki-haut
// ("flea market helsinki", "second hand helsinki", "vintage shops helsinki")
// osuvat suoraan tähän sisältöön, ja kilpailu on matala. Opas oli tähän asti
// vain suomeksi eli näkymätön näille hakijoille — ja kirppis-Helsinki on
// nimenomaan turistikysyntää.
//
// Data jaetaan suomenkielisen sivun kanssa (lib/guide-data.ts): liikkeet
// OSM-viikkohausta (data/secondhand.json), tapahtumat LinkedEventsistä.
// Sama välimuisti, ei kaksinkertaista kuormaa lähteille.
//
// Tapahtumien otsikot tulevat lähteestä suomeksi — tiedossa oleva rajoite,
// jota ei yritetä kääntää. Sivun oma teksti ja päivämäärät ovat englantia
// (formatEventDate(iso, 'en')).

import type { Metadata } from 'next'
import Link from 'next/link'
import { formatEventDate } from '@/lib/helsinki-time'
import { fetchKirppisEvents, mapSecondhandShops } from '@/lib/guide-data'
import EnGuidePage from '@/components/EnGuidePage'
import GuidePlaceList, { type GuidePlace } from '@/components/GuidePlaceList'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Flea markets, second hand and vintage shops in Helsinki, Espoo and Vantaa — opening hours and map, plus upcoming flea market events and vintage fairs.'

const OG_TITLE = "Flea markets in Helsinki — second hand & vintage shops"

export const metadata: Metadata = {
  title: 'Flea markets in Helsinki — second hand & vintage shops',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/flea-markets`,
    languages: {
      fi: `${BASE}/kirpputorit`,
      en: `${BASE}/en/flea-markets`,
      'x-default': `${BASE}/kirpputorit`,
    },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '🛍 Flea markets & second hand in Helsinki',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/flea-markets`,
  },
}

export default async function EnFleaMarketsPage() {
  const events = await fetchKirppisEvents()
  const shops: GuidePlace[] = mapSecondhandShops()

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Flea markets and second hand shops in Helsinki',
    url: `${BASE}/en/flea-markets`,
    numberOfItems: shops.length,
    inLanguage: 'en-GB',
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

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'Flea markets', item: `${BASE}/en/flea-markets` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <EnGuidePage
        emoji="🛍"
        title="Flea markets & second hand in Helsinki"
        crumb="Flea markets"
        stat={`${shops.length} shops in Helsinki, Espoo and Vantaa · upcoming flea market events`}
        intro={DESC}
        seeAlso={[
          { href: '/en/new-in-helsinki', label: '🆕 New in Helsinki' },
          { href: '/en/saunas', label: '🧖 Saunas' },
          { href: '/en', label: '🎉 Events today' },
        ]}
        sources="Sources: OpenStreetMap (second hand, charity and antique shops in Helsinki, Espoo and Vantaa) and Helsinki LinkedEvents for the events. Event titles come from the organisers in Finnish. Opening hours can change — check before you travel across town. Missing a shop? It gets added to OpenStreetMap, and this page updates itself."
      >
        {/* Tapahtumat ensin — ne vanhenevat, liikkeet pysyvät */}
        {events.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[15px] font-black tracking-[.08em] uppercase mb-3" style={{ color: '#fcd34d' }}>
              🎪 Flea market events <span className="text-white/30 font-bold">· {events.length}</span>
            </h2>
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id}>
                  <Link href={`/e/${encodeURIComponent(e.id)}`}
                    className="block rounded-xl p-3.5 transition-colors hover:bg-white/6"
                    style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                    <p className="font-bold text-white text-[14px] leading-snug">{e.title}</p>
                    <p className="text-[12.5px] text-white/50 mt-0.5">
                      {formatEventDate(e.startTime, 'en')}{e.venue ? ` · ${e.venue}` : ''}
                      {e.isFree ? ' · 🎁 free entry' : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mb-3">
          Shops <span className="text-white/30 font-bold">· {shops.length}</span>
        </h2>
        <GuidePlaceList places={shops} emoji="🛍" />
      </EnGuidePage>
    </>
  )
}
