// Jam sessions & open mic — englanninkielinen vastine sivulle /jamit.
//
// MIKSI. Mitattu DataForSEOsta 26.8.2026: englanninkieliset Helsinki-haut ovat
// 19 000/kk matalalla kilpailulla, ja "live music helsinki" / "open mic
// helsinki" osuvat suoraan tähän oppaaseen. Jamit ovat lisäksi se sisältö
// jonka juuri saapunut vaihto-opiskelija tai turisti hakee englanniksi —
// avoimelle lavalle pääsee ilman että osaa suomea.
//
// Data jaetaan suomenkielisen sivun kanssa (fetchJamitEvents lib/guide-data.ts)
// — sama välimuisti, ei kaksinkertaista kuormaa LinkedEventsille.
//
// TIEDOSSA OLEVA RAJOITE: tapahtumien omat otsikot tulevat LinkedEventsistä
// järjestäjän kielellä, usein suomeksi. Niitä ei käännetä täällä — arvaus
// olisi väärää tietoa. Lähdemaininta kertoo tämän lukijalle suoraan.
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
  'Jam sessions, open mic nights and open stages in Helsinki — the live music you can actually take part in. Where to play, sing or step on stage over the next month.'

const OG_TITLE = "Jam sessions & open mic nights in Helsinki — live music calendar"

export const metadata: Metadata = {
  title: 'Jam sessions & open mic nights in Helsinki — live music calendar',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/jam-sessions`,
    languages: { fi: `${BASE}/jamit`, en: `${BASE}/en/jam-sessions`, 'x-default': `${BASE}/jamit` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '🎤 Jam sessions & open mic in Helsinki',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/jam-sessions`,
  },
}

export default async function EnJamSessionsPage() {
  const data = await buildGuidePayload('jamit', BASE)
  const events = data.events ?? []

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Jam sessions and open mic nights in Helsinki',
    url: `${BASE}/en/jam-sessions`,
    numberOfItems: events.length,
    inLanguage: 'en-GB',
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

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'Jam sessions & open mic', item: `${BASE}/en/jam-sessions` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="jamit" initialGuideData={{ events }} />

      {/* Sivun oma kuvausteksti ja lähdeseloste — hakukoneelle merkityksellistä
          sisältöä. H1 on ruudunlukijoille ja Googlelle; sovellusnäkymässä on jo
          oma otsikkorivinsä, joten kahta näkyvää otsikkoa ei haluta. */}
      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Jam sessions & open mic in Helsinki — {events.length} open stages</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          {'Source: Helsinki LinkedEvents. Bar-run jam nights don\'t always reach the city calendars — tell the organiser they can list the night in this app too. Event titles come straight from the organisers, so some of them are in Finnish.'}
        </p>
      </section>
    </>
  )
}
