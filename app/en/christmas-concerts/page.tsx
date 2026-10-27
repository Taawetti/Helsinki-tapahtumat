// Christmas concerts in Helsinki — English counterpart of /joulukonsertit.
// Same data (fetchJoulukonsertit in lib/guide-data), same app view; the
// language comes from the /en path (LanguageGate). Event titles are the
// organisers' own and often in Finnish — they are not translated here.

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'
import { buildGuidePayload, haeTaiBuildissaTyhja } from '@/lib/guide-data'
import { jsonLdHtml } from '@/lib/json-ld'
import { hasOwnEventPage } from '@/lib/event-links'
import { omaOrigin } from '@/lib/origin'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC =
  'Christmas concerts in Helsinki 2026: carols, choirs and concerts in churches and halls — dates, venues and tickets in one list.'

const OG_TITLE = 'Christmas concerts in Helsinki 2026 — carols, choirs and concerts'

export const metadata: Metadata = {
  title: 'Christmas concerts in Helsinki 2026 — carols, choirs and concerts',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/christmas-concerts`,
    languages: { fi: `${BASE}/joulukonsertit`, en: `${BASE}/en/christmas-concerts`, 'x-default': `${BASE}/joulukonsertit` },
  },
  openGraph: {
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '🎄 Christmas concerts in Helsinki', description: DESC, locale: 'en_GB', alternateLocale: ['fi_FI'], type: 'website', url: `${BASE}/en/christmas-concerts`,
  },
}

export default async function EnChristmasConcertsPage() {
  const data = await haeTaiBuildissaTyhja(() => buildGuidePayload('joulukonsertit', omaOrigin()), {})
  const events = data.events ?? []

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Christmas concerts in Helsinki',
    url: `${BASE}/en/christmas-concerts`,
    numberOfItems: events.length,
    inLanguage: 'en-GB',
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
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'Christmas concerts', item: `${BASE}/en/christmas-concerts` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />

      <HomeShell initialGuide="joulukonsertit" initialGuideData={{ events }} />

      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Christmas concerts in Helsinki 2026 — {events.length} concerts</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          {'Sources: the City of Helsinki event calendar, ticket vendors and organisers’ own listings. Updated hourly through December. Event titles come straight from the organisers, so some of them are in Finnish.'}
        </p>
      </section>
    </>
  )
}
