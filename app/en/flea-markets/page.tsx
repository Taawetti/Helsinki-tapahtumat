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
  const data = await buildGuidePayload('kirpputorit', BASE)
  const shops = data.shops ?? []
  const events = data.events ?? []

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

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="kirpputorit" initialGuideData={{ shops, events }} />

      {/* Sivun oma kuvausteksti ja lähdeseloste — hakukoneelle merkityksellistä
          sisältöä. H1 on ruudunlukijoille ja Googlelle; sovellusnäkymässä on jo
          oma otsikkorivinsä, joten kahta näkyvää otsikkoa ei haluta. */}
      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Flea markets & second hand in Helsinki — {shops.length} shops</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          {'Sources: OpenStreetMap (second hand, charity and antique shops in Helsinki, Espoo and Vantaa) and Helsinki LinkedEvents for the events. Event titles come from the organisers in Finnish. Opening hours can change — check before you travel across town. Missing a shop? It gets added to OpenStreetMap, and this page updates itself.'}
        </p>
      </section>
    </>
  )
}
