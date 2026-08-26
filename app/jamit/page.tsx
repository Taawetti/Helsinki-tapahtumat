// Jamit & open mic — omistajan valitsema opas: missä pääsee soittamaan tai
// lavalle Helsingissä. Tapahtumat LinkedEventsistä samalla kuviolla kuin
// /terassit (mitattu: kuukauden ikkunassa ~20 jamia/open miciä, kaikki
// LinkedEventsissä).

import type { Metadata } from 'next'
import Link from 'next/link'
import { formatEventDate } from '@/lib/helsinki-time'
import { fetchJamitEvents, type GuideEvent } from '@/lib/guide-data'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Jamit, open mic -illat ja open stage -lavat Helsingissä — missä pääsee soittamaan, laulamaan tai lavalle seuraavan kuukauden aikana.'

export const metadata: Metadata = {
  title: 'Jamit & open mic Helsinki — avoimet lavat ja jamisessiot',
  description: DESC,
  alternates: {
    canonical: `${BASE}/jamit`,
    languages: { fi: `${BASE}/jamit`, en: `${BASE}/en/jam-sessions`, 'x-default': `${BASE}/jamit` },
  },
  openGraph: { title: '🎤 Jamit & open mic', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/jamit` },
}

// Tekstihaku on löyhä — vaadi aito jami-/lavasana. HUOM: pelkkä /jami/
// osuisi nimeen "Jamie" — siksi taivutusmuodot ja yhdyssanaloppu (…jamit).
// Datahaku + JAMIT_REGEX jaettu lib/guide-data.ts:ään.
type PageEvent = GuideEvent

export default async function JamitSivu() {
  const events = await fetchJamitEvents()

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
      <main className="min-h-screen text-white" style={{ background: '#0a0a0c' }}>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <nav className="text-sm text-white/35 mb-6 flex items-center gap-2">
            <Link href="/" className="hover:text-white/70 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-white">Jamit & open mic</span>
          </nav>

          <div className="mb-6">
            <h1 className="text-3xl font-black mb-2" style={{ letterSpacing: '-0.02em' }}>🎤 Jamit & open mic</h1>
            <p className="text-white/50 mb-3">
              {events.length > 0 ? `${events.length} avointa lavaa seuraavan kuukauden aikana` : 'Avoimet lavat ja jamisessiot'}
            </p>
            <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <p className="text-4xl mb-3">🎸</p>
              <p>Ei jameja listattuna juuri nyt — uudet ilmestyvät tänne heti kun järjestäjät julkaisevat ne.</p>
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
                      {formatEventDate(e.startTime)}{e.venue ? ` · ${e.venue}` : ''}
                      {e.isFree ? ' · 🎁 maksuton' : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10">
            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Katso myös</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/pubivisat" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🧠 Pubivisat</Link>
              <Link href="/tapahtumat/keikka" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🎸 Keikat</Link>
              <Link href="/" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🎉 Tapahtumat tänään</Link>
            </div>
          </div>

          <p className="mt-8 text-[11px] text-white/25 leading-relaxed">
            Lähde: Helsingin LinkedEvents. Baarien omat jami-illat eivät aina
            päädy tapahtumakalentereihin — vinkkaa järjestäjälle, että
            tapahtuman voi ilmoittaa myös tässä sovelluksessa.
          </p>
        </div>
      </main>
    </>
  )
}
