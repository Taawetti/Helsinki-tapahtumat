// Pubivisat Helsingissä — viikon tietovisojen referenssisivu.
//
// OMISTAJAN LINJAUS 26.8.2026: hakutuloksesta tuleva ei saa laskeutua karuun
// erillissivuun vaan SAMAAN näkymään jonka etusivun opasvalikko avaa, ja hänen
// on voitava jatkaa sovelluksen käyttöä normaalisti. Sama kuvio kuin /saunat.
//
// DATA HAETAAN YHÄ TÄÄLLÄ PALVELIMELLA, jotta Googlelle lähtevässä HTML:ssä on
// lista eikä tyhjä kuori. Mitattu ennen muutosta: 91 baarin nimeä HTML:ssä.

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'
import { buildGuidePayload } from '@/lib/guide-data'
import { WEEKDAY_FI } from '@/lib/pubivisat'

export const revalidate = 86400 // aikataulu muuttuu harvoin

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC = 'Pubivisat Helsingissä viikon jokaisena päivänä: tietovisojen aikataulut ja baarit maanantaista sunnuntaihin — löydä lähin visa ja kerää joukkue kasaan.'

const OG_TITLE = "Pubivisat Helsinki — viikon tietovisat baareissa"

export const metadata: Metadata = {
  title: 'Pubivisat Helsinki — viikon tietovisat baareissa',
  description: DESC,
  alternates: {
    canonical: `${BASE}/pubivisat`,
    languages: { fi: `${BASE}/pubivisat`, en: `${BASE}/en/pub-quizzes`, 'x-default': `${BASE}/pubivisat` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }], title: '🧠 Pubivisat Helsinki', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/pubivisat` },
}

export default async function PubivisatSivu() {
  // Sama paketti jonka sovelluksen opas saa (/api/guides/pubivisat).
  const data = await buildGuidePayload('pubivisat', BASE)
  const visas = data.visas ?? []

  // Ryhmittely ma..su (JS-viikonpäivä 1..6, 0) FAQ-rakennedataa varten.
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
  const byDay = weekdayOrder
    .map((wd) => ({
      weekday: wd,
      label: WEEKDAY_FI[wd],
      visas: visas
        .filter((v) => v.weekday === wd)
        .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)),
    }))
    .filter((g) => g.visas.length > 0)

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Pubivisat Helsingissä',
    url: `${BASE}/pubivisat`,
    numberOfItems: visas.length,
    itemListElement: visas.slice(0, 20).map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: `Tietovisa – ${v.name}`,
        startDate: v.nextISO,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        location: {
          '@type': 'BarOrPub',
          name: v.name,
          address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
        },
      },
    })),
  }

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: byDay.slice(0, 4).map((g) => ({
      '@type': 'Question',
      name: `Missä on pubivisa ${g.label.toLowerCase()}na Helsingissä?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: g.visas.slice(0, 6).map((v) => `${v.name} klo ${String(v.hour).padStart(2, '0')}.${String(v.minute).padStart(2, '0')}`).join(', '),
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Pubivisat', item: `${BASE}/pubivisat` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="pubivisat" initialGuideData={{ visas }} />

      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Pubivisat Helsingissä — {visas.length} tietovisaa viikossa</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          Aikataulut voivat muuttua ja kesätauot ovat yleisiä — tarkista
          baarin omalta sivulta ennen lähtöä.
        </p>
      </section>
    </>
  )
}
