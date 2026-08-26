// Public saunas in Helsinki — englanninkielinen vastine sivulle /saunat.
//
// MIKSI TÄMÄ SIVU ON ENSIMMÄINEN. Mitattu DataForSEOsta 26.8.2026:
// "sauna helsinki" 8 100 hakua/kk maailmanlaajuisesti ja 4 400 hakua/kk
// SUOMEN SISÄLLÄ englanniksi — suurin yksittäinen englanninkielinen hakusana
// joka osuu sovelluksen omaan sisältöön, ja kilpailu vain keskitasoa.
// Saunaopas oli tähän asti vain suomeksi eli näkymätön näille hakijoille.
//
// Sisältö on paikkojen nimiä ja osoitteita, joten se toimii englanniksi
// sellaisenaan — toisin kuin tapahtumapohjaisilla sivuilla, joiden otsikot
// tulevat lähteistä suomeksi.
//
// Data jaetaan suomenkielisen sivun kanssa (lib/guide-data.ts) — sama
// välimuisti, ei kaksinkertaista kuormaa lähteille.

import type { Metadata } from 'next'
import SaunatView from '@/components/SaunatView'
import EnGuidePage from '@/components/EnGuidePage'
import { buildSaunaRows } from '@/lib/guide-data'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Public saunas in Helsinki: opening hours, prices, ratings and new openings — Löyly, Kotiharju, Sompasauna, Uusi Sauna and the whole city sauna map in one place.'

export const metadata: Metadata = {
  title: 'Public saunas in Helsinki — opening hours, prices & new saunas',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/saunas`,
    languages: { fi: `${BASE}/saunat`, en: `${BASE}/en/saunas`, 'x-default': `${BASE}/saunat` },
  },
  openGraph: {
    title: '🧖 Public saunas in Helsinki',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/saunas`,
  },
}

export default async function EnSaunasPage() {
  const saunas = await buildSaunaRows()

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Public saunas in Helsinki',
    url: `${BASE}/en/saunas`,
    numberOfItems: saunas.length,
    inLanguage: 'en-GB',
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
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'Saunas', item: `${BASE}/en/saunas` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <EnGuidePage
        emoji="🧖"
        title="Public saunas in Helsinki"
        crumb="Saunas"
        stat={`${saunas.length} public saunas · opening hours, prices and ratings`}
        intro={DESC}
        seeAlso={[
          { href: '/en/new-in-helsinki', label: '🆕 New in Helsinki' },
          { href: '/en/terraces', label: '☀️ Terraces' },
          { href: '/en', label: '🎉 Events today' },
        ]}
        sources="Sources: OpenStreetMap (saunas, opening hours), Google (photos and ratings) and Finnish news outlets. Opening hours can change — check the sauna's own site before you go. Missing a sauna? It gets added to OpenStreetMap, and this page updates itself."
      >
        <SaunatView saunas={saunas} />
      </EnGuidePage>
    </>
  )
}
