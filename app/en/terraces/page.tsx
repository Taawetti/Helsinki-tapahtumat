// Helsinki terraces & rooftop bars — englanninkielinen vastine sivulle /terassit.
//
// MIKSI. Mitattu DataForSEOsta 26.8.2026: englanninkielisiä Helsinki-hakuja on
// 19 000/kk matalalla kilpailulla, ja terassi/rooftop-haut ("rooftop bar
// helsinki", "helsinki terraces", "summer terrace helsinki") osuvat suoraan
// turistiin, joka on kaupungissa juuri nyt. Sivu oli olemassa vain suomeksi
// eli näkymätön näille hakijoille.
//
// Kattoterassit ovat paikkojen nimiä ja osoitteita, joten ne toimivat
// englanniksi sellaisenaan. Tapahtumien otsikot tulevat LinkedEventsistä
// suomeksi — tiedossa oleva rajoite, ei käännetä tässä.
//
// Data jaetaan suomenkielisen sivun kanssa (fetchTerraceEvents +
// HELSINKI_NIGHTCLUBS) — sama välimuisti, ei kaksinkertaista kuormaa.
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
  'Rooftop bars and summer terraces in Helsinki: where to drink above the city, plus every terrace and open-air event over the next two weeks — addresses, times and prices.'

const OG_TITLE = "Helsinki terraces — rooftop bars & summer terrace events"

export const metadata: Metadata = {
  title: 'Helsinki terraces — rooftop bars & summer terrace events',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/terraces`,
    languages: { fi: `${BASE}/terassit`, en: `${BASE}/en/terraces`, 'x-default': `${BASE}/terassit` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '☀️ Helsinki terraces & rooftop bars',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/terraces`,
  },
}

export default async function EnTerracesPage() {
  const data = await buildGuidePayload('terassit', BASE)
  const rooftops = data.rooftops ?? []
  const events = data.events ?? []

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Terraces and rooftop bars in Helsinki',
    url: `${BASE}/en/terraces`,
    numberOfItems: events.length + rooftops.length,
    inLanguage: 'en-GB',
    itemListElement: [
      ...rooftops.map((v, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'BarOrPub',
          name: v.name,
          address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
          geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lon },
          ...(v.www ? { url: v.www } : {}),
        },
      })),
      ...events.slice(0, 10).map((e, i) => ({
        '@type': 'ListItem',
        position: rooftops.length + i + 1,
        item: {
          '@type': 'Event',
          name: e.title,
          startDate: e.startTime,
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          location: { '@type': 'Place', name: e.venue || 'Helsinki', address: { '@type': 'PostalAddress', addressLocality: 'Helsinki', addressCountry: 'FI' } },
          ...(e.isFree ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } } : {}),
          url: `${BASE}/e/${encodeURIComponent(e.id)}`,
        },
      })),
    ],
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'Terraces', item: `${BASE}/en/terraces` },
    ],
  }

  // Luvut lasketaan datasta, ei kirjoiteta käsin.
  const stat =
    events.length > 0
      ? `${rooftops.length} rooftop bars · ${events.length} terrace events in the next two weeks`
      : `${rooftops.length} rooftop bars · terrace season peaks from June to August`

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="terassit" initialGuideData={{ rooftops, events }} />

      {/* Sivun oma kuvausteksti ja lähdeseloste — hakukoneelle merkityksellistä
          sisältöä. H1 on ruudunlukijoille ja Googlelle; sovellusnäkymässä on jo
          oma otsikkorivinsä, joten kahta näkyvää otsikkoa ei haluta. */}
      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Helsinki terraces & rooftop bars — {rooftops.length} rooftops</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          {'Sources: Helsinki Linked Events for the events, and a hand-picked rooftop list (MyHelsinki, Resident Advisor, venue sites). Event titles come from the organisers, so some are in Finnish only. Terrace opening depends on the weather — check the venue\'s own site before you head out.'}
        </p>
      </section>
    </>
  )
}
