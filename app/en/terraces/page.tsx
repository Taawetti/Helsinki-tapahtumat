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

import type { Metadata } from 'next'
import Link from 'next/link'
import EnGuidePage from '@/components/EnGuidePage'
import { HELSINKI_NIGHTCLUBS } from '@/lib/helsinki-nightclubs'
import { formatEventDate } from '@/lib/helsinki-time'
import { fetchTerraceEvents } from '@/lib/guide-data'

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
  const events = await fetchTerraceEvents()
  const rooftops = HELSINKI_NIGHTCLUBS.filter((v) => v.subCategories.includes('katto'))

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
      <EnGuidePage
        emoji="☀️"
        title="Helsinki terraces & rooftop bars"
        crumb="Terraces"
        stat={stat}
        intro={DESC}
        seeAlso={[
          { href: '/en/saunas', label: '🧖 Saunas' },
          { href: '/en/nightclubs', label: '🪩 Nightlife' },
          { href: '/en', label: '🎉 Events today' },
        ]}
        sources="Sources: Helsinki Linked Events for the events, and a hand-picked rooftop list (MyHelsinki, Resident Advisor, venue sites). Event titles come from the organisers, so some are in Finnish only. Terrace opening depends on the weather — check the venue's own site before you head out."
      >
        {/* Rooftop bars */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-1 text-white">🌇 Rooftop bars</h2>
          <p className="text-sm text-white/40 mb-3">Drinks above the city — open rain or shine.</p>
          <ul className="space-y-2">
            {rooftops.map((v) => (
              <li key={v.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,.05)' }}>
                <h3 className="font-semibold text-white leading-snug">
                  {v.www ? (
                    <a href={v.www} target="_blank" rel="noopener noreferrer" className="hover:text-blue-300 transition-colors">
                      {v.name} ↗
                    </a>
                  ) : v.name}
                </h3>
                <p className="text-sm text-white/40 truncate">{v.address}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Terrace events */}
        <section>
          <h2 className="text-lg font-bold mb-1 text-white">🎪 Terrace &amp; open-air events</h2>
          <p className="text-sm text-white/40 mb-3">What&rsquo;s on over the next two weeks — Superterassi, Allas Sea Pool and the rest.</p>
          {events.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <p className="text-4xl mb-3">🍂</p>
              <p>No terrace events listed right now — the season runs from June to August.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/e/${encodeURIComponent(e.id)}`}
                    className="flex items-start gap-3 rounded-xl p-4 transition-colors group"
                    style={{ background: 'rgba(255,255,255,.05)' }}
                  >
                    {e.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.image} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug">
                        {e.title}
                      </h3>
                      <p className="text-sm text-white/60 mt-1">
                        {formatEventDate(e.startTime, 'en')}
                        {e.venue && <span className="text-white/40"> • {e.venue}</span>}
                      </p>
                    </div>
                    <div className="flex-shrink-0 self-center">
                      {e.isFree ? (
                        <span className="text-green-400 text-xs font-medium">Free</span>
                      ) : e.price ? (
                        <span className="text-white/50 text-xs">{e.price}</span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </EnGuidePage>
    </>
  )
}
