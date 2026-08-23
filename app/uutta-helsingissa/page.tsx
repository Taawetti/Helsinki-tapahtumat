// "Uutta Helsingissä" — mitä kaupunkiin on auennut ja mitä on aukeamassa.
// Jokainen rivi ulkoisesta nimetystä lähteestä; kokoaminen
// lib/new-in-helsinki.ts:ssä. Sama data uudistuu viikoittain (rekisterit,
// OSM, näyttelyt) ja tunneittain (uutiset).

import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { buildNewInHelsinki } from '@/lib/new-in-helsinki'
import type { OpeningInput, PlaceCardInput } from '@/lib/new-in-helsinki'
import type { RestaurantReason, ReasonFile } from '@/lib/restaurant-reasons'
import { fetchRestaurantNews } from '@/lib/restaurant-news'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import NewInHelsinkiView from '@/components/NewInHelsinkiView'
import openingData from '@/data/new-openings.json'
import activityReasonData from '@/data/activity-reasons.json'
import enrichedData from '@/data/new-places-enriched.json'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Uudet ravintolat, kahvilat, baarit, saunat ja näyttelyt Helsingissä — mitä on juuri avattu ja mitä on aukeamassa. Lähteinä luparekisteri, OpenStreetMap, museot.fi ja tuoreet uutiset.'

export const metadata: Metadata = {
  title: 'Uutta Helsingissä — uudet ravintolat, kahvilat & paikat | Mitä tänään',
  description: DESC,
  alternates: { canonical: `${BASE}/uutta-helsingissa` },
  openGraph: { title: '🆕 Uutta Helsingissä', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/uutta-helsingissa` },
}

/**
 * lowercase-nimi → Google-arvostelumäärä. OSM:n uutuusväitteen vartija:
 * version==1 ei takaa uutta paikkaa (mitattu: Palace ja Ihana Kahvila oli
 * vasta kartoitettu, ei vasta avattu), mutta satojen arvostelujen paikka ei
 * voi olla juuri avattu. act:-avaimet puretaan samaan karttaan.
 */
const fetchReviewCounts = unstable_cache(
  async (): Promise<[string, number][] | null> => {
    if (!isSupabaseConfigured() || !supabase) return null
    const PAGE = 1000
    const out: [string, number][] = []
    for (let page = 0; ; page++) {
      const resp = await supabase
        .from('venue_ratings')
        .select('venue_key, review_count')
        .order('venue_key')
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (resp.error || !resp.data || resp.data.length === 0) break
      for (const row of resp.data as { venue_key: string; review_count: number | null }[]) {
        const key = row.venue_key.replace(/^act:/, '').toLowerCase().trim()
        if (typeof row.review_count === 'number') out.push([key, row.review_count])
      }
      if (resp.data.length < PAGE) break
    }
    return out.length ? out : null
  },
  ['uutta-review-counts-v1'],
  { revalidate: 3600 },
)

export default async function UuttaHelsingissaSivu() {
  const reasonFile = activityReasonData as unknown as ReasonFile
  const exhibitions: RestaurantReason[] = Object.values(reasonFile.byName)
    .flat()
    .filter((r) => r.kind === 'nayttely')

  // Uutisputken tai Supabasen kaatuminen ei kaada sivua: uutiset jäävät pois,
  // ja ilman arvostelumääriä OSM-rivit jätetään pois (uutuusväitettä ei voida
  // tarkistaa — mieluummin suppeampi sivu kuin väärä "uusi paikka").
  const [news, countRows] = await Promise.all([
    fetchRestaurantNews().catch(() => []),
    fetchReviewCounts().catch(() => null),
  ])

  // OSM-paikkojen Google-kortit: kuva, osoite, arvosana + tuorein
  // uutuusvartija (kortin arvostelumäärä).
  const placeCards = new Map<string, PlaceCardInput>(
    Object.entries((enrichedData as { cards?: Record<string, PlaceCardInput> }).cards ?? {}),
  )

  const data = buildNewInHelsinki({
    openings: (openingData.openings ?? []) as OpeningInput[],
    newPlaces: reasonFile.newPlaces ?? [],
    exhibitions,
    news,
    reviewCounts: countRows ? new Map(countRows) : undefined,
    placeCards,
    today: new Date(),
  })

  const monthCount = data.months[0]?.items.length ?? 0

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Uutta Helsingissä — juuri avatut ja avautuvat paikat',
    url: `${BASE}/uutta-helsingissa`,
    numberOfItems: data.total,
    itemListElement: [...data.upcoming, ...data.months.flatMap((m) => m.items)]
      .slice(0, 25)
      .map((i, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        item: {
          '@type': i.kind === 'nayttely' ? 'ExhibitionEvent' : 'LocalBusiness',
          name: i.name,
          ...(i.address ? { address: { '@type': 'PostalAddress', streetAddress: i.address, addressLocality: 'Helsinki', addressCountry: 'FI' } } : {}),
          ...(i.lat && i.lon ? { geo: { '@type': 'GeoCoordinates', latitude: i.lat, longitude: i.lon } } : {}),
          ...(i.www ? { url: /^https?:\/\//i.test(i.www) ? i.www : `https://${i.www}` } : {}),
          ...(i.kind === 'nayttely' ? { startDate: i.date } : {}),
        },
      })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Uutta Helsingissä', item: `${BASE}/uutta-helsingissa` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <main className="min-h-screen text-white" style={{ background: '#0a0a0c' }}>
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-white/35 mb-6 flex items-center gap-2">
            <Link href="/" className="hover:text-white/70 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-white">Uutta Helsingissä</span>
          </nav>

          {/* Otsikko */}
          <div className="mb-6">
            <h1 className="text-3xl font-black mb-2" style={{ letterSpacing: '-0.02em' }}>🆕 Uutta Helsingissä</h1>
            <p className="text-white/50 mb-3">
              {monthCount > 0 && data.months[0]
                ? `${data.months[0].label.split(' ')[0].toLowerCase().replace(/kuu$/, 'kuussa')} ${monthCount} uutta paikkaa`
                : 'Juuri avatut ja avautuvat paikat'}
              {data.upcoming.length > 0 ? ` · ${data.upcoming.length} tulossa` : ''}
            </p>
            <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
          </div>

          <NewInHelsinkiView data={data} />

          {/* Katso myös */}
          <div className="mt-10">
            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Katso myös</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🎉 Tapahtumat tänään</Link>
              <Link href="/terassit" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>☀️ Terassit</Link>
              <Link href="/yokerhot" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🪩 Yökerhot</Link>
            </div>
          </div>

          {/* Lähdeseloste — sama läpinäkyvyys kuin korteissa */}
          <p className="mt-8 text-[11px] text-white/25 leading-relaxed">
            Lähteet: anniskeluluparekisteri (avoindata.fi, CC BY 4.0), OpenStreetMap,
            museot.fi:n näyttelykalenteri ja suomalaiset uutislähteet Google Newsin
            kautta. Rivit päivittyvät automaattisesti — uutiset tunneittain, rekisterit
            viikoittain. Uusi paikka voi puuttua jos mikään lähde ei vielä tunne sitä.
          </p>
        </div>
      </main>
    </>
  )
}
