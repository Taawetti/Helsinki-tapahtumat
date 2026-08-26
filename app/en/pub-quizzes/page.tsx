// Pub quizzes in Helsinki — englanninkielinen vastine sivulle /pubivisat.
//
// MIKSI TÄMÄ SIVU. Pubivisa on poikkeuksellisen englantipainotteinen aihe:
// visaa etsivä turisti tai expat hakee "pub quiz helsinki" / "trivia night
// helsinki", eikä sanaa "pubivisat" osaa kirjoittaa kukaan muu kuin suomalainen.
// Sisältö on baarien nimiä, osoitteita ja kellonaikoja, joten se toimii
// englanniksi sellaisenaan — toisin kuin tapahtumapohjaisilla sivuilla, joiden
// otsikot tulevat lähteistä suomeksi.
//
// Data jaetaan suomenkielisen sivun kanssa (lib/pubivisat.ts, fetchVisas) —
// sama välimuisti, ei kaksinkertaista kuormaa pubivisat.fi:lle.
//
// OMISTAJAN LINJAUS 26.8.2026: hakutuloksesta tuleva laskeutuu SAMAAN
// sovellusnäkymään jonka etusivun opasvalikko avaa, ei erilliseen kehykseen.
// Kieli tulee LanguageGatelta (/en-polku → 'en'), joten sovellus renderöityy
// englanniksi ilman erillistä lippua. Data haetaan yhä palvelimella, jotta
// Googlelle lähtevässä HTML:ssä on lista eikä tyhjä kuori.

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'
import { buildGuidePayload } from '@/lib/guide-data'

export const revalidate = 86400 // sama kuin /pubivisat — aikataulu muuttuu harvoin

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

// JS getDay() -indeksi → englanninkielinen viikonpäivä. Paikallinen taulukko,
// koska lib/pubivisat.ts:n WEEKDAY_FI on suomenkielisen näkymän oma.
const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Brittiläinen listauskonventio on 24 h kaksoispisteellä (20:00), kun
// suomenkielinen sivu käyttää pistettä (20.00). Sama muoto kuin lib/utils.ts:n
// formatTime(iso, 'en') antaa muualla englanninkielisessä käyttöliittymässä.
const hhmm = (hour: number, minute: number) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

const DESC =
  'Every pub quiz in Helsinki, day by day: trivia nights from Monday to Sunday with start times, bars and addresses — all free to enter, just bring a team.'

const OG_TITLE = "Pub quizzes in Helsinki — weekly trivia nights, bar by bar"

export const metadata: Metadata = {
  title: 'Pub quizzes in Helsinki — weekly trivia nights, bar by bar',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/pub-quizzes`,
    languages: { fi: `${BASE}/pubivisat`, en: `${BASE}/en/pub-quizzes`, 'x-default': `${BASE}/pubivisat` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '🧠 Pub quizzes in Helsinki',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/pub-quizzes`,
  },
}

export default async function EnPubQuizzesPage() {
  const data = await buildGuidePayload('pubivisat', BASE)
  const visas = data.visas ?? []

  // Group Mon..Sun (JS weekday 1..6, 0)
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
  const byDay = weekdayOrder
    .map((wd) => ({
      weekday: wd,
      label: WEEKDAY_EN[wd],
      visas: visas
        .filter((v) => v.weekday === wd)
        .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)),
    }))
    .filter((g) => g.visas.length > 0)

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Pub quizzes in Helsinki',
    url: `${BASE}/en/pub-quizzes`,
    numberOfItems: visas.length,
    inLanguage: 'en-GB',
    itemListElement: visas.slice(0, 20).map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: `Pub quiz – ${v.name}`,
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
    inLanguage: 'en-GB',
    mainEntity: byDay.slice(0, 4).map((g) => ({
      '@type': 'Question',
      name: `Where is there a pub quiz in Helsinki on ${g.label}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: g.visas.slice(0, 6).map((v) => `${v.name} at ${hhmm(v.hour, v.minute)}`).join(', '),
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'Pub quizzes', item: `${BASE}/en/pub-quizzes` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* Sovellusnäkymä, opas valmiiksi auki ja lista mukana palvelimelta. */}
      <HomeShell initialGuide="pubivisat" initialGuideData={{ visas }} />

      {/* Sivun oma kuvausteksti ja lähdeseloste — hakukoneelle merkityksellistä
          sisältöä. H1 on ruudunlukijoille ja Googlelle; sovellusnäkymässä on jo
          oma otsikkorivinsä, joten kahta näkyvää otsikkoa ei haluta. */}
      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Pub quizzes in Helsinki — {visas.length} weekly trivia nights</h1>
        <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
        <p className="mt-4 text-[11px] text-white/25 leading-relaxed">
          {'Source: pubivisat.fi, refreshed daily. Start times and venues change now and then — check the bar\'s own channels before you head out. Entry is free at every quiz listed here.'}
        </p>
      </section>
    </>
  )
}
