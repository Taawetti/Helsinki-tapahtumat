// Terassit Helsingissä — kattoterassien ja terassitapahtumien referenssisivu.
//
// OMISTAJAN LINJAUS 26.8.2026: hakutuloksesta tuleva ei saa laskeutua karuun
// erillissivuun vaan SAMAAN näkymään jonka etusivun opasvalikko avaa, ja hänen
// on voitava jatkaa sovelluksen käyttöä normaalisti (yläpalkki, päivävalitsimet,
// Switch-valikko). Sama kuvio kuin /saunat, joka tehtiin koekappaleena.
//
// DATA HAETAAN YHÄ TÄÄLLÄ PALVELIMELLA. Sovelluksen opasnäkymä hakee listan
// vasta selaimessa; jos tämä sivu tekisi samoin, Googlelle lähtevä HTML olisi
// tyhjä kuori ja sivun hakukonearvo katoaisi. Mitattu ennen muutosta:
// 13 nimeä palvelimen HTML:ssä (5 kattoterassia + 8 tapahtumaa).
//
// Data: kattoterassit lib/helsinki-nightclubs.ts:stä ravintoladatalla
// rikastettuna (kuva + arvosana), tapahtumat LinkedEventsistä terassisuotimella.

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'
import { buildGuidePayload } from '@/lib/guide-data'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC = 'Terassit Helsingissä: kattoterassit, rooftop-baarit ja terassitapahtumat kesäkaudella — ohjelma, osoitteet ja aurinkoisimmat paikat yhdessä näkymässä.'

const OG_TITLE = "Terassit Helsinki — kattoterassit & terassitapahtumat"

export const metadata: Metadata = {
  title: 'Terassit Helsinki — kattoterassit & terassitapahtumat',
  description: DESC,
  alternates: {
    canonical: `${BASE}/terassit`,
    languages: { fi: `${BASE}/terassit`, en: `${BASE}/en/terraces`, 'x-default': `${BASE}/terassit` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }], title: '☀️ Terassit Helsinki', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/terassit` },
}

export default async function TerassitSivu() {
  // Sama paketti jonka sovelluksen opas saa (/api/guides/terassit) — yhteinen
  // buildGuidePayload takaa, ettei hakukoneen ja sovelluksen näkemä data eroa.
  const data = await buildGuidePayload('terassit', BASE)
  const rooftops = data.rooftops ?? []
  const events = data.events ?? []

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Terassit ja terassitapahtumat Helsingissä',
    url: `${BASE}/terassit`,
    numberOfItems: events.length + rooftops.length,
    itemListElement: [
      ...rooftops.map((v, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'BarOrPub',
          name: v.name,
          ...(v.address ? { address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: 'Helsinki', addressCountry: 'FI' } } : {}),
          ...(v.lat && v.lon ? { geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lon } } : {}),
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
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Terassit', item: `${BASE}/terassit` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="terassit" initialGuideData={{ rooftops, events }} />

      {/* Sivun oma kuvausteksti ja lähdeseloste — hakukoneelle merkityksellistä
          sisältöä (sivun lupaus omin sanoin), joten se säilytettiin kehyksen
          vaihtuessa. H1 on ruudunlukijoille ja Googlelle; sovellusnäkymässä on
          jo oma otsikkorivinsä, joten kahta näkyvää otsikkoa ei haluta. */}
      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Terassit Helsingissä — {rooftops.length} kattoterassia</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          Lähteet: kattoterassit kaupungin baari- ja yökerhotiedoista, kuvat ja
          arvosanat Googlesta, tapahtumat LinkedEvents-rajapinnasta.
          Terassikausi on kesä–elokuussa — aukiolot riippuvat säästä, joten
          tarkista paikan omalta sivulta ennen lähtöä.
        </p>
      </section>
    </>
  )
}
