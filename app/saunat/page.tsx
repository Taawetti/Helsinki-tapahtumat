// Saunat Helsingissä — yleisten saunojen referenssisivu.
//
// OMISTAJAN LINJAUS 26.8.2026: hakutuloksesta tuleva ei saa laskeutua karuun
// erillissivuun vaan SAMAAN näkymään jonka etusivun opasvalikko avaa, ja hänen
// on voitava jatkaa sovelluksen käyttöä normaalisti (yläpalkki, päivävalitsimet,
// Switch-valikko). Sama "linja pysyy" -periaate kuin 24.8., jolloin oppaat
// siirrettiin etusivun sisään.
//
// DATA HAETAAN YHÄ TÄÄLLÄ PALVELIMELLA. Sovelluksen opasnäkymä hakee listan
// normaalisti vasta selaimessa; jos tämä sivu tekisi samoin, Googlelle lähtevä
// HTML olisi tyhjä kuori ja sivun hakukonearvo katoaisi (mitattu ennen
// muutosta: 41 saunaa ja 48 nimiesiintymää palvelimen HTML:ssä). Siksi data
// haetaan tässä ja SYÖTETÄÄN valmiina sovellukselle.
//
// Alkuperäinen linjaus:
// saunat ovat se osa tekemistä-dataa, jolle EI ole hyvää yhtä paikkaa
// netissä — aukiolot, hinnat, arvosanat, uudet saunat ja saunauutiset
// yhdessä. Sama vertikaalisivujen sarja kuin /terassit ja /yokerhot;
// talvella tämä on sovelluksen relevantein sivu siinä missä Terassit
// kesällä.
//
// Data: OSM-saunat /api/activities-putkesta (jaettu välimuisti), Google-
// kortit data/sauna-cards.json (viikkorikastus), uutuudet activity-reasons-
// tiedoston newPlaces-osiosta ja uutiset tunneittain uutisputkesta.

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'
import { buildSaunaRows } from '@/lib/guide-data'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Yleiset saunat Helsingissä: aukiolot, hinnat, arvosanat ja uudet saunat — Löyly, Kotiharju, Sompasauna, Uusi Sauna ja koko kaupungin saunakartta yhdessä paikassa.'

const OG_TITLE = "Saunat Helsinki — yleiset saunat, aukiolot & uudet saunat"

export const metadata: Metadata = {
  title: 'Saunat Helsinki — yleiset saunat, aukiolot & uudet saunat',
  description: DESC,
  // Kielipari: englanninkielinen vastine on /en/saunas. Vastavuoroisuus on
  // hreflangin ehto — Google jättää yksipuolisen parin huomiotta.
  alternates: {
    canonical: `${BASE}/saunat`,
    languages: { fi: `${BASE}/saunat`, en: `${BASE}/en/saunas`, 'x-default': `${BASE}/saunat` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }], title: '🧖 Saunat Helsingissä', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/saunat` },
}

export default async function SaunatSivu() {
  // Datakompositio jaettu lib/guide-data.ts:ään — sama data etusivun
  // in-app-oppaassa (/api/guides/saunat) ja tässä SEO-sivussa.
  const saunas = await buildSaunaRows()

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Yleiset saunat Helsingissä',
    url: `${BASE}/saunat`,
    numberOfItems: saunas.length,
    itemListElement: saunas.slice(0, 20).map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'LocalBusiness',
        name: s.name,
        ...(s.address ? { address: { '@type': 'PostalAddress', streetAddress: s.address, addressLocality: 'Helsinki', addressCountry: 'FI' } } : {}),
        ...(s.lat && s.lon ? { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lon } } : {}),
        ...(s.www ? { url: /^https?:\/\//i.test(s.www) ? s.www : `https://${s.www}` } : {}),
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Saunat', item: `${BASE}/saunat` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="saunat" initialGuideData={{ saunas }} />

      {/* Sivun oma kuvausteksti ja lähdeseloste. Nämä ovat hakukoneelle
          merkityksellistä sisältöä (sivun lupaus omin sanoin), joten ne
          säilytettiin kehyksen vaihtuessa — ne siirtyivät listan alle.
          H1 on ruudunlukijoille ja Googlelle; sovellusnäkymässä on jo oma
          otsikkorivinsä, joten kahta näkyvää otsikkoa ei haluta. */}
      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Saunat Helsingissä — {saunas.length} yleistä saunaa</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          Lähteet: OpenStreetMap (saunat, aukiolot), Google (kuvat ja arvosanat)
          ja suomalaiset uutislähteet. Aukiolot voivat muuttua — tarkista
          saunan omalta sivulta ennen lähtöä. Puuttuuko sauna? Se lisätään
          OpenStreetMapiin, josta sivu päivittyy itsestään.
        </p>
      </section>
    </>
  )
}
