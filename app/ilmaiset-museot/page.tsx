// Ilmaiset museot & galleriat — omistajan valitsema opas. REHELLISYYSRAJAUS:
// tämä sivu listaa paikat joihin on AINA vapaa pääsy (OSM:n fee=no -tieto,
// 37 paikkaa) — ei yksittäisiä ilmaispäiviä (Kiasman perjantait ym.), koska
// niille ei ole luotettavaa rakenteista lähdettä eikä tietoja kovakoodata
// (talon sääntö: toistuvat poikkeukset vanhenevat käsissä). Jos ilmais-
// päivälähde löytyy myöhemmin, se lisätään tähän omana osionaan.

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'
import { buildGuidePayload } from '@/lib/guide-data'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC =
  'Museot ja galleriat joihin on aina vapaa pääsy Helsingissä — Helsingin kaupunginmuseo, Rahamuseo, Ratikkamuseo ja kymmenet galleriat. Aukiolot ja kartta.'

const OG_TITLE = "Ilmaiset museot Helsinki — vapaan pääsyn museot & galleriat"

export const metadata: Metadata = {
  title: 'Ilmaiset museot Helsinki — vapaan pääsyn museot & galleriat',
  description: DESC,
  // Kielipari: englanninkielinen vastine on /en/free-museums. Vastavuoroisuus
  // on hreflangin ehto — Google jättää yksipuolisen parin huomiotta.
  alternates: {
    canonical: `${BASE}/ilmaiset-museot`,
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
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }], title: '🏛 Ilmaiset museot & galleriat', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/ilmaiset-museot` },
}

export default async function IlmaisetMuseotSivu() {
  // Datakompositio jaettu lib/guide-data.ts:ään (sama data in-app-oppaassa).
  // Sama paketti jonka sovelluksen opas saa (/api/guides/ilmaiset-museot).
  const data = await buildGuidePayload('ilmaiset-museot', BASE)
  const museums = data.museums ?? []
  const galleries = data.galleries ?? []

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Vapaan pääsyn museot ja galleriat Helsingissä',
    url: `${BASE}/ilmaiset-museot`,
    numberOfItems: museums.length + galleries.length,
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

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="ilmaiset-museot" initialGuideData={{ museums, galleries }} />

      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Ilmaiset museot ja galleriat Helsingissä — {museums.length + galleries.length} kohdetta</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          Maksuttomuustieto tulee OpenStreetMapista (fee-merkintä) — lista
          kattaa paikat joihin on aina vapaa pääsy. Monella maksullisella
          museolla on lisäksi yksittäisiä ilmaispäiviä; tarkista ne museon
          omalta sivulta. Aukiolot voivat muuttua.
        </p>
      </section>
    </>
  )
}
