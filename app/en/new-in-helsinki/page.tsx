// "New in Helsinki" — englanninkielinen vastine sivulle /uutta-helsingissa.
//
// MIKSI. Mitattu DataForSEOsta 26.8.2026: englanninkieliset Helsinki-haut
// ovat 19 000/kk matalalla kilpailulla, ja "new restaurants helsinki" /
// "new bars helsinki" osuu suoraan tämän sivun sisältöön. Uutuusaikajana oli
// tähän asti vain suomeksi eli näkymätön näille hakijoille.
//
// DATA jaetaan suomenkielisen sivun kanssa (lib/uutta-data.ts) — sama
// välimuisti, ei kaksinkertaista kuormaa rekistereihin, OSM:ään ja
// uutisputkeen. revalidate on täsmälleen sama kuin suomenkielisellä sivulla.
//
// MIKSI EI components/EnGuidePage. Runko rajaa sisällön max-w-2xl-palstaan,
// joka riittää saunalistalle mutta ei tälle sivulle: NewInHelsinkiView
// piirtää 3/4-julistekortteja neljän sarakkeen ruudukkoon, ja suomenkielinen
// sivu antaa niille max-w-6xl. Sama ulkoasu molemmilla kielillä on tärkeämpää
// kuin runkokomponentin uudelleenkäyttö — muuten englanninkielinen versio
// olisi eri sivu, ei käännös.
//
// KIELI tulee contexts/LanguageGate.tsx:stä polun perusteella: /en-puussa
// LanguageProvider pakotetaan arvoon 'en' jo palvelimella, joten näkymän
// t()-kutsut renderöityvät englanniksi myös indeksoitavaan HTML:ään.
// Paikkojen nimet ja uutisotsikot tulevat lähteistä suomeksi — tiedossa oleva
// rajoite, joka kerrotaan lähdeselosteessa.

import type { Metadata } from 'next'
import Link from 'next/link'
import { assembleNewInHelsinki } from '@/lib/uutta-data'
import NewInHelsinkiView from '@/components/NewInHelsinkiView'
import { getTranslation } from '@/lib/i18n'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'New restaurants, bars, cafés, saunas and exhibitions in Helsinki — what has just opened and what is opening next. Built from the alcohol licence register, OpenStreetMap, museot.fi and Finnish news.'

const OG_TITLE = "New in Helsinki — new restaurants, bars & cafés that just opened"

export const metadata: Metadata = {
  title: 'New in Helsinki — new restaurants, bars & cafés that just opened',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/new-in-helsinki`,
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
    images: [{ url: `/api/og?brand=HELSINKI%20EVENTS&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }],
    title: '🆕 New in Helsinki',
    description: DESC,
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    type: 'website',
    url: `${BASE}/en/new-in-helsinki`,
  },
}

export default async function EnNewInHelsinkiPage() {
  // Sama kokoaminen kuin suomenkielisellä sivulla ja sovelluksen
  // Uutta-välilehdellä (lib/uutta-data.ts) — jaettu välimuisti.
  const data = await assembleNewInHelsinki()

  // Tilastorivi lasketaan samasta datasta kuin suomenkielinen sivu; lukuja ei
  // kirjoiteta käsin. Kuukauden nimi tulee samasta käännösavaimesta kuin
  // näkymän omat kuukausiotsikot, jotta sivu ei voi sanoa eri kuukautta.
  const firstMonth = data.months[0]
  const monthCount = firstMonth?.items.length ?? 0
  const monthName = firstMonth?.monthKey ? getTranslation('en', firstMonth.monthKey) : ''

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'New in Helsinki — places that just opened and are opening soon',
    url: `${BASE}/en/new-in-helsinki`,
    numberOfItems: data.total,
    inLanguage: 'en-GB',
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
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: `${BASE}/en` },
      { '@type': 'ListItem', position: 2, name: 'New in Helsinki', item: `${BASE}/en/new-in-helsinki` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <main className="min-h-screen text-white" style={{ background: '#0a0a0c' }}>
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-white/35 mb-6 flex items-center gap-2">
            <Link href="/en" className="hover:text-white/70 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-white">New in Helsinki</span>
          </nav>

          {/* Otsikko */}
          <div className="mb-6">
            <h1 className="text-3xl font-black mb-2" style={{ letterSpacing: '-0.02em' }}>🆕 New in Helsinki</h1>
            <p className="text-white/50 mb-3">
              {monthCount > 0 && monthName
                ? `${monthCount} new places in ${monthName}`
                : 'Just opened and opening soon'}
              {data.upcoming.length > 0 ? ` · ${data.upcoming.length} opening soon` : ''}
            </p>
            <p className="text-sm text-white/35 leading-relaxed">{DESC}</p>
          </div>

          <NewInHelsinkiView data={data} />

          {/* See also */}
          <div className="mt-10">
            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">See also</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/en" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🎉 Events today</Link>
              <Link href="/en/saunas" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>🧖 Saunas</Link>
              <Link href="/en/terraces" className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>☀️ Terraces</Link>
            </div>
          </div>

          {/* Lähdeseloste — sama läpinäkyvyys kuin suomenkielisellä sivulla,
              plus rehellinen maininta siitä että nimet ja otsikot ovat suomeksi. */}
          <p className="mt-8 text-[11px] text-white/25 leading-relaxed">
            Sources: the Finnish alcohol licence register (avoindata.fi, CC BY 4.0),
            OpenStreetMap, the museot.fi exhibition calendar and Finnish news outlets
            via Google News. Rows update themselves — news hourly, registers weekly.
            A new place can be missing if no source knows about it yet. Venue names
            and news headlines come from the sources in Finnish.
          </p>
        </div>
      </main>
    </>
  )
}
