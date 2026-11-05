import type { Metadata } from 'next'
import Link from 'next/link'
import HomeShell from '@/components/HomeShell'
import { HELSINKI_NIGHTCLUBS, type CuratedVenue } from '@/lib/helsinki-nightclubs'
import { supabase } from '@/lib/supabase'
import { jsonLdHtml } from '@/lib/json-ld'

export const revalidate = 86400 // curated list changes rarely

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC = 'Yökerhot Helsingissä: parhaat klubit, teknoklubit, karaokebaarit ja kattoterassit kuratoituna — osoitteet, arvosanat ja vinkit yhden illan suunnitteluun.'

const OG_TITLE = "Yökerhot Helsinki — parhaat klubit, tekno & karaoke"

export const metadata: Metadata = {
  title: 'Yökerhot Helsinki — parhaat klubit, tekno & karaoke',
  description: DESC,
  alternates: {
    canonical: `${BASE}/yokerhot`,
    languages: { fi: `${BASE}/yokerhot`, en: `${BASE}/en/nightclubs`, 'x-default': `${BASE}/yokerhot` },
  },
  openGraph: {
    // Jakokuva. Ilman tätä sivu peri juurilayoutin openGraphin EI lainkaan
    // (sivun oma openGraph korvaa sen kokonaan), joten jaettu linkki näkyi
    // WhatsAppissa ja Facebookissa pelkkänä tekstirivinä ilman kuvaa.
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(OG_TITLE)}`, width: 1200, height: 630 }], title: '🪩 Yökerhot Helsinki', description: DESC, locale: 'fi_FI', type: 'website', url: `${BASE}/yokerhot` },
}

// Sections in priority order — each venue lands in its FIRST matching section
const SECTIONS: { key: string; emoji: string; title: string; blurb: string }[] = [
  { key: 'tekno',   emoji: '🎛', title: 'Tekno & elektroninen', blurb: 'Teknoa, housea ja kansainvälisiä DJ-vieraita.' },
  { key: 'klubi',   emoji: '🪩', title: 'Klubit & keikkabaarit', blurb: 'Klubi-iltoja, livekeikkoja ja tanssilattioita.' },
  { key: 'karaoke', emoji: '🎤', title: 'Karaokebaarit', blurb: 'Illan äänenavaus — karaokea joka makuun.' },
  { key: 'katto',   emoji: '🌇', title: 'Kattoterassit & rooftop-baarit', blurb: 'Drinkit kaupungin kattojen yllä.' },
]

/** Usein kysyttyä: näkyvä osio + FAQPage-rakenne. Yleistasolla tahallaan —
 *  paikkakohtaiset aukioloajat ja ikärajat vaihtuvat, ja väärä tieto olisi
 *  pahempi kuin yleinen. */
const USEIN_KYSYTTYA: { k: string; v: string }[] = [
  { k: 'Mihin aikaan Helsingin yökerhot sulkeutuvat?', v: 'Useimmat klubit ovat auki kello neljään asti; osa baareista sulkee jo kahdelta tai kolmelta ja muutama klubi jatkaa viiteen. Tarkista aina paikan omat aukioloajat ennen lähtöä.' },
  { k: 'Mikä on yökerhojen ikäraja Helsingissä?', v: 'Ikärajat vaihtelevat 18:sta 24:ään. Monessa baarissa ja teknoklubilla 18 vuotta riittää, mutta keskustan klubeilla viikonloppuisin ikäraja on usein 20–22. Henkilöllisyystodistus kannattaa pitää aina mukana.' },
  { k: 'Missä Helsingin teknoklubit ovat?', v: 'Teknon ja elektronisen musiikin keskittymä on Sörnäisissä ja Vallilassa: Kaiku ja Post Bar Kaikukadulla sekä Ääniwalli Pälkäneentien teollisuushallissa. Keskustan klubit painottuvat hittimusiikkiin ja livekeikkoihin.' },
  { k: 'Mistä näen, mitä klubeilla tapahtuu tänä iltana?', v: 'Sovelluksen Tapahtumat-välilehden Yöelämä-suodatin listaa illan klubi-illat ja keikat, ja suurimmilla paikoilla on oma ohjelmasivu (esimerkiksi Kaiku, Tavastia, Apollo ja Maxine), jolla näkyvät tulevat illat ja lippulinkit.' },
]

interface RatingInfo { rating: number; reviewCount: number }

async function fetchRatings(names: string[]): Promise<Record<string, RatingInfo>> {
  if (!supabase) return {}
  try {
    const keys = names.map((n) => n.toLowerCase().trim())
    const { data, error } = await supabase
      .from('venue_ratings')
      .select('venue_key, google_rating, review_count')
      .in('venue_key', keys)
    if (error || !data) return {}
    const out: Record<string, RatingInfo> = {}
    for (const row of data) {
      // Require a positive review count — AggregateRating with reviewCount 0
      // is invalid structured data and '⭐ 4.2 (0)' looks broken in the UI
      if (row.google_rating != null && ((row.review_count as number) ?? 0) > 0) {
        out[row.venue_key as string] = { rating: row.google_rating as number, reviewCount: row.review_count as number }
      }
    }
    return out
  } catch {
    return {}
  }
}

export default async function YokerhotSivu() {
  const ratings = await fetchRatings(HELSINKI_NIGHTCLUBS.map((v) => v.name))

  // Assign each venue to its first matching section (avoids duplicates)
  const assigned = new Set<string>()
  const grouped = SECTIONS.map((s) => {
    const venues = HELSINKI_NIGHTCLUBS.filter((v) => !assigned.has(v.id) && v.subCategories.includes(s.key))
    venues.forEach((v) => assigned.add(v.id))
    return { ...s, venues }
  }).filter((g) => g.venues.length > 0)

  const clubLd = (v: CuratedVenue) => ({
    '@type': v.type === 'yokerho' ? 'NightClub' : 'BarOrPub',
    name: v.name,
    address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
    geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lon },
    ...(v.www ? { url: v.www } : {}),
    ...(ratings[v.name.toLowerCase().trim()]
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: ratings[v.name.toLowerCase().trim()].rating,
            reviewCount: ratings[v.name.toLowerCase().trim()].reviewCount,
          },
        }
      : {}),
  })

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Yökerhot Helsingissä',
    url: `${BASE}/yokerhot`,
    numberOfItems: HELSINKI_NIGHTCLUBS.length,
    itemListElement: grouped.flatMap((g) => g.venues).map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: clubLd(v),
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Yökerhot', item: `${BASE}/yokerhot` },
    ],
  }

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: USEIN_KYSYTTYA.map((q) => ({ '@type': 'Question', name: q.k, acceptedAnswer: { '@type': 'Answer', text: q.v } })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqLd) }} />
      {/* Sovellusnäkymä valmiiksi tämän sivun suodattimella — sama tila kuin
          jos käyttäjä säätäisi sen itse etusivulla. Sivun oma sisältö jää
          alle: se on tämän sivun hakukonearvo, eikä sitä saa menettää. */}
      {/* RAVINTOLAT → YÖKERHOT (omistaja 5.11.2026): yökerhot ovat paikkoja,
          eivät tapahtumia, joten sivu avaa sovelluksen Ravintolat-välilehden
          Yökerhot-tyyppiin — klubit näkyvät sovelluksen omina paikkakortteina
          ja infopaneeleina (kuvaukset lib/helsinki-nightclubs → /api/restaurants
          blurb). Aiempi Yöelämä-tapahtumasuodatin ja sivun oma korttilista
          poistuivat. Sivun teksti jää alle: se on tämän sivun hakukonearvo. */}
      <HomeShell initialMode="restaurants" initialRestaurantFilter={{ restType: 'yokerhot', subCat: 'all' }} />

      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
          {/* Breadcrumb */}

          {/* Page header */}
          <div className="mb-8">
            <h1 className="sr-only">🪩 Yökerhot Helsingissä</h1>
            <p className="text-gray-400 mb-3">{HELSINKI_NIGHTCLUBS.length} kuratoitua klubia, baaria ja kattoterassia</p>
            {/* OPAS, EI PELKKÄ LISTA (SEO-suunnitelma 1, 5.11.2026): hakija
                kysyy "mihin lähteä" — vastaus on kaupunginosat, tyylit ja
                käytännön säännöt, ei osoiteluettelo. Aukioloajat ja ikärajat
                yleistasolla, koska paikkakohtaiset vanhenevat. */}
            <div className="text-sm text-gray-400 leading-relaxed space-y-3">
              <p>
                Helsingin yöelämä jakautuu kahteen suuntaan. <strong>Keskustassa ja Kampissa</strong> ovat
                isot klubit ja hittimusiikki – Kaarle XII, <Link href="/ohjelma/apollo" className="text-blue-400 hover:text-blue-300">Apollo Live Club</Link> ja{' '}
                <Link href="/ohjelma/maxine" className="text-blue-400 hover:text-blue-300">Maxine</Link> – sekä rockklubit{' '}
                <Link href="/ohjelma/tavastia" className="text-blue-400 hover:text-blue-300">Tavastia</Link> ja{' '}
                <Link href="/ohjelma/on-the-rocks" className="text-blue-400 hover:text-blue-300">On The Rocks</Link>.{' '}
                <strong>Kalliossa ja Sörnäisissä</strong> on vaihtoehtoisempi ja elektronisempi puoli:{' '}
                <Link href="/ohjelma/kaiku" className="text-blue-400 hover:text-blue-300">Kaiku</Link>,{' '}
                <Link href="/ohjelma/post-bar" className="text-blue-400 hover:text-blue-300">Post Bar</Link>,{' '}
                <Link href="/ohjelma/siltanen" className="text-blue-400 hover:text-blue-300">Siltanen</Link> ja Kuudes Linja
                Hämeentien ja Kaikukadun tuntumassa sekä Ääniwalli Vallilan teollisuushallissa.
              </p>
              <p>
                <strong>Hyvä tietää:</strong> useimmat klubit ovat auki kello neljään asti. Ikäraja vaihtelee –
                18 vuotta riittää monessa baarissa ja teknoklubilla, keskustan klubeilla viikonloppuisin
                usein 20–22. Sisäänpääsy on usein ilmainen tai alle 20 euroa; isommat artistivierailut
                maksavat enemmän, ja narikka maksetaan erikseen. Klubit löydät sovellusnäkymästä yllä;
                illan klubi-illat ja keikat näet Tapahtumat-välilehden Yöelämä-suodattimella sekä kunkin
                paikan ohjelmasivulta.
              </p>
            </div>
          </div>

          {/* Related pages */}
          <div className="mb-8">
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Katso myös</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/tapahtumat/yoelama" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🌃 Illan tapahtumat</Link>
              <Link href="/tapahtumat/viikonloppu" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🎉 Viikonloppu</Link>
              <Link href="/ohjelma/kaiku" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🎛 Kaiku — ohjelma</Link>
              <Link href="/ohjelma/tavastia" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🎸 Tavastia — ohjelma</Link>
              <Link href="/ohjelma/apollo" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🪩 Apollo — ohjelma</Link>
              <Link href="/pubivisat" className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">🧠 Pubivisat</Link>
            </div>
          </div>

          {/* Usein kysyttyä — sama sisältö kuin FAQPage-rakenteessa (faqLd),
              näkyvänä, koska Google ei lue piilotettua FAQ:ta. */}
          <section className="mt-12">
            <h2 className="text-lg font-bold mb-3 text-white">Usein kysyttyä</h2>
            <dl className="space-y-4">
              {USEIN_KYSYTTYA.map((q) => (
                <div key={q.k}>
                  <dt className="font-semibold text-white text-sm">{q.k}</dt>
                  <dd className="text-sm text-gray-400 leading-relaxed mt-1">{q.v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="mt-10 pt-6 border-t border-gray-800">
            <Link href="/" className="text-blue-400 hover:text-blue-300 transition-colors text-sm">
              ← Kaikki Helsinki tapahtumat
            </Link>
          </div>
      </section>
    </>
  )
}
