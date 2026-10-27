// Joulukonsertit Helsingissä — kausiopas (omistaja 27.10.2026). Kokoaa syötteen
// joulukonsertit marras-joulukuulta ja nostaa kärkinostot (data/nostot.json)
// ensimmäisiksi. Sama kuvio kuin /jamit: data palvelimella, jotta Googlelle
// lähtevässä HTML:ssä on lista; sovellusnäkymä avautuu opas valmiiksi auki.

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'
import { buildGuidePayload, haeTaiBuildissaTyhja } from '@/lib/guide-data'
import { jsonLdHtml } from '@/lib/json-ld'
import { hasOwnEventPage } from '@/lib/event-links'
import { omaOrigin } from '@/lib/origin'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC =
  'Joulukonsertit Helsingissä 2026: joululaulut, kuorot ja konsertit kirkoissa ja saleissa — päivämäärät, paikat ja liput yhdessä listassa.'

const OG_TITLE = 'Joulukonsertit Helsinki 2026 — joululaulut, kuorot ja konsertit'

export const metadata: Metadata = {
  title: 'Joulukonsertit Helsinki 2026 — joululaulut, kuorot ja konsertit',
  description: DESC,
  alternates: {
    canonical: `${BASE}/joulukonsertit`,
    languages: { fi: `${BASE}/joulukonsertit`, en: `${BASE}/en/christmas-concerts`, 'x-default': `${BASE}/joulukonsertit` },
  },
  openGraph: {
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '🎄 Joulukonsertit Helsingissä', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/joulukonsertit`,
  },
}

export default async function JoulukonsertitSivu() {
  const data = await haeTaiBuildissaTyhja(() => buildGuidePayload('joulukonsertit', omaOrigin()), {})
  const events = data.events ?? []

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Joulukonsertit Helsingissä',
    url: `${BASE}/joulukonsertit`,
    numberOfItems: events.length,
    itemListElement: events.slice(0, 20).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: e.title,
        startDate: e.startTime,
        eventStatus: 'https://schema.org/EventScheduled',
        location: { '@type': 'Place', name: e.venue || 'Helsinki', address: { '@type': 'PostalAddress', addressLocality: 'Helsinki', addressCountry: 'FI' } },
        ...(e.image ? { image: e.image } : {}),
        ...(e.isFree ? { isAccessibleForFree: true } : {}),
        ...(e.ticketUrl ? { offers: { '@type': 'Offer', url: e.ticketUrl, availability: 'https://schema.org/InStock' } } : {}),
        // Oma sivu vain tunnisteille, jotka /e/[id] ratkaisee; skrapatun lähteen
        // tapahtumalle lippukauppa (sama kuvio kuin /ohjelma) — ei 404-osoitetta.
        ...(hasOwnEventPage(e) ? { url: `${BASE}/e/${encodeURIComponent(e.id)}` } : e.ticketUrl ? { url: e.ticketUrl } : {}),
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Joulukonsertit', item: `${BASE}/joulukonsertit` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />

      <HomeShell initialGuide="joulukonsertit" initialGuideData={{ events }} />

      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Joulukonsertit Helsingissä 2026 — {events.length} konserttia</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          Lähteet: Helsingin kaupungin tapahtumakalenteri, lipunmyyjät ja
          järjestäjien omat ilmoitukset. Lista päivittyy tunneittain marras-
          joulukuun ajan. Puuttuuko konsertti? Ilmoita se sovelluksen
          Lisää tapahtuma -lomakkeella.
        </p>
      </section>
    </>
  )
}
