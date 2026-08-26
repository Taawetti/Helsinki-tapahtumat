// Free events in Helsinki — englanninkielinen vastine sivulle /tapahtumat/ilmaiset.
//
// MIKSI. Mitattu DataForSEOsta 26.8.2026: englanninkielisiä Helsinki-hakuja on
// 19 000/kk matalalla kilpailulla, ja "free things to do helsinki" on turistin
// tyypillisin kysymys ensimmäisenä päivänä. Maksuton ohjelma oli tähän asti
// vain suomeksi eli näkymätön näille hakijoille.
//
// MIKSI HAKU ON KOPIOITU EIKÄ JAETTU LIBIIN. Suomenkielinen sivu hakee datan
// itse (fetchFree sen omassa tiedostossa), eikä sitä saa tässä työssä
// refaktoroida. URLit ja välimuistiasetukset ovat TÄSMÄLLEEN samat kuin
// suomenkielisellä sivulla, joten Nextin Data Cache jakaa vastaukset näiden
// kahden reitin kesken — LinkedEventsille ei tule yhtään lisäkutsua.
//
// TAPAHTUMIEN NIMET tulevat lähteestä. Jos järjestäjä on antanut nimen myös
// englanniksi (name.en), käytetään sitä; muuten näytetään suomenkielinen nimi
// sellaisenaan. Konekäännöstä ei tehdä.

import type { Metadata } from 'next'
import Link from 'next/link'
import EnGuidePage from '@/components/EnGuidePage'
import HomeShell from '@/components/HomeShell'
import { helsinkiDateOf } from '@/lib/helsinki-time'

// Sama ISR-ikkuna kuin suomenkielisellä sivulla — sivu pysyy staattisena.
export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Free events in Helsinki this week: free concerts, exhibitions, park and market events and family days — all the free things to do in the city in one list, updated daily.'

const OG_TITLE = "Free events in Helsinki — free things to do this week"

export const metadata: Metadata = {
  title: 'Free events in Helsinki — free things to do this week',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/free-events`,
    languages: {
      fi: `${BASE}/tapahtumat/ilmaiset`,
      en: `${BASE}/en/free-events`,
      'x-default': `${BASE}/tapahtumat/ilmaiset`,
    },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '🆓 Free events in Helsinki',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/free-events`,
  },
}

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  start_time: string
  images?: { url: string }[]
  location?: { name?: { fi?: string; en?: string }; street_address?: { fi?: string; en?: string } }
  offers?: { is_free: boolean; price?: { fi?: string }; info_url?: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

interface PageEvent {
  id: string; title: string; startTime: string; venue: string; image: string | null
}

function normalize(raw: LEEvent): PageEvent | null {
  const offer = raw.offers?.[0]
  if (!offer?.is_free) return null
  return {
    id: raw.id,
    // Järjestäjän oma englanninkielinen nimi ensin, sitten suomi.
    title: raw.name?.en || raw.name?.fi || raw.name?.sv || 'Event',
    startTime: raw.start_time,
    venue: raw.location?.name?.en || raw.location?.name?.fi || '',
    image: raw.images?.[0]?.url || null,
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki',
  })
}

async function fetchFree(): Promise<PageEvent[]> {
  const now = new Date()
  const helsinkiNow = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const today = helsinkiNow.toISOString().slice(0, 10)
  // 7-day window fetched DAY BY DAY (one descending page per day): LinkedEvents
  // `start=` also matches months-old ongoing free exhibitions, which no single
  // multi-day query can avoid from the right end — free events alone start
  // ~30/day, so a shared page cap would drop either the near or far days.
  // Within one day the real starts sort newest-first, junk sinks below.
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(helsinkiNow.getTime() + i * 86400000).toISOString().slice(0, 10)
  )

  try {
    const results = await Promise.allSettled(days.map((d) =>
      fetch(
        `https://api.hel.fi/linkedevents/v1/event/?format=json&start=${d}&end=${d}&division=helsinki&language=fi&page_size=100&sort=-start_time&include=location&is_free=true`,
        { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) }
      )
    ))
    const events: PageEvent[] = []
    const seen = new Set<string>()
    const lastDay = days[days.length - 1]
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value.ok) continue
      const data = await r.value.json()
      for (const raw of data.data || []) {
        if (seen.has(raw.id)) continue
        seen.add(raw.id)
        const e = normalize(raw)
        if (!e) continue
        const d = helsinkiDateOf(e.startTime)
        if (d >= today && d <= lastDay) events.push(e)
      }
    }
    return events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  } catch {
    return []
  }
}

export default async function EnFreeEventsPage() {
  const events = await fetchFree()

  const eventListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Free events in Helsinki',
    url: `${BASE}/en/free-events`,
    numberOfItems: events.length,
    inLanguage: 'en-GB',
    itemListElement: events.slice(0, 20).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: e.title,
        startDate: e.startTime,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        eventStatus: 'https://schema.org/EventScheduled',
        location: { '@type': 'Place', name: e.venue || 'Helsinki', address: { '@type': 'PostalAddress', addressLocality: 'Helsinki', addressCountry: 'FI' } },
        url: `${BASE}/e/${encodeURIComponent(e.id)}`,
      },
    })),
  }

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'en-GB',
    mainEntity: [
      { '@type': 'Question', name: 'What are the best free things to do in Helsinki?', acceptedAnswer: { '@type': 'Answer', text: `There are ${events.length} free events in Helsinki over the next seven days, from free concerts and park events to museum visits and cultural happenings. This page lists them all.` } },
      { '@type': 'Question', name: 'Are museums free in Helsinki?', acceptedAnswer: { '@type': 'Answer', text: 'Many Helsinki museums are free for under-18s all year round, and most also run regular free-entry days. Current dates are listed on this page.' } },
      { '@type': 'Question', name: 'Where are free outdoor events held in Helsinki?', acceptedAnswer: { '@type': 'Answer', text: 'Esplanade Park, the Market Square, Kallio Block Party, Hernesaari and neighbourhood festivals all put on free programmes. In summer Senate Square and Töölönlahti are busy event spaces too.' } },
    ],
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'Free events', item: `${BASE}/en/free-events` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {/* Sovellusnäkymä valmiiksi tämän sivun suodattimella — sama tila kuin
          jos käyttäjä säätäisi sen itse etusivulla. Sivun oma sisältö jää
          alle: se on tämän sivun hakukonearvo. */}
      <HomeShell initialDateFilter="week" initialPriceFilter="free" />

      <EnGuidePage
        asSection
        emoji="🆓"
        title="Free events in Helsinki"
        crumb="Free events"
        stat={`Next 7 days · ${events.length} free events`}
        intro={DESC}
        seeAlso={[
          { href: '/en/free-museums', label: '🏛 Free museums' },
          { href: '/en/pub-quizzes', label: '🧠 Pub quizzes' },
          { href: '/en', label: '🎉 Events today' },
        ]}
        sources="Source: the City of Helsinki Linked Events API, which collects listings from the city, its libraries, museums and culture houses. Only events the organiser has marked free are shown. Event names come from the organisers, so some appear in Finnish only. Times can change — check the organiser's own page before you set off."
      >
        <div className="text-sm text-white/40 leading-relaxed space-y-3 mb-8">
          <p>
            Helsinki puts on <strong className="text-white/60">free events</strong> all year round.
            Parks, market squares, libraries and neighbourhood culture houses run programmes you can
            walk into without a ticket, whatever the season.
          </p>
          <p>
            In summer, Esplanade Park, the Market Square and Hernesaari fill up with free concerts
            and street events. Malmitalo, Vuotalo and the other neighbourhood culture houses keep
            going through the dark months, and most museums are free for under-18s and hold regular
            free-entry days.
          </p>
          <p>
            Below is every free event coming up in the next seven days, updated automatically —
            concerts and exhibitions through to library talks and pub quizzes.
          </p>
        </div>

        {events.length === 0 ? (
          <p className="text-white/40 text-center py-16">No free events found right now.</p>
        ) : (
          <ul className="space-y-2">
            {events.map(e => (
              <li key={e.id}>
                <Link href={`/e/${encodeURIComponent(e.id)}`}
                  className="flex items-start gap-3 rounded-xl p-4 transition-colors group"
                  style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                  {e.image && <img src={e.image} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug">
                      {e.title}
                    </h2>
                    <p className="text-sm text-white/50 mt-0.5">
                      {formatDate(e.startTime)}
                      {e.venue && <span className="text-white/35"> · {e.venue}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 self-center text-green-400 text-xs font-medium">Free</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </EnGuidePage>
    </>
  )
}
