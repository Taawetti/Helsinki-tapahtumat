// Jamit & open mic — omistajan valitsema opas: missä pääsee soittamaan tai
// lavalle Helsingissä. Tapahtumat LinkedEventsistä samalla kuviolla kuin
// /terassit (mitattu: kuukauden ikkunassa ~20 jamia/open miciä, kaikki
// LinkedEventsissä).

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'
import { buildGuidePayload } from '@/lib/guide-data'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Jamit, open mic -illat ja open stage -lavat Helsingissä — missä pääsee soittamaan, laulamaan tai lavalle seuraavan kuukauden aikana.'

const OG_TITLE = "Jamit & open mic Helsinki — avoimet lavat ja jamisessiot"

export const metadata: Metadata = {
  title: 'Jamit & open mic Helsinki — avoimet lavat ja jamisessiot',
  description: DESC,
  alternates: {
    canonical: `${BASE}/jamit`,
    languages: { fi: `${BASE}/jamit`, en: `${BASE}/en/jam-sessions`, 'x-default': `${BASE}/jamit` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }], title: '🎤 Jamit & open mic', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/jamit` },
}

// OMISTAJAN LINJAUS 26.8.2026: hakutuloksesta tuleva laskeutuu SAMAAN
// näkymään jonka etusivun opasvalikko avaa. Data haetaan yhä palvelimella,
// jotta Googlelle lähtevässä HTML:ssä on lista eikä tyhjä kuori (mitattu ennen
// muutosta: 11 tapahtuman nimeä). Tekstihaku + JAMIT_REGEX guide-datassa.

export default async function JamitSivu() {
  // Sama paketti jonka sovelluksen opas saa (/api/guides/jamit).
  const data = await buildGuidePayload('jamit', BASE)
  const events = data.events ?? []

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Jamit ja open mic -illat Helsingissä',
    url: `${BASE}/jamit`,
    numberOfItems: events.length,
    itemListElement: events.slice(0, 15).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: e.title,
        startDate: e.startTime,
        eventStatus: 'https://schema.org/EventScheduled',
        location: { '@type': 'Place', name: e.venue || 'Helsinki', address: { '@type': 'PostalAddress', addressLocality: 'Helsinki', addressCountry: 'FI' } },
        ...(e.isFree ? { isAccessibleForFree: true } : {}),
        url: `${BASE}/e/${encodeURIComponent(e.id)}`,
      },
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="jamit" initialGuideData={{ events }} />

      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Jamit ja open mic Helsingissä — {events.length} tapahtumaa</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          Lähde: LinkedEvents-rajapinta, ikkuna seuraava kuukausi. Jamit ovat
          usein toistuvia iltoja joita ei aina ilmoiteta erikseen — tarkista
          paikan omalta sivulta ennen lähtöä.
        </p>
      </section>
    </>
  )
}
