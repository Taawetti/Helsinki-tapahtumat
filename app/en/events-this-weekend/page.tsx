// Things to do in Helsinki this weekend — englanninkielinen vastine sivulle
// /tapahtumat/viikonloppu.
//
// MIKSI. Mitattu DataForSEOsta 26.8.2026: "helsinki this weekend" 210 hakua/kk
// matalalla kilpailulla, ja sen ympärillä koko "things to do helsinki weekend"
// -perhe. Viikonloppusivu oli tähän asti vain suomeksi eli näkymätön juuri
// sille hakijalle joka on kaupungissa perjantaina ja etsii tekemistä nyt.
//
// DATA JAETAAN SUOMENKIELISEN SIVUN KANSSA. Tämä sivu ei ole oma lähde: se
// kutsuu fetchLinkedEventsAll:ia TÄSMÄLLEEN samoilla URL-parametreilla ja
// samalla `next: { revalidate: 3600 }` -asetuksella kuin suomenkielinen sivu,
// joten Next osuu samaan Data Cache -merkintään eikä api.hel.fi näe yhtään
// lisäpyyntöä. ÄLÄ muuta hakuparametreja (`language: 'fi'` mukaan lukien) —
// yksikin ero luo oman välimuistiavaimen ja tuplaa kuorman lähteelle.
//
// TAPAHTUMIEN NIMET. Otsikko luetaan ENSIN LinkedEventsin omasta englannin-
// kielisestä kentästä (name.en) ja vasta sitten suomesta. Tämä ei ole konekään-
// nös vaan järjestäjän oma englanninkielinen nimi; osa tapahtumista jää silti
// suomeksi, mikä on tiedossa oleva rajoite.

import type { Metadata } from 'next'
import Link from 'next/link'
import EnGuidePage from '@/components/EnGuidePage'
import HomeShell from '@/components/HomeShell'
import { formatEventDate, helsinkiDateOf, helsinkiToday } from '@/lib/helsinki-time'
import { fetchLinkedEventsAll, LE_MAX_PAGE_SIZE } from '@/lib/linked-events'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const FI_URL = `${BASE}/tapahtumat/viikonloppu`
const EN_URL = `${BASE}/en/events-this-weekend`

const DESC =
  'Things to do in Helsinki this weekend: Friday, Saturday and Sunday gigs, club nights, festivals and free events — the whole weekend’s programme in one place.'

const OG_TITLE = "Things to do in Helsinki this weekend — gigs, clubs & free events"

export const metadata: Metadata = {
  title: 'Things to do in Helsinki this weekend — gigs, clubs & free events',
  description: DESC,
  alternates: {
    canonical: EN_URL,
    languages: { fi: FI_URL, en: EN_URL, 'x-default': FI_URL },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '🎉 Helsinki this weekend',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: EN_URL,
  },
}

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  start_time: string
  images?: { url: string }[]
  location?: { name?: { fi?: string; en?: string } }
  offers?: { is_free: boolean; price?: { fi?: string; en?: string } }[]
}

interface PageEvent {
  id: string; title: string; startTime: string; venue: string
  isFree: boolean; price: string | null; image: string | null
}

// LinkedEventsin `price` on vapaata tekstiä, ja osa järjestäjistä täyttää sen
// LIPPUKAUPAN OSOITTEELLA ("https://helsinkidesignweek.com/"). Mitattu 28.8.
// viikonlopulta: URL renderöityi hintakenttään sellaisenaan. Tyhjä on parempi
// kuin väärä — nimenomaan hintaruudussa, jota käyttäjä lukee lukuna.
const priceText = (p: string | null | undefined): string | null => {
  const s = p?.trim()
  if (!s || /^(https?:\/\/|www\.)/i.test(s)) return null
  return s
}

function normalize(raw: LEEvent): PageEvent {
  const offer = raw.offers?.[0]
  return {
    id: raw.id,
    // Englanti ensin — sama rivi suomenkielisellä sivulla lukee fi:n ensin.
    title: raw.name?.en || raw.name?.fi || raw.name?.sv || 'Event',
    startTime: raw.start_time,
    venue: raw.location?.name?.en || raw.location?.name?.fi || '',
    isFree: offer?.is_free ?? false,
    // Hinta on merkkijono lähteestä ("15/12 €"); en-kenttä käytetään jos on.
    price: offer?.is_free ? null : (priceText(offer?.price?.en) || priceText(offer?.price?.fi)),
    image: raw.images?.[0]?.url || null,
  }
}

function getWeekendRange(): { fri: string; sat: string; sun: string; label: string } {
  // Sama logiikka kuin suomenkielisellä sivulla: keskipäiväankkuri UTC:ssa
  // vastaa Helsingin kalenteripäivää sekä EET- että EEST-aikaan, joten
  // viikonpäivä ei karkaa vuorokaudella talviaikana.
  const anchor = new Date(`${helsinkiToday()}T12:00:00Z`)
  const day = anchor.getUTCDay() // 0=Sun, 1=Mon ... 5=Fri, 6=Sat
  const daysToFri = day === 5 ? 0 : day === 6 ? -1 : day === 0 ? -2 : 5 - day
  const fri = new Date(anchor.getTime() + daysToFri * 86400000)
  const sat = new Date(fri.getTime() + 86400000)
  const sun = new Date(fri.getTime() + 2 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const dayMonth = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  return { fri: fmt(fri), sat: fmt(sat), sun: fmt(sun), label: `${dayMonth(fri)} – ${dayMonth(sun)}` }
}

async function fetchWeekend(): Promise<PageEvent[]> {
  const { fri, sun } = getWeekendRange()
  try {
    // URL JA OPTIOT OVAT TARKOITUKSELLA IDENTTISET suomenkielisen sivun kanssa
    // — sama Data Cache -merkintä, ei toista hakua lähteelle. Laskeva
    // sort=-start_time on siellä perusteltu: nouseva järjestys nostaa
    // kuukausia vanhat käynnissä olevat näyttelyt ensimmäiselle sivulle.
    const { rows } = await fetchLinkedEventsAll<LEEvent>(
      (page) =>
        `https://api.hel.fi/linkedevents/v1/event/?${new URLSearchParams({
          format: 'json', start: fri, end: sun, division: 'helsinki', language: 'fi',
          page: String(page), page_size: String(LE_MAX_PAGE_SIZE),
          sort: '-start_time', include: 'location',
        })}`,
      () => ({ next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) }),
    )

    const events: PageEvent[] = []
    const seen = new Set<string>()
    for (const raw of rows) {
      if (seen.has(raw.id)) continue
      seen.add(raw.id)
      const e = normalize(raw)
      // Helsingin kalenteripäivä — LE lähettää UTC:ta, joten perjantain 00:30
      // alkavan tapahtuman ISO-alku osoittaisi torstaihin.
      const d = helsinkiDateOf(e.startTime)
      if (d >= fri && d <= sun) events.push(e)
    }
    return events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  } catch {
    return []
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export default async function EnWeekendPage() {
  const events = await fetchWeekend()
  const { label, fri, sat, sun } = getWeekendRange()
  const freeCount = events.filter((e) => e.isFree).length

  const eventListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Things to do in Helsinki this weekend',
    url: EN_URL,
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

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'This weekend', item: EN_URL },
    ],
  }

  // Ryhmittely HELSINGIN kalenteripäivällä, samalla funktiolla kuin suodatus.
  // Pelkkä startTime.slice(0, 10) olisi UTC-päivä, jolloin lauantaiyön 00:30
  // alkava klubi-ilta putoaisi eri ämpäriin kuin mihin suodatin sen laski.
  const byDate: Record<string, PageEvent[]> = {}
  for (const e of events) {
    const d = helsinkiDateOf(e.startTime)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(e)
  }

  const dayNames: Record<string, string> = { [fri]: 'Friday', [sat]: 'Saturday', [sun]: 'Sunday' }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {/* Sovellusnäkymä valmiiksi tämän sivun suodattimella — sama tila kuin
          jos käyttäjä säätäisi sen itse etusivulla. Sivun oma sisältö jää
          alle: se on tämän sivun hakukonearvo. */}
      <HomeShell initialDateFilter="weekend" />

      <EnGuidePage
        asSection
        emoji="🎉"
        title="Things to do in Helsinki this weekend"
        crumb="This weekend"
        stat={`${label} — ${plural(events.length, 'event')} · ${freeCount} free`}
        intro={DESC}
        seeAlso={[
          { href: '/en/events-today', label: '📅 Events today' },
          { href: '/en/free-events', label: '🆓 Free events' },
          { href: '/en/nightclubs', label: '🌙 Nightclubs' },
          { href: '/en/saunas', label: '🧖 Saunas' },
        ]}
        sources="Source: Linked Events, the City of Helsinki open event data, refreshed every hour. Event titles come straight from the organisers, so some of them appear in Finnish only. All times are Helsinki time (EET/EEST)."
      >
        <div className="text-sm text-white/45 leading-relaxed space-y-3 mb-8">
          <p>
            No city in Finland packs more into three days. From Friday evening to Sunday afternoon there
            are hundreds of things happening in Helsinki — gigs, festivals, markets, matches, museum
            shows and restaurant events — and everything below is running <strong>this weekend</strong>,
            listed hour by hour.
          </p>
          <p>
            Friday night belongs to live music and clubs: Tavastia, Circus Helsinki, Korjaamo and
            G Livelab all fill up. Saturday has the widest daytime programme, spread across parks,
            market squares and the city’s culture houses. On Sunday plenty of museums and exhibitions
            are open cheaply or free, which makes it the easy day if the weather turns.
          </p>
        </div>

        {events.length === 0 ? (
          <p className="text-white/40 text-center py-16">No events found for this weekend yet.</p>
        ) : (
          <div className="space-y-8">
            {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayEvents]) => (
              <div key={date}>
                <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3">
                  {dayNames[date] || date}{' '}
                  {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}
                  <span className="ml-2 text-white/25 normal-case">({plural(dayEvents.length, 'event')})</span>
                </h2>
                <ul className="space-y-2">
                  {dayEvents.map((e) => (
                    <li key={e.id}>
                      <Link href={`/e/${encodeURIComponent(e.id)}`}
                        className="flex items-start gap-3 bg-gray-900 hover:bg-gray-800 rounded-xl p-4 transition-colors group">
                        {e.image && <img src={e.image} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug">
                            {e.title}
                          </h3>
                          <p className="text-sm text-white/45 mt-0.5">
                            {formatEventDate(e.startTime, 'en')}
                            {e.venue && <span className="text-white/30"> · {e.venue}</span>}
                          </p>
                        </div>
                        <div className="flex-shrink-0 self-center">
                          {e.isFree ? <span className="text-green-400 text-xs font-medium">Free</span>
                            : e.price ? <span className="text-white/45 text-xs">{e.price}</span> : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </EnGuidePage>
    </>
  )
}
