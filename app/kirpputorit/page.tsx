// Kirpputorit & second hand — omistajan valitsema opas: second hand -Helsinkiä
// ei ole koottu missään. Liikkeet OSM:stä (data/secondhand.json, viikkohaku),
// kirppistapahtumat LinkedEventsistä samalla kuviolla kuin /terassit.

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'
import { buildGuidePayload } from '@/lib/guide-data'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC =
  'Kirpputorit ja second hand -liikkeet Helsingissä, Espoossa ja Vantaalla — aukiolot ja kartta, sekä tulevat kirppistapahtumat ja vintage-myyjäiset.'

const OG_TITLE = "Kirpputorit Helsinki — second hand -liikkeet & kirppistapahtumat"

export const metadata: Metadata = {
  title: 'Kirpputorit Helsinki — second hand -liikkeet & kirppistapahtumat',
  description: DESC,
  // Kielipari: englanninkielinen vastine on /en/flea-markets. Vastavuoroisuus
  // on hreflangin ehto — Google jättää yksipuolisen parin huomiotta.
  alternates: {
    canonical: `${BASE}/kirpputorit`,
    languages: { fi: `${BASE}/kirpputorit`, en: `${BASE}/en/flea-markets`, 'x-default': `${BASE}/kirpputorit` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }], title: '🛍 Kirpputorit & second hand', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/kirpputorit` },
}

// OMISTAJAN LINJAUS 26.8.2026: hakutuloksesta tuleva laskeutuu SAMAAN
// näkymään jonka etusivun opasvalikko avaa. Data haetaan yhä palvelimella,
// jotta Googlelle lähtevässä HTML:ssä on lista eikä tyhjä kuori (mitattu ennen
// muutosta: 109 nimeä). Tekstihaku + KIRPPIS_REGEX guide-datassa.

export default async function KirpputoritSivu() {
  // Sama paketti jonka sovelluksen opas saa (/api/guides/kirpputorit).
  const data = await buildGuidePayload('kirpputorit', BASE)
  const shops = data.shops ?? []
  const events = data.events ?? []

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Kirpputorit ja second hand -liikkeet pääkaupunkiseudulla',
    url: `${BASE}/kirpputorit`,
    numberOfItems: shops.length,
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

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="kirpputorit" initialGuideData={{ shops, events }} />

      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Kirpputorit ja second hand Helsingissä — {shops.length} liikettä</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          Liikkeet: OpenStreetMap (Helsinki, Espoo, Vantaa; second hand-,
          kierrätys- ja antiikkiliikkeet). Tapahtumat: Helsingin
          LinkedEvents. Puuttuuko liike? Se lisätään OpenStreetMapiin, josta
          sivu päivittyy itsestään.
        </p>
      </section>
    </>
  )
}
