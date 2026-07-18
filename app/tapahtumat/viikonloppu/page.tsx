import type { Metadata } from 'next'
import Link from 'next/link'
import { helsinkiDateOf } from '@/lib/helsinki-time'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

export const metadata: Metadata = {
  title: 'Tapahtumat Helsinki viikonloppu – perjantai, lauantai, sunnuntai | Mitä tänään',
  description: 'Viikonlopun parhaat tapahtumat Helsingissä. Konsertit, festivaalit, ravintolaillat, urheilu, näyttelyt — kaikki yhdessä paikassa automaattisesti päivitettynä.',
  alternates: { canonical: `${BASE}/tapahtumat/viikonloppu` },
  openGraph: {
    title: 'Tapahtumat Helsinki viikonloppu',
    description: 'Mitä tapahtuu Helsingissä tänä viikonloppuna? Perjantain, lauantain ja sunnuntain parhaat tapahtumat.',
    locale: 'fi_FI',
    type: 'website',
    url: `${BASE}/tapahtumat/viikonloppu`,
  },
}

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  start_time: string
  images?: { url: string }[]
  location?: { name?: { fi?: string; en?: string } }
  offers?: { is_free: boolean; price?: { fi?: string }; info_url?: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

interface PageEvent {
  id: string; title: string; startTime: string; venue: string
  isFree: boolean; price: string | null; image: string | null
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
  }
}

function getWeekendRange(): { fri: string; sun: string; label: string } {
  // Calculate Friday–Sunday in Helsinki time (UTC+3 in summer)
  const now = new Date()
  const helsinkiNow = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const day = helsinkiNow.getUTCDay() // 0=Sun, 1=Mon ... 5=Fri, 6=Sat
  // Fri(5)→0, Sat(6)→-1 (fri was yesterday), Sun(0)→-2, Mon(1)→4, Tue(2)→3, Wed(3)→2, Thu(4)→1
  const daysToFri = day === 5 ? 0 : day === 6 ? -1 : day === 0 ? -2 : 5 - day
  const fri = new Date(helsinkiNow.getTime() + daysToFri * 86400000)
  const sun = new Date(fri.getTime() + 2 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const friLabel = fri.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  const sunLabel = sun.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  return { fri: fmt(fri), sun: fmt(sun), label: `${friLabel} – ${sunLabel}` }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fi-FI', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki',
  })
}

async function fetchWeekend(): Promise<PageEvent[]> {
  const { fri, sun } = getWeekendRange()
  try {
    // Descending sort + date filter: LinkedEvents `start=` also matches
    // months-old ongoing exhibitions, which ascending order would put first —
    // eating the whole page and hiding the weekend's real events. A weekend
    // has 125-250 real starts, so fetch three pages to cover Friday's daytime
    // events too (descending order fills from Sunday backwards).
    const base = `https://api.hel.fi/linkedevents/v1/event/?format=json&start=${fri}&end=${sun}&division=helsinki&language=fi&page_size=100&sort=-start_time&include=location`
    const results = await Promise.allSettled([1, 2, 3].map((p) =>
      fetch(`${base}&page=${p}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) })
    ))
    const events: PageEvent[] = []
    const seen = new Set<string>()
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value.ok) continue
      const data = await r.value.json()
      for (const raw of data.data || []) {
        if (seen.has(raw.id)) continue
        seen.add(raw.id)
        const e = normalize(raw)
        // Helsinki calendar date — LE emits UTC, so a Friday 00:30 event's ISO
        // prefix would point at Thursday
        const d = helsinkiDateOf(e.startTime)
        if (d >= fri && d <= sun) events.push(e)
      }
    }
    return events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  } catch {
    return []
  }
}

export default async function ViikonloppuPage() {
  const events = await fetchWeekend()
  const { label, fri, sun } = getWeekendRange()
  const freeCount = events.filter(e => e.isFree).length

  const eventListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Tapahtumat Helsinki viikonloppu',
    url: `${BASE}/tapahtumat/viikonloppu`,
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

  // Group by date
  const byDate: Record<string, PageEvent[]> = {}
  for (const e of events) {
    const d = e.startTime.slice(0, 10)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(e)
  }

  const dayNames: Record<string, string> = { [fri]: 'Perjantai', [new Date(new Date(fri).getTime() + 86400000).toISOString().slice(0, 10)]: 'Lauantai', [sun]: 'Sunnuntai' }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventListLd) }} />
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <nav className="text-sm text-gray-500 mb-6 flex items-center gap-2">
            <Link href="/" className="hover:text-gray-300 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-white">Viikonloppu</span>
          </nav>

          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">🎉 Tapahtumat Helsinki viikonloppu</h1>
            <p className="text-gray-400 mb-4">{label} — {events.length} tapahtumaa · {freeCount} ilmaista</p>

            <div className="text-sm text-gray-400 leading-relaxed space-y-3">
              <p>
                Helsingin <strong>viikonlopun tapahtumatarjonta</strong> on Suomen monipuolisinta.
                Perjantai-illasta sunnuntai-iltapäivään kaupungissa on käynnissä satoja tapahtumia —
                keikkoja, festivaaleja, markkinoita, urheiluotteluita, museonäyttelyjä ja ravintolatapahtumia.
              </p>
              <p>
                Perjantai-ilta on perinteisesti keikkojen ja klubien aikaa: Tavastia, Circus Helsinki,
                Korjaamo ja G Livelab täyttyvät esiintyjistä. Lauantaisin kaupungissa on eniten
                kaikenikäisille sopivaa ohjelmaa — puistoissa, toreilla ja kulttuuritaloissa.
                Sunnuntaisin monet museot ja näyttelyt ovat auki edullisesti tai ilmaiseksi.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-8">
            {[
              { href: '/tapahtumat/tanaan', label: '📅 Tänään' },
              { href: '/tapahtumat/ilmaiset', label: '🆓 Ilmaiset' },
              { href: '/tapahtumat/keikka', label: '🎸 Keikka' },
              { href: '/tapahtumat/yoelama', label: '🌙 Yöelämä' },
              { href: '/tapahtumat/urheilu', label: '⚽ Urheilu' },
            ].map(l => (
              <Link key={l.href} href={l.href}
                className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">
                {l.label}
              </Link>
            ))}
          </div>

          {events.length === 0 ? (
            <p className="text-gray-500 text-center py-16">Ei tapahtumia löydetty viikonlopulle.</p>
          ) : (
            <div className="space-y-8">
              {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayEvents]) => (
                <div key={date}>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    {dayNames[date] || date} {new Date(date).toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', timeZone: 'UTC' })}
                    <span className="ml-2 text-gray-600 normal-case">({dayEvents.length} tapahtumaa)</span>
                  </h2>
                  <ul className="space-y-2">
                    {dayEvents.map(e => (
                      <li key={e.id}>
                        <Link href={`/e/${encodeURIComponent(e.id)}`}
                          className="flex items-start gap-3 bg-gray-900 hover:bg-gray-800 rounded-xl p-4 transition-colors group">
                          {e.image && <img src={e.image} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug">
                              {e.title}
                            </h3>
                            <p className="text-sm text-gray-400 mt-0.5">
                              {formatDate(e.startTime)}
                              {e.venue && <span className="text-gray-500"> · {e.venue}</span>}
                            </p>
                          </div>
                          <div className="flex-shrink-0 self-center">
                            {e.isFree ? <span className="text-green-400 text-xs font-medium">Ilmainen</span>
                              : e.price ? <span className="text-gray-400 text-xs">{e.price}</span> : null}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-gray-800">
            <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Avaa sovellus</Link>
          </div>
        </div>
      </main>
    </>
  )
}
