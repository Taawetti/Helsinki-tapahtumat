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

import type { Metadata } from 'next'
import EnGuidePage from '@/components/EnGuidePage'
import { fetchVisas, nextOccurrenceISO, PUBIVISAT_SOURCE_URL } from '@/lib/pubivisat'

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
  const visas = await fetchVisas()

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
        startDate: nextOccurrenceISO(v),
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
      <EnGuidePage
        emoji="🧠"
        title="Pub quizzes in Helsinki"
        crumb="Pub quizzes"
        stat={`${visas.length} weekly trivia nights in bars across the city`}
        intro={DESC}
        seeAlso={[
          { href: '/en/nightclubs', label: '🪩 Nightlife' },
          { href: '/en/jam-sessions', label: '🎤 Jam sessions' },
          { href: '/en', label: '🎉 Events today' },
        ]}
        sources={`Source: pubivisat.fi, refreshed daily. Start times and venues change now and then — check the bar's own channels before you head out. Entry is free at every quiz listed here.`}
      >
        {/* Weekly schedule */}
        {byDay.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">🧠</p>
            <p>The quiz listings could not be loaded right now.</p>
            <a href={PUBIVISAT_SOURCE_URL} target="_blank" rel="noopener noreferrer"
              className="mt-4 inline-block text-blue-400 hover:text-blue-300 text-sm">
              Check pubivisat.fi ↗
            </a>
          </div>
        ) : (
          <div className="space-y-8">
            {byDay.map((g) => (
              <section key={g.weekday}>
                <h2 className="text-lg font-bold mb-3 text-white">{g.label}</h2>
                <ul className="space-y-2">
                  {g.visas.map((v, i) => (
                    <li key={`${g.weekday}-${i}`}
                      className="flex items-center gap-3 bg-gray-900 rounded-xl p-4">
                      <span className="text-sm font-mono text-blue-300 flex-shrink-0 w-12">
                        {hhmm(v.hour, v.minute)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white leading-snug">{v.name}</h3>
                        <p className="text-sm text-gray-500 truncate">{v.address}</p>
                      </div>
                      <span className="text-green-400 text-xs font-medium flex-shrink-0">Free</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </EnGuidePage>
    </>
  )
}
