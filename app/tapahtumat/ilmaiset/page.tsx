import type { Metadata } from 'next'
import Link from 'next/link'
import { helsinkiDateOf } from '@/lib/helsinki-time'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

export const metadata: Metadata = {
  title: 'Ilmaiset tapahtumat Helsinki – maksuton ohjelma | Mitä tänään',
  description: 'Kaikki ilmaiset tapahtumat Helsingissä seuraavan kuukauden aikana. Ilmaiset konsertit, näyttelyt, ulkoilmatapahtumat, pubitrivia ja paljon muuta — päivitetty automaattisesti.',
  alternates: { canonical: `${BASE}/tapahtumat/ilmaiset` },
  openGraph: {
    title: 'Ilmaiset tapahtumat Helsinki',
    description: 'Mitä Helsingissä voi tehdä ilmaiseksi? Konsertit, näyttelyt, tori- ja puistotapahtumat — kaikki ilmainen ohjelma yhdessä paikassa.',
    locale: 'fi_FI',
    type: 'website',
    url: `${BASE}/tapahtumat/ilmaiset`,
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
    title: raw.name?.fi || raw.name?.en || raw.name?.sv || 'Tapahtuma',
    startTime: raw.start_time,
    venue: raw.location?.name?.fi || raw.location?.name?.en || '',
    image: raw.images?.[0]?.url || null,
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fi-FI', {
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

export default async function IlmaisetPage() {
  const events = await fetchFree()

  const eventListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Ilmaiset tapahtumat Helsinki',
    url: `${BASE}/tapahtumat/ilmaiset`,
    numberOfItems: events.length,
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
    mainEntity: [
      { '@type': 'Question', name: 'Mitä Helsingissä voi tehdä ilmaiseksi?', acceptedAnswer: { '@type': 'Answer', text: `Seuraavan viikon aikana Helsingissä on ${events.length} ilmaista tapahtumaa. Tarjolla on muun muassa ilmaisia konsertteja, puistotapahtumia, museovierailuja ja kulttuuritapahtumia.` } },
      { '@type': 'Question', name: 'Milloin museot ovat ilmaiseksi Helsingissä?', acceptedAnswer: { '@type': 'Answer', text: 'Monet Helsingin museot ovat ilmaiseksi alle 18-vuotiaille ympäri vuoden. Lisäksi museoissa on säännöllisiä ilmaisia sisäänpääsypäiviä. Katso ajantasaiset tiedot alta.' } },
      { '@type': 'Question', name: 'Missä järjestetään ilmaisia ulkoilmatapahtumia Helsingissä?', acceptedAnswer: { '@type': 'Answer', text: 'Esplanadin puisto, Kauppatori, Kallio Block Party, Hernesaari ja monet kaupunginosatapahtumat tarjoavat ilmaista ohjelmaa. Kesäisin myös Senaatintori ja Töölönlahti ovat aktiivisia tapahtumapaikkoja.' } },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <nav className="text-sm text-gray-500 mb-6 flex items-center gap-2">
            <Link href="/" className="hover:text-gray-300 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-white">Ilmaiset tapahtumat</span>
          </nav>

          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">🆓 Ilmaiset tapahtumat Helsinki</h1>
            <p className="text-gray-400 mb-4">Seuraavat 7 päivää — {events.length} ilmaista tapahtumaa</p>

            <div className="text-sm text-gray-400 leading-relaxed space-y-3">
              <p>
                Helsinki tarjoaa runsaasti <strong>ilmaisia tapahtumia</strong> ympäri vuoden.
                Kaupungin puistoissa, toreilla ja kulttuurikeskuksissa järjestetään säännöllisesti
                maksutonta ohjelmaa kaikille ikäryhmille.
              </p>
              <p>
                Kesäisin Esplanadin puisto, Kauppatori ja Hernesaari täyttyvät ilmaisista konserteista
                ja tapahtumista. Malmitalossa, Vuotalossa ja muissa kaupunginosakulttuuritaloissa
                on ilmaista ohjelmaa ympäri vuoden. Monet museot ovat ilmaiseksi alle 18-vuotiaille
                ja järjestävät säännöllisiä ilmaisvierailuja.
              </p>
              <p>
                Tältä sivulta löydät kaikki tulevat ilmaiset tapahtumat automaattisesti päivitettynä
                — konserteista ja näyttelyistä kirjastotapahtumiin ja pubitriviaan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-8">
            {[
              { href: '/tapahtumat/tanaan', label: '📅 Tänään' },
              { href: '/tapahtumat/viikonloppu', label: '🎉 Viikonloppu' },
              { href: '/tapahtumat/lapset', label: '👨‍👩‍👧 Lapset' },
              { href: '/tapahtumat/museo', label: '🏛 Museot' },
              { href: '/tapahtumat/taide', label: '🎨 Taide' },
            ].map(l => (
              <Link key={l.href} href={l.href}
                className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">
                {l.label}
              </Link>
            ))}
          </div>

          {events.length === 0 ? (
            <p className="text-gray-500 text-center py-16">Ei ilmaisia tapahtumia löydetty.</p>
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
                        {formatDate(e.startTime)}
                        {e.venue && <span className="text-gray-500"> · {e.venue}</span>}
                      </p>
                    </div>
                    <span className="flex-shrink-0 self-center text-green-400 text-xs font-medium">Ilmainen</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10 pt-6 border-t border-gray-800">
            <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Avaa sovellus</Link>
          </div>
        </div>
      </main>
    </>
  )
}
