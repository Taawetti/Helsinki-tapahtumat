// Free museums in Helsinki — englanninkielinen vastine sivulle /ilmaiset-museot.
//
// MIKSI TÄMÄ SIVU. Mitattu DataForSEOsta 26.8.2026: englanninkielisiä
// Helsinki-hakuja on 19 000/kk matalalla kilpailulla, ja museokävijä on
// tyypillisesti juuri se turisti joka hakee englanniksi ("free museums
// helsinki", "free entry museum helsinki"). Opas oli tähän asti vain suomeksi
// eli näkymätön näille hakijoille.
//
// SAMA REHELLISYYSRAJAUS KUIN SUOMENKIELISELLÄ SIVULLA: tässä ovat vain
// paikat joihin on AINA vapaa pääsy (OSM:n fee=no), ei yksittäisiä
// ilmaispäiviä (Kiasman perjantait ym.) — niille ei ole luotettavaa
// rakenteista lähdettä eikä tietoja kovakoodata.
//
// Data jaetaan suomenkielisen sivun kanssa (buildFreeMuseums) — sama
// välimuisti, ei kaksinkertaista kuormaa lähteille. Paikkojen nimet tulevat
// OSM:stä suomeksi eikä niitä käännetä; osoitteet ja nimet toimivat
// englanninkieliselle lukijalle sellaisenaan.

import type { Metadata } from 'next'
import { buildFreeMuseums } from '@/lib/guide-data'
import EnGuidePage from '@/components/EnGuidePage'
import GuidePlaceList from '@/components/GuidePlaceList'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Free museums in Helsinki — museums and galleries you can walk into without a ticket: Helsinki City Museum, the Money Museum, the Tram Museum and dozens of galleries. Opening hours and map.'

const OG_TITLE = "Free museums in Helsinki — museums & galleries with free entry"

export const metadata: Metadata = {
  title: 'Free museums in Helsinki — museums & galleries with free entry',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/free-museums`,
    languages: {
      fi: `${BASE}/ilmaiset-museot`,
      en: `${BASE}/en/free-museums`,
      'x-default': `${BASE}/ilmaiset-museot`,
    },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '🏛 Free museums & galleries in Helsinki',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/free-museums`,
  },
}

export default async function EnFreeMuseumsPage() {
  const { museums, galleries } = await buildFreeMuseums()

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Free-entry museums and galleries in Helsinki',
    url: `${BASE}/en/free-museums`,
    numberOfItems: museums.length + galleries.length,
    inLanguage: 'en-GB',
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

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'Free museums', item: `${BASE}/en/free-museums` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <EnGuidePage
        emoji="🏛"
        title="Free museums & galleries in Helsinki"
        crumb="Free museums"
        stat={`${museums.length} museums and ${galleries.length} galleries where entry is always free`}
        intro={DESC}
        seeAlso={[
          { href: '/en/new-in-helsinki', label: '🆕 New in Helsinki' },
          { href: '/en/saunas', label: '🧖 Saunas' },
          { href: '/en', label: '🎉 Events today' },
        ]}
        sources="Sources: OpenStreetMap (the fee tag, opening hours) and Google (photos and ratings). This list covers places that never charge admission — many paid museums also run occasional free days, so check the museum's own site for those. Opening hours can change."
      >
        <section className="mb-8">
          <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mb-3">
            Museums <span className="text-white/30 font-bold">· {museums.length}</span>
          </h2>
          <GuidePlaceList places={museums} emoji="🏛" />
        </section>

        <section>
          <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mb-3">
            Galleries <span className="text-white/30 font-bold">· {galleries.length}</span>
          </h2>
          <GuidePlaceList places={galleries} emoji="🖼" />
        </section>
      </EnGuidePage>
    </>
  )
}
