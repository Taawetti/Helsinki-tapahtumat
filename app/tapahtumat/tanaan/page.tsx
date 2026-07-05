import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 900 // 15 min — today's events update frequently

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

export const metadata: Metadata = {
  title: 'Tapahtumat Helsinki tänään – mitä tapahtuu nyt | Mitä tänään',
  description: 'Kaikki tämän päivän tapahtumat Helsingissä yhdessä paikassa. Konsertit, näyttelyt, urheilu, stand-up, ilmaiset tapahtumat — automaattisesti päivitetty.',
  alternates: { canonical: `${BASE}/tapahtumat/tanaan` },
  openGraph: {
    title: 'Tapahtumat Helsinki tänään',
    description: 'Mitä tänään tapahtuu Helsingissä? Konsertit, näyttelyt, urheilu, stand-up ja paljon muuta.',
    locale: 'fi_FI',
    type: 'website',
    url: `${BASE}/tapahtumat/tanaan`,
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
  offers?: { is_free: boolean; price?: { fi?: string }; info_url?: { fi?: string; en?: string } }[]
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
    title: raw.name?.fi || raw.name?.en || raw.name?.sv || 'Tapahtuma',
    startTime: raw.start_time,
    venue: raw.location?.name?.fi || raw.location?.name?.en || '',
    isFree: offer?.is_free ?? false,
    price: offer?.is_free ? null : (offer?.price?.fi || null),
    image: raw.images?.[0]?.url || null,
    ticketUrl: offer?.info_url?.fi || offer?.info_url?.en || raw.info_url?.fi || null,
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' })
}

async function fetchToday(): Promise<PageEvent[]> {
  // Helsinki is UTC+3 in summer — compute local date
  const now = new Date()
  const helsinkiOffset = 3 * 60
  const localNow = new Date(now.getTime() + helsinkiOffset * 60 * 1000)
  const today = localNow.toISOString().slice(0, 10)

  try {
    const res = await fetch(
      `https://api.hel.fi/linkedevents/v1/event/?format=json&start=${today}&end=${today}&division=helsinki&language=fi&page_size=100&sort=start_time&include=location`,
      { next: { revalidate: 900 }, signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || []).map(normalize)
  } catch {
    return []
  }
}

export default async function TanaanPage() {
  const events = await fetchToday()
  const now = new Date()
  const helsinkiOffset = 3 * 60
  const localNow = new Date(now.getTime() + helsinkiOffset * 60 * 1000)
  const dateStr = localNow.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })

  const eventListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Tapahtumat Helsinki tänään',
    url: `${BASE}/tapahtumat/tanaan`,
    numberOfItems: events.length,
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
    mainEntity: [
      { '@type': 'Question', name: 'Mitä tapahtuu Helsingissä tänään?', acceptedAnswer: { '@type': 'Answer', text: `Tänään ${dateStr} Helsingissä on ${events.length} tapahtumaa. Tarjolla on konsertteja, näyttelyjä, teatteriesityksiä, urheilutapahtumia ja paljon muuta.` } },
      { '@type': 'Question', name: 'Onko Helsingissä ilmaisia tapahtumia tänään?', acceptedAnswer: { '@type': 'Answer', text: `Tänään ilmaisia tapahtumia on ${events.filter(e => e.isFree).length} kappaletta. Katso täydellinen lista alta.` } },
      { '@type': 'Question', name: 'Mistä löydän kaikki Helsingin tapahtumat?', acceptedAnswer: { '@type': 'Answer', text: 'Mitatanaan.fi kokoaa automaattisesti tapahtumat 40+ lähteestä: LinkedEvents, Ticketmaster, Eventbrite, RA, Kide, Lippu.fi ja kymmenet helsinkiläiset venues.' } },
    ],
  }

  const freeCount = events.filter(e => e.isFree).length

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <nav className="text-sm text-gray-500 mb-6 flex items-center gap-2">
            <Link href="/" className="hover:text-gray-300 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-white">Tapahtumat tänään</span>
          </nav>

          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">📅 Tapahtumat Helsinki tänään</h1>
            <p className="text-gray-400 mb-4">{dateStr} — {events.length} tapahtumaa · {freeCount} ilmaista</p>

            <div className="text-sm text-gray-400 leading-relaxed space-y-3">
              <p>
                Helsinki on Suomen aktiivisin tapahtumakaupunki. Joka päivä kaupungissa on tarjolla kymmeniä
                konsertteja, näyttelyjä, teatteriesityksiä, urheilutapahtumia ja muita elämyksiä.
                Tältä sivulta löydät <strong>tämän päivän kaikki tapahtumat Helsingissä</strong> — koottuna
                automaattisesti 40+ lähteestä.
              </p>
              <p>
                Tänään voit suunnata live-musiikkia Tavastiaalle, G Livelabiin tai Korjaamolle,
                tutustua vaihtuviin näyttelyihin Kiasmassa tai Ateneumissa, tai löytää ilmaisen
                tapahtuman lähikaupunginosasta. Monissa museoissa on myös ilmaisia sisäänpääsypäiviä.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-8">
            {[
              { href: '/tapahtumat/viikonloppu', label: '🎉 Viikonloppu' },
              { href: '/tapahtumat/ilmaiset', label: '🆓 Ilmaiset' },
              { href: '/tapahtumat/keikka', label: '🎸 Keikka' },
              { href: '/tapahtumat/standup', label: '😂 Stand up' },
              { href: '/tapahtumat/museo', label: '🏛 Museot' },
              { href: '/tapahtumat/lapset', label: '👨‍👩‍👧 Perhe' },
            ].map(l => (
              <Link key={l.href} href={l.href}
                className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">
                {l.label}
              </Link>
            ))}
          </div>

          {events.length === 0 ? (
            <p className="text-gray-500 text-center py-16">Ei tapahtumia löydetty tänään.</p>
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
                        ? <span className="text-green-400 text-xs font-medium">Ilmainen</span>
                        : e.price
                        ? <span className="text-gray-400 text-xs">{e.price}</span>
                        : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10 pt-6 border-t border-gray-800 space-y-3">
            <div className="flex flex-wrap gap-4">
              <Link href="/tapahtumat/viikonloppu" className="text-blue-400 hover:text-blue-300 text-sm">Viikonlopun tapahtumat →</Link>
              <Link href="/tapahtumat/ilmaiset" className="text-blue-400 hover:text-blue-300 text-sm">Ilmaiset tapahtumat →</Link>
            </div>
            <Link href="/" className="block text-gray-500 hover:text-gray-300 text-sm">← Avaa sovellus</Link>
          </div>
        </div>
      </main>
    </>
  )
}
