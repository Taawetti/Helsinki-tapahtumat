// "Uutta Helsingissä" — mitä kaupunkiin on auennut ja mitä on aukeamassa.
// Jokainen rivi ulkoisesta nimetystä lähteestä; kokoaminen
// lib/new-in-helsinki.ts:ssä. Sama data uudistuu viikoittain (rekisterit,
// OSM, näyttelyt) ja tunneittain (uutiset).

import type { Metadata } from 'next'
import Link from 'next/link'
import { assembleNewInHelsinki } from '@/lib/uutta-data'
import NewInHelsinkiView from '@/components/NewInHelsinkiView'
import HomeShell from '@/components/HomeShell'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC =
  'Uudet ravintolat, kahvilat, baarit, saunat ja näyttelyt Helsingissä — mitä on juuri avattu ja mitä on aukeamassa. Lähteinä luparekisteri, OpenStreetMap, museot.fi ja tuoreet uutiset.'

const OG_TITLE = "Uutta Helsingissä — uudet ravintolat, kahvilat & paikat"

export const metadata: Metadata = {
  title: 'Uutta Helsingissä — uudet ravintolat, kahvilat & paikat',
  description: DESC,
  alternates: {
    canonical: `${BASE}/uutta-helsingissa`,
    languages: {
      fi: `${BASE}/uutta-helsingissa`,
      en: `${BASE}/en/new-in-helsinki`,
      'x-default': `${BASE}/uutta-helsingissa`,
    },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }], title: '🆕 Uutta Helsingissä', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/uutta-helsingissa` },
}

export default async function UuttaHelsingissaSivu() {
  // Kokoaminen jaettu sovelluksen Uutta-välilehden kanssa (lib/uutta-data.ts).
  const data = await assembleNewInHelsinki()

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
      {/* Sovellusnäkymä avataan Uutta-välilehteen — se on tämän sivun suora
          vastine sovelluksessa. Sivun oma sisältö jää alle hakukonearvoksi. */}
      <HomeShell initialMode="uutta" />

      <section className="max-w-6xl mx-auto px-4 pb-10 pt-2">
          {/* Breadcrumb */}

          {/* Otsikko */}
          <div className="mb-6">
            <h1 className="sr-only">🆕 Uutta Helsingissä</h1>
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
      </section>
    </>
  )
}
