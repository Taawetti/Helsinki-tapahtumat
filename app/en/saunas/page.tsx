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

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC =
  'Public saunas in Helsinki: opening hours, prices, ratings and new openings — Löyly, Kotiharju, Sompasauna, Uusi Sauna and the whole city sauna map in one place.'

const OG_TITLE = "Public saunas in Helsinki — opening hours, prices & new saunas"

export const metadata: Metadata = {
  title: 'Public saunas in Helsinki — opening hours, prices & new saunas',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/saunas`,
    languages: { fi: `${BASE}/saunat`, en: `${BASE}/en/saunas`, 'x-default': `${BASE}/saunat` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '🧖 Public saunas in Helsinki',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/saunas`,
  },
}

export default async function EnSaunasPage() {
  // Sama paketti jonka sovelluksen opas saa — yhteinen buildGuidePayload
  // takaa, ettei hakukoneen ja sovelluksen näkemä data eroa.
  const data = await buildGuidePayload('saunat', BASE)
  const saunas = data.saunas ?? []

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

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="saunat" initialGuideData={{ saunas }} />

      {/* Sivun oma kuvausteksti ja lähdeseloste — hakukoneelle merkityksellistä
          sisältöä. H1 on ruudunlukijoille ja Googlelle; sovellusnäkymässä on jo
          oma otsikkorivinsä, joten kahta näkyvää otsikkoa ei haluta. */}
      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Public saunas in Helsinki — {saunas.length} saunas</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          {'Sources: OpenStreetMap (saunas, opening hours), Google (photos and ratings) and Finnish news outlets. Opening hours can change — check the sauna\'s own site before you go. Missing a sauna? It gets added to OpenStreetMap, and this page updates itself.'}
        </p>
      </section>
    </>
  )
}
