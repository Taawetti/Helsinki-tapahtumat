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
//
// OMISTAJAN LINJAUS 26.8.2026: hakutuloksesta tuleva laskeutuu SAMAAN
// sovellusnäkymään jonka etusivun opasvalikko avaa, ei erilliseen kehykseen.
// Kieli tulee LanguageGatelta (/en-polku → 'en'), joten sovellus renderöityy
// englanniksi ilman erillistä lippua. Data haetaan yhä palvelimella, jotta
// Googlelle lähtevässä HTML:ssä on lista eikä tyhjä kuori.

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'
import { buildGuidePayload } from '@/lib/guide-data'

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
  const data = await buildGuidePayload('ilmaiset-museot', BASE)
  const museums = data.museums ?? []
  const galleries = data.galleries ?? []

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

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="ilmaiset-museot" initialGuideData={{ museums, galleries }} />

      {/* Sivun oma kuvausteksti ja lähdeseloste — hakukoneelle merkityksellistä
          sisältöä. H1 on ruudunlukijoille ja Googlelle; sovellusnäkymässä on jo
          oma otsikkorivinsä, joten kahta näkyvää otsikkoa ei haluta. */}
      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Free museums & galleries in Helsinki — {museums.length + galleries.length} places</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          {'Sources: OpenStreetMap (the fee tag, opening hours) and Google (photos and ratings). This list covers places that never charge admission — many paid museums also run occasional free days, so check the museum\'s own site for those. Opening hours can change.'}
        </p>
      </section>
    </>
  )
}
