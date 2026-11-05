import type { Metadata } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import HomeShell from '@/components/HomeShell'
import { supabase } from '@/lib/supabase'
import { VENUE_PAGES, type VenuePage } from '@/lib/venue-pages'
import { helsinkiDateRange, helsinkiOffset, helsinkiDateOf, formatEventDate } from '@/lib/helsinki-time'
import { fetchLinkedEventsAll, LE_MAX_PAGE_SIZE } from '@/lib/linked-events'
import { normalisoiLinkedEvent, type LinkedEventRaw } from '@/lib/fetchInitialEvents'
import { fetchImagesCached, getEventImage } from '@/lib/venue-images'
import { jsonLdHtml } from '@/lib/json-ld'
import { lueLahdepalat, palatValille } from '@/lib/lahdevarasto'
import { kanoninenPaikannimi } from '@/lib/paikannimet'
import { hasOwnEventPage } from '@/lib/event-links'
import { httpsKuva } from '@/lib/utils'
import type { Event } from '@/lib/types'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

/** Sivun oman listan rivi (hakukoneosio sovellusnäkymän alla). */
interface PageEvent {
  id: string
  title: string
  startTime: string
  isFree: boolean
  price: string | null
  ticketUrl: string | null
  image: string | null
  /** Oma sivu /e/[id] (LinkedEvents-tyyliset tunnisteet); skrapatut rivit linkittävät lippusivulle */
  internal: boolean
}

// ── Paikan tapahtumat TÄYSINÄ Event-riveinä ─────────────────────────────────
// Sama muoto kuin sovelluksen koosteessa, koska lista annetaan HomeShellille
// sovellusnäkymän siemeneksi (initialSearchSeed): kortit ja infopaneeli
// piirtyvät samasta rakenteesta kuin selaimen oma haku, ja id:t täsmäävät
// koosteen riveihin, jotta siemen ja saapuva tulos yhdistyvät ilman tuplia.

async function fetchTprekEvents(tprekId: string): Promise<Event[]> {
  const { start, end } = helsinkiDateRange(60)
  // Sivutettu ja laskeva — ks. lib/linked-events.ts. Tässä oli nouseva
  // lajittelu ja yksi 100 rivin sivu 60 PÄIVÄN ikkunalle: sama muoto joka
  // palautti helmet-reitillä mitatusti nollan. Mitattu lähimpänä rajaa
  // Malmitalo (tprek:8740) = 89 osumaa 100:sta, eli 11 rivin päässä
  // hiljaisesta katkaisusta josta mikään ei olisi ilmoittanut.
  try {
    const { rows } = await fetchLinkedEventsAll<LinkedEventRaw>(
      (page) =>
        `https://api.hel.fi/linkedevents/v1/event/?${new URLSearchParams({
          location: tprekId, format: 'json', start, end,
          page: String(page), page_size: String(LE_MAX_PAGE_SIZE),
          sort: '-start_time', include: 'location,keywords',
        })}`,
      () => ({ next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }),
    )
    // LinkedEvents `start=` matches events still ONGOING at that date, so
    // long-running series (started weeks ago) surface first — drop past starts
    // like app/api/events does, with a 24h grace for tonight's events.
    const cutoff = new Date(start).getTime() - 24 * 60 * 60 * 1000
    return rows
      .filter((raw) => new Date(raw.start_time).getTime() >= cutoff)
      .map(normalisoiLinkedEvent)
  } catch {
    return []
  }
}

async function fetchScrapedEvents(venue: VenuePage, venueId: string): Promise<Event[]> {
  if (!supabase) return []
  // Helsinki calendar dates + DST-aware offset — a UTC server's own date
  // flips to "yesterday" between 00-03 Helsinki time and would resurface
  // last night's gigs as upcoming.
  const { start, end } = helsinkiDateRange(60)
  const offset = helsinkiOffset(new Date())
  const { data, error } = await supabase
    .from('scraped_events')
    .select('id, title, start_datetime, image_url, is_free, price_info, ticket_url, venue_name')
    .eq('venue_id', venueId)
    .gte('start_datetime', `${start}T00:00:00${offset}`)
    .lte('start_datetime', `${end}T23:59:59${offset}`)
    .order('start_datetime', { ascending: true })
  if (error || !data) return []
  // Sama muunnos kuin app/api/scraped (koosteen lähde): id, paikka ja
  // kategoria täsmäävät, jotta siemen yhdistyy koosteen riveihin.
  return data.map((row) => ({
    id: String(row.id),
    title: row.title as string,
    shortDescription: '',
    description: '',
    startTime: row.start_datetime as string,
    endTime: null,
    location: { name: (row.venue_name as string | null) || venue.name, streetAddress: venue.address, city: 'Helsinki' },
    image: httpsKuva(row.image_url as string | null),
    isFree: Boolean(row.is_free),
    price: (row.price_info as string | null) ?? null,
    ticketUrl: (row.ticket_url as string | null) ?? null,
    infoUrl: (row.ticket_url as string | null) ?? null,
    categories: ['Kulttuuri'],
    source: 'scraped',
  }))
}

/** Lähdevarasto (lib/lahdevarasto): paikan oman skraperin tapahtumat samoista
 *  10 päivän paloista, jotka kooste lukee. Yksi Supabase-kysely per sivu;
 *  jos varastoa ei voi lukea, sivu näyttää tyhjän listan (ei kaadu). */
async function fetchStoreEvents(lahde: string, paikka?: string): Promise<Event[]> {
  const { start, end } = helsinkiDateRange(60)
  const luku = await lueLahdepalat(palatValille(start, end))
  if ('virhe' in luku) return []
  const haluttu = paikka ? kanoninenPaikannimi(paikka) : null
  const seen = new Set<string>()
  const out: Event[] = []
  for (const rivi of luku.rivit) {
    if (rivi.lahde !== lahde || !rivi.ok || !Array.isArray(rivi.tapahtumat)) continue
    for (const e of rivi.tapahtumat) {
      if (!e?.id || seen.has(e.id)) continue
      let paiva: string
      try { paiva = helsinkiDateOf(e.startTime) } catch { continue }
      if (paiva < start || paiva > end) continue
      if (haluttu && kanoninenPaikannimi(e.location?.name ?? '') !== haluttu) continue
      seen.add(e.id)
      out.push({ ...e, image: httpsKuva(e.image) })
    }
  }
  return out
}

async function fetchVenueEvents(venue: VenuePage): Promise<Event[]> {
  const events = venue.tprekId
    ? await fetchTprekEvents(venue.tprekId)
    : venue.scrapedId
    ? await fetchScrapedEvents(venue, venue.scrapedId)
    : venue.lahde
    ? await fetchStoreEvents(venue.lahde, venue.paikka)
    : []
  // Aikajärjestys ENNEN rajausta: LinkedEvents tulee laskevana, ja 60 rivin
  // katto ilman lajittelua olisi pudottanut lähimmät (Oodi: yli 60 riviä).
  const lista = events
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 60)
  // Paikkakuva kuvattomille riveille — sama varakuva kuin koosteessa, jotta
  // siemenen kortti ei vaihda ulkoasua kun selaimen haku korvaa sen.
  try {
    const { venues: venueMap } = await fetchImagesCached()
    for (const e of lista) {
      if (!e.image) {
        const varakuva = getEventImage(e.location?.name, e.categories, venueMap, {})
        if (varakuva) e.image = varakuva
      }
    }
  } catch { /* lista kelpaa kuvittakin */ }
  return lista
}

function toPageEvent(e: Event): PageEvent {
  return {
    id: e.id,
    title: e.title,
    startTime: e.startTime,
    isFree: !!e.isFree,
    price: e.isFree ? null : (e.price ?? null),
    ticketUrl: e.ticketUrl ?? e.infoUrl ?? null,
    image: e.image,
    internal: hasOwnEventPage(e),
  }
}

// Listarivin linkkilogiikka: LinkedEvents-tyyliset tunnisteet saavat oman
// sivun, skrapatut rivit linkittävät suoraan paikan lippusivulle. Moduuli-
// tasolla, ei renderin sisällä (ei komponentteja renderissä).
function EventLink({ e, className, style, children }: { e: PageEvent; className: string; style?: CSSProperties; children: ReactNode }) {
  if (e.internal) {
    return <Link href={`/e/${encodeURIComponent(e.id)}`} className={className} style={style}>{children}</Link>
  }
  if (e.ticketUrl) {
    return <a href={e.ticketUrl} target="_blank" rel="noopener noreferrer" className={className} style={style}>{children}</a>
  }
  return <div className={className} style={style}>{children}</div>
}

type Props = { params: Promise<{ venue: string }> }

export async function generateStaticParams() {
  return VENUE_PAGES.map((v) => ({ venue: v.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { venue: slug } = await params
  const venue = VENUE_PAGES.find((v) => v.slug === slug)
  if (!venue) return {}
  // Käsin hiottu muoto, joka mahtuu 120–160 merkkiin jokaisella venuella —
  // pitkänimisillä (Kulttuuritehdas Korjaamo) tiputetaan vain lyhyempään muotoon.
  let desc = `${venue.name} ohjelma — tulevat keikat ja tapahtumat. ${venue.description}`
  if (desc.length > 160) {
    desc = `${venue.name} — tulevat keikat ja tapahtumat. ${venue.description}`
  }
  return {
    title: `${venue.name} ohjelma & keikat`,
    description: desc,
    alternates: { canonical: `${BASE}/ohjelma/${slug}` },
    openGraph: {
      title: `${venue.name} — ohjelma`, description: desc, locale: 'fi_FI', type: 'website', url: `${BASE}/ohjelma/${slug}`,
      // Ilman kuvaa jaettu linkki näkyi WhatsAppissa/Facebookissa pelkkänä
      // tekstirivinä (sama korjaus kuin opassivuilla).
      images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(`${venue.name} — ohjelma & keikat`)}`, width: 1200, height: 630 }],
    },
  }
}

export default async function OhjelmaSivu({ params }: Props) {
  const { venue: slug } = await params
  const venue = VENUE_PAGES.find((v) => v.slug === slug)
  if (!venue) notFound()

  const tapahtumat = await fetchVenueEvents(venue)
  const events = tapahtumat.map(toPageEvent)
  const hakusana = venue.haku ?? venue.name

  const venuePlaceLd = {
    '@context': 'https://schema.org',
    '@type': venue.schemaType,
    name: venue.name,
    address: { '@type': 'PostalAddress', streetAddress: venue.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
    ...(venue.www ? { url: venue.www } : {}),
  }

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${venue.name} — ohjelma`,
    url: `${BASE}/ohjelma/${slug}`,
    numberOfItems: events.length,
    itemListElement: events.slice(0, 15).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: e.title,
        startDate: e.startTime,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: venue.name,
          address: { '@type': 'PostalAddress', streetAddress: venue.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
        },
        ...(e.isFree
          ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }
          : e.ticketUrl
          ? { offers: { '@type': 'Offer', url: e.ticketUrl, priceCurrency: 'EUR' } }
          : {}),
        ...(e.internal ? { url: `${BASE}/e/${encodeURIComponent(e.id)}` } : e.ticketUrl ? { url: e.ticketUrl } : {}),
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Ohjelma', item: `${BASE}/ohjelma/${slug}` },
      { '@type': 'ListItem', position: 3, name: venue.name, item: `${BASE}/ohjelma/${slug}` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(venuePlaceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />

      {/* SOVELLUSNÄKYMÄ PAIKAN HAKUSANALLA (omistaja 5.11.2026): hakukoneesta
          tuleva laskeutuu itse sovellukseen — sama tila kuin infokortin "Paikan
          kaikki tapahtumat" — eikä erilliselle listasivulle, jotta hän jatkaa
          siitä. Palvelimella haettu lista on siemen: kortit ovat näkyvissä heti
          ja Googlen HTML:ssä, ja selaimen 90 pv haku korvaa ne valmistuttuaan.
          Sivun oma sisältö jää alle: se on tämän sivun hakukonearvo. Sama
          rakenne kuin kategoriasivuilla (app/tapahtumat/[slug]). */}
      <HomeShell initialSearch={hakusana} initialSearchSeed={tapahtumat} />

      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">{venue.name} — ohjelma ja tulevat tapahtumat</h1>
        <p className="text-sm text-white/35 leading-relaxed">
          {venue.emoji ?? '🎸'} {venue.name} · {venue.address}
          {venue.www && (
            <>
              {' · '}
              <a href={venue.www} target="_blank" rel="noopener noreferrer" className="text-blue-400/80 hover:text-blue-300 transition-colors">
                {venue.www.replace(/^https?:\/\//, '')} ↗
              </a>
            </>
          )}
        </p>
        <p className="mt-3 text-[13px] text-white/28 leading-relaxed">{venue.description}</p>

        {events.length > 0 ? (
          <>
            <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mt-8 mb-3">
              Tulevat <span className="text-white/30 font-bold">· {events.length} · 60 päivää</span>
            </h2>
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id}>
                  <EventLink e={e} className="flex items-start gap-3 rounded-xl p-3 transition-colors group" style={{ background: 'rgba(255,255,255,.04)' }}>
                    {e.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.image} alt="" width={56} height={56} loading="lazy" decoding="async" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white/90 group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug text-[14px]">
                        {e.title}
                      </h3>
                      <p className="text-[12px] text-white/35 mt-1">{formatEventDate(e.startTime)}</p>
                    </div>
                    <div className="flex-shrink-0 self-center">
                      {e.isFree ? (
                        <span className="text-green-400 text-[11px] font-medium">Ilmainen</span>
                      ) : e.price ? (
                        <span className="text-white/35 text-[11px]">{e.price}</span>
                      ) : null}
                    </div>
                  </EventLink>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-8 text-sm text-white/35">
            Ei tulevia tapahtumia listattuna juuri nyt.
            {venue.www && (
              <>
                {' '}
                <a href={venue.www} target="_blank" rel="noopener noreferrer" className="text-blue-400/80 hover:text-blue-300 transition-colors">
                  Katso paikan oma sivu ↗
                </a>
              </>
            )}
          </p>
        )}

        {/* Ristiinlinkit muihin ohjelmasivuihin — sisäinen linkitys on osa
            näiden sivujen hakukonearvoa. Listan jälkeen, ei ennen: 30 sirua
            ennen sisältöä työnsi ohjelman puhelimessa ruudun ulkopuolelle. */}
        <p className="text-xs text-white/30 uppercase tracking-wider mt-8 mb-2">Muut paikat</p>
        <div className="flex flex-wrap gap-2">
          {VENUE_PAGES.filter((v) => v.slug !== slug).map((v) => (
            <Link key={v.slug} href={`/ohjelma/${v.slug}`}
              className="text-sm px-3 py-1.5 rounded-full transition-colors hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>
              {v.emoji ?? '🎸'} {v.name}
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
