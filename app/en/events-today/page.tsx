// Helsinki events today — englanninkielinen vastine sivulle /tapahtumat/tanaan.
//
// MIKSI. Mitattu DataForSEOsta 26.8.2026: "helsinki events today" 590 hakua/kk
// ja "helsinki events" 2 400 hakua/kk, molemmat MATALALLA kilpailulla. Päivän
// tapahtumalista oli tähän asti vain suomeksi eli näkymätön näille hakijoille.
//
// DATA JAETAAN SUOMENKIELISEN SIVUN KANSSA. LinkedEvents-kysely rakennetaan
// TÄSMÄLLEEN samasta URL:sta ja samoista fetch-optioista kuin
// app/tapahtumat/tanaan/page.tsx, joten Next.js:n Data Cache tunnistaa sen
// samaksi hauksi eikä lähteeseen mene toista kuormaa. Jos suomenkielisen sivun
// kyselyä muutetaan, muuta tämä samalla — muuten välimuistiavaimet eroavat.
// (Suomenkielisen sivun fetchToday on tiedostokohtainen apuri eikä sitä voi
// viedä ulos: Next.js sallii page.tsx:stä vain sallitut vientinimet.)
//
// TAPAHTUMIEN NIMET. LinkedEvents tarjoaa name.en ja location.name.en silloin
// kun järjestäjä on ne antanut, joten englanninkielisellä sivulla luetaan ensin
// englanti ja vasta sen puuttuessa suomi. Tämä EI ole konekäännös vaan lähteen
// oma kenttä; osa otsikoista jää silti suomeksi, ja lähdemaininta kertoo sen.

import type { Metadata } from 'next'
import Link from 'next/link'
import EnGuidePage from '@/components/EnGuidePage'
import HomeShell from '@/components/HomeShell'
import { helsinkiDateOf, helsinkiToday } from '@/lib/helsinki-time'
import { fetchLinkedEventsAll, LE_MAX_PAGE_SIZE } from '@/lib/linked-events'

// Sama luku kuin suomenkielisellä sivulla — sivu pysyy staattisena (ISR).
export const revalidate = 900

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC =
  'Helsinki events today in one list: gigs, club nights, exhibitions, theatre and free events across the city — gathered automatically and refreshed through the day.'

const OG_TITLE = "Helsinki events today — gigs, exhibitions & what’s on tonight"

export const metadata: Metadata = {
  title: 'Helsinki events today — gigs, exhibitions & what’s on tonight',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/events-today`,
    languages: {
      fi: `${BASE}/tapahtumat/tanaan`,
      en: `${BASE}/en/events-today`,
      'x-default': `${BASE}/tapahtumat/tanaan`,
    },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '📅 Helsinki events today',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/events-today`,
  },
}

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  start_time: string
  images?: { url: string }[]
  location?: {
    name?: { fi?: string; en?: string }
    street_address?: { fi?: string; en?: string }
  }
  offers?: { is_free: boolean; price?: { fi?: string; en?: string }; info_url?: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

interface PageEvent {
  id: string; title: string; startTime: string; venue: string
  isFree: boolean; price: string | null; image: string | null; ticketUrl: string | null
}

function normalize(raw: LEEvent): PageEvent {
  const offer = raw.offers?.[0]
  return {
    id: raw.id,
    // Englanti ensin — suomenkielinen sivu lukee saman kentän toisin päin.
    title: raw.name?.en || raw.name?.fi || raw.name?.sv || 'Event',
    startTime: raw.start_time,
    venue: raw.location?.name?.en || raw.location?.name?.fi || '',
    isFree: offer?.is_free ?? false,
    price: offer?.is_free ? null : (offer?.price?.en || offer?.price?.fi || null),
    image: raw.images?.[0]?.url || null,
    ticketUrl: offer?.info_url?.en || offer?.info_url?.fi || raw.info_url?.en || raw.info_url?.fi || null,
  }
}

// Oma muotoilija eikä lib/utils.ts:n formatTime: siinä ei ole timeZone-optiota,
// joten UTC-palvelimella (Vercel) se näyttäisi kellonajat 2–3 h väärin.
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' })
}

async function fetchToday(): Promise<PageEvent[]> {
  const today = helsinkiToday()

  try {
    // URL ja fetch-optiot ovat merkki merkiltä samat kuin
    // app/tapahtumat/tanaan/page.tsx:ssä — ks. tiedoston alun selitys.
    const { rows } = await fetchLinkedEventsAll<LEEvent>(
      (page) =>
        `https://api.hel.fi/linkedevents/v1/event/?${new URLSearchParams({
          format: 'json', start: today, end: today, division: 'helsinki', language: 'fi',
          page: String(page), page_size: String(LE_MAX_PAGE_SIZE),
          sort: '-start_time', include: 'location',
        })}`,
      () => ({ next: { revalidate: 900 }, signal: AbortSignal.timeout(10000) }),
    )

    const events: PageEvent[] = []
    const seen = new Set<string>()
    for (const raw of rows) {
      if (seen.has(raw.id)) continue
      seen.add(raw.id)
      const e = normalize(raw)
      // Helsinki calendar date — LE emits UTC, so a 00:30 event's ISO prefix
      // would point at the previous day
      if (helsinkiDateOf(e.startTime) === today) events.push(e)
    }
    return events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  } catch {
    return []
  }
}

export default async function EnEventsTodayPage() {
  const events = await fetchToday()
  // Keskipäiväankkuri pitää kalenteripäivän oikeana myös talviaikaan.
  const dateStr = new Date(`${helsinkiToday()}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })

  const freeCount = events.filter(e => e.isFree).length

  const eventListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Helsinki events today',
    url: `${BASE}/en/events-today`,
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
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
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
      { '@type': 'Question', name: 'What’s on in Helsinki today?', acceptedAnswer: { '@type': 'Answer', text: `There are ${events.length} events in Helsinki today, ${dateStr} — concerts, exhibitions, theatre, sport and plenty more.` } },
      { '@type': 'Question', name: 'Are there free events in Helsinki today?', acceptedAnswer: { '@type': 'Answer', text: `${freeCount} of today’s events in Helsinki are free to attend. The full list is below.` } },
      { '@type': 'Question', name: 'Where can I find all Helsinki events?', acceptedAnswer: { '@type': 'Answer', text: 'Mitatanaan.fi collects Helsinki events automatically from 40+ sources: LinkedEvents, Ticketmaster, Eventbrite, RA, Kide, Lippu.fi and dozens of Helsinki venues.' } },
    ],
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'Events today', item: `${BASE}/en/events-today` },
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
      <HomeShell initialDateFilter="today" />

      <EnGuidePage
        asSection
        emoji="📅"
        title="Helsinki events today"
        crumb="Events today"
        stat={`${dateStr} — ${events.length} events · ${freeCount} free`}
        intro={DESC}
        seeAlso={[
          { href: '/en/events-this-weekend', label: '🎉 This weekend' },
          { href: '/en/free-events', label: '🆓 Free events' },
          { href: '/en/nightclubs', label: '🌃 Nightclubs' },
          { href: '/en/terraces', label: '☀️ Terraces' },
          { href: '/en/saunas', label: '🧖 Saunas' },
          { href: '/en/new-in-helsinki', label: '🆕 New in Helsinki' },
        ]}
        sources="Listings come from the City of Helsinki's open LinkedEvents API and refresh every 15 minutes; the app itself gathers events from 40+ sources. All times are Helsinki time. Titles are written by the organisers, so a few are still only in Finnish."
      >
        <div className="text-sm text-white/40 leading-relaxed space-y-3 mb-8">
          <p>
            Helsinki is Finland’s busiest events city. On any given day there are dozens of concerts,
            exhibitions, plays, matches and one-off happenings across the centre and the neighbourhoods.
            This page lists <strong className="text-white/70">everything starting in Helsinki today</strong>,
            so you can scan the whole evening in one go.
          </p>
          <p>
            Tonight that might mean live music at Tavastia, G Livelab or Korjaamo, a changing exhibition at
            Kiasma or Ateneum, or a free event a short tram ride away. Several museums also run free-entry
            days, so it is worth checking before you buy a ticket.
          </p>
        </div>

        {events.length === 0 ? (
          <p className="text-white/40 text-center py-16">No events found for today.</p>
        ) : (
          <ul className="space-y-2">
            {events.map(e => (
              <li key={e.id}>
                <Link href={`/e/${encodeURIComponent(e.id)}`}
                  className="flex items-start gap-3 bg-gray-900 hover:bg-gray-800 rounded-xl p-4 transition-colors group">
                  {e.image && <img src={e.image} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug">
                      {e.title}
                    </h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {formatTime(e.startTime)}
                      {e.venue && <span className="text-gray-500"> · {e.venue}</span>}
                    </p>
                  </div>
                  <div className="flex-shrink-0 self-center">
                    {e.isFree
                      ? <span className="text-green-400 text-xs font-medium">Free</span>
                      : e.price
                      ? <span className="text-gray-400 text-xs">{e.price}</span>
                      : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 pt-6 border-t border-white/10">
          <Link href="/en" className="block text-white/40 hover:text-white/70 text-sm transition-colors">← Open the app</Link>
        </div>
      </EnGuidePage>
    </>
  )
}
