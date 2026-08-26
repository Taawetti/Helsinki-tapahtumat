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

import type { Metadata } from 'next'
import Link from 'next/link'
import { formatEventDate } from '@/lib/helsinki-time'
import EnGuidePage from '@/components/EnGuidePage'
import { fetchJamitEvents } from '@/lib/guide-data'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Jam sessions, open mic nights and open stages in Helsinki — the live music you can actually take part in. Where to play, sing or step on stage over the next month.'

export const metadata: Metadata = {
  title: 'Jam sessions & open mic nights in Helsinki — live music calendar',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/jam-sessions`,
    languages: { fi: `${BASE}/jamit`, en: `${BASE}/en/jam-sessions`, 'x-default': `${BASE}/jamit` },
  },
  openGraph: {
    title: '🎤 Jam sessions & open mic in Helsinki',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/jam-sessions`,
  },
}

export default async function EnJamSessionsPage() {
  const events = await fetchJamitEvents()

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
      <EnGuidePage
        emoji="🎤"
        title="Jam sessions & open mic in Helsinki"
        crumb="Jam sessions & open mic"
        stat={events.length > 0 ? `${events.length} open stages over the next month` : 'Open stages and jam sessions'}
        intro={DESC}
        seeAlso={[
          { href: '/en/saunas', label: '🧖 Saunas' },
          { href: '/en', label: '🎉 Events today' },
        ]}
        sources="Source: Helsinki LinkedEvents. Bar-run jam nights don't always reach the city calendars — tell the organiser they can list the night in this app too. Event titles come straight from the organisers, so some of them are in Finnish."
      >
        {events.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            <p className="text-4xl mb-3">🎸</p>
            <p>No jams listed right now — new ones turn up here as soon as organisers publish them.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/e/${encodeURIComponent(e.id)}`}
                  className="block rounded-xl p-3.5 transition-colors hover:bg-white/6"
                  style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                  <p className="font-bold text-white text-[14px] leading-snug">{e.title}</p>
                  <p className="text-[12.5px] text-white/50 mt-0.5">
                    {formatEventDate(e.startTime, 'en')}{e.venue ? ` · ${e.venue}` : ''}
                    {e.isFree ? ' · 🎁 free entry' : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </EnGuidePage>
    </>
  )
}
