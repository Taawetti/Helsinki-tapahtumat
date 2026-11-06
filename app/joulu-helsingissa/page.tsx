// Joulu Helsingissä — kausisivu (omistaja 6.11.2026). Avaa sovelluksen
// jouluhaulla (laskeutumissivu avaa aina sovelluksen, ks. muisti
// landing-pages-open-app-view): sama tila kuin jos kävijä kirjoittaisi
// "joulu" hakuun, ja synonyymit tuovat mukaan Tuomaan markkinat ja
// englanninkieliset otsikot. Palvelimella haettu kalenterilista on haun
// siemen ja hakukoneen lista (lib/joulu-helsingissa). Sivun oma teksti
// sovelluksen alla: joulunavaus, mitä listalla on, usein kysyttyä.

import type { Metadata } from 'next'
import Link from 'next/link'
import HomeShell from '@/components/HomeShell'
import { jsonLdHtml } from '@/lib/json-ld'
import { helsinkiToday, formatEventDate } from '@/lib/helsinki-time'
import { hasOwnEventPage } from '@/lib/event-links'
import { isoAlkukirjain } from '@/lib/seo-intro'
import { JOULU_HAKUSANA, haeJoulunTapahtumat, joulukaudenVuosi, joulunavausTila, type NavausTila } from '@/lib/joulu-helsingissa'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'
const POLKU = '/joulu-helsingissa'

function sivunOtsikko(vuosi: number, navaus: NavausTila): string {
  return navaus.tila === 'tulossa'
    ? `Joulu Helsingissä ${vuosi} – joulunavaus ${navaus.lyhyt} ja joulun tapahtumat`
    : `Joulu Helsingissä ${vuosi} – joulun tapahtumat, konsertit ja markkinat`
}

function sivunKuvaus(vuosi: number, navaus: NavausTila): string {
  return navaus.tila === 'tulossa'
    ? `Helsingin joulunavaus ${navaus.paivaTeksti} klo ${navaus.klo} Aleksanterinkadulla. Joulukonsertit, joulumarkkinat, perhetapahtumat ja pikkujoulut yhdessä listassa.`
    : `Joulu Helsingissä ${vuosi}: joulukonsertit, joulumarkkinat, Tuomaan markkinat, perhetapahtumat ja pikkujoulut yhdessä listassa.`
}

export async function generateMetadata(): Promise<Metadata> {
  const tanaan = helsinkiToday()
  const vuosi = joulukaudenVuosi(tanaan)
  const navaus = joulunavausTila(tanaan)
  const title = sivunOtsikko(vuosi, navaus)
  const description = sivunKuvaus(vuosi, navaus)
  return {
    title,
    description,
    alternates: { canonical: `${BASE}${POLKU}` },
    openGraph: {
      title: `🎄 Joulu Helsingissä ${vuosi}`,
      description,
      locale: 'fi_FI',
      type: 'website',
      url: `${BASE}${POLKU}`,
      images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent(`Joulu Helsingissä ${vuosi}`)}`, width: 1200, height: 630 }],
    },
  }
}

export default async function JouluHelsingissaSivu() {
  const tanaan = helsinkiToday()
  const vuosi = joulukaudenVuosi(tanaan)
  const navaus = joulunavausTila(tanaan)
  const tapahtumat = await haeJoulunTapahtumat(tanaan)
  // Sivun oma lista: jokainen tapahtuma KERRAN seuraavalla esityskerrallaan.
  // Siemen (sovellusnäkymä) näyttää jokaisen esityskerran kuten haku aina;
  // tekstilistassa sama joulunäytelmä ei saa täyttää näkymää 15 rivillä.
  const nahdytNimet = new Set<string>()
  const lista = tapahtumat.filter((e) => {
    const avain = e.title.toLowerCase().replace(/\s+/g, ' ').trim()
    if (nahdytNimet.has(avain)) return false
    nahdytNimet.add(avain)
    return true
  })

  // Usein kysyttyä: näkyvä osio + FAQPage-rakenne samasta lähteestä. Ajankohta
  // vain kun se on tämän kauden tieto (joulunavausTila), muuten kysymystä ei ole.
  const kysymykset: { k: string; v: string }[] = [
    ...(navaus.tila === 'tulossa'
      ? [{
          k: `Milloin on Helsingin joulunavaus ${vuosi}?`,
          v: `${isoAlkukirjain(navaus.paivaTeksti)} klo ${navaus.klo} Aleksanterinkadulla Helsingin ydinkeskustassa. Joulunavaus on Aleksanterinkadun joulukadun avajaiset, joissa Aleksin jouluvalot sytytetään.`,
        }]
      : []),
    {
      k: 'Mistä näen Helsingin joulun tapahtumat?',
      v: 'Mitä tänään -sovellus kokoaa Helsingin tulevat jouluaiheiset tapahtumat yhteen: joulukonsertit, joulumarkkinat ja myyjäiset, Tuomaan markkinat, perhetapahtumat ja pikkujoulut. Joulukonsertit on koottu myös omalle sivulleen.',
    },
  ]

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Joulu Helsingissä ${vuosi}`,
    url: `${BASE}${POLKU}`,
    numberOfItems: lista.length,
    itemListElement: lista.slice(0, 20).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: e.title,
        startDate: e.startTime,
        ...(e.endTime ? { endDate: e.endTime } : {}),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: e.location?.name || 'Helsinki',
          address: { '@type': 'PostalAddress', streetAddress: e.location?.streetAddress || undefined, addressLocality: 'Helsinki', addressCountry: 'FI' },
        },
        ...(e.image ? { image: e.image } : {}),
        ...(e.isFree ? { isAccessibleForFree: true } : {}),
        ...(hasOwnEventPage(e) ? { url: `${BASE}/e/${encodeURIComponent(e.id)}` } : e.ticketUrl ? { url: e.ticketUrl } : {}),
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Joulu Helsingissä', item: `${BASE}${POLKU}` },
    ],
  }

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: kysymykset.map((q) => ({ '@type': 'Question', name: q.k, acceptedAnswer: { '@type': 'Answer', text: q.v } })),
  }

  const linkki = 'text-blue-400 hover:text-blue-300 transition-colors'

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqLd) }} />

      {/* Sovellus jouluhaulla. Siemen näkyy hakutuloksina heti (myös
          Googlelle), ja selaimen 90 päivän haku täydentää sen kaikista
          lähteistä — sama mekanismi kuin ohjelmasivuilla. */}
      <HomeShell initialSearch={JOULU_HAKUSANA} initialSearchSeed={tapahtumat} />

      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">Joulu Helsingissä {vuosi}</h1>
        <div className="text-sm text-white/40 leading-relaxed space-y-3">
          <p>
            {navaus.tila === 'tulossa' ? (
              <>
                <strong className="text-white/70">Helsingin joulunavaus</strong> eli Aleksanterinkadun joulukadun
                avajaiset on {navaus.paivaTeksti} klo {navaus.klo}. Silloin Aleksin jouluvalot syttyvät ja joulukausi
                alkaa Helsingin ydinkeskustassa.
              </>
            ) : navaus.tila === 'mennyt' ? (
              <>
                <strong className="text-white/70">Helsingin joulunavaus</strong> eli Aleksanterinkadun joulukadun
                avajaiset oli {navaus.paivaTeksti}, ja joulukausi on alkanut Helsingin ydinkeskustassa.
              </>
            ) : (
              <>
                <strong className="text-white/70">Helsingin joulunavaus</strong> eli Aleksanterinkadun joulukadun
                avajaiset aloittaa joulukauden marraskuun loppupuolella. Tämän vuoden ajankohta lisätään tälle
                sivulle, kun järjestäjä julkaisee sen.
              </>
            )}
          </p>
          <p>
            Kaikki tulevat joulun tapahtumat näkyvät sovelluksessa yllä: joulukonsertit, joulumarkkinat ja
            myyjäiset, Tuomaan markkinat, perhetapahtumat ja pikkujoulut. Joulukonsertit on koottu myös omalle
            sivulleen: <Link href="/joulukonsertit" className={linkki}>Joulukonsertit Helsingissä</Link>.
          </p>
        </div>

        {lista.length > 0 && (
          <>
            <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mt-8 mb-3">
              Tulevat joulun tapahtumat
            </h2>
            <ul className="space-y-2">
              {lista.slice(0, 30).map((e) => (
                <li key={e.id}>
                  <Link href={`/e/${encodeURIComponent(e.id)}`}
                    className="flex items-start gap-3 rounded-xl p-3 transition-colors group"
                    style={{ background: 'rgba(255,255,255,.04)' }}>
                    {e.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.image} alt="" width={56} height={56} loading="lazy" decoding="async" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white/90 group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug text-[14px]">
                        {e.title}
                      </h3>
                      <p className="text-[12px] text-white/35 mt-1">
                        {formatEventDate(e.startTime)}
                        {e.location?.name && <span className="text-white/25"> • {e.location.name}</span>}
                      </p>
                    </div>
                    <div className="flex-shrink-0 self-center">
                      {e.isFree ? (
                        <span className="text-green-400 text-[11px] font-medium">Ilmainen</span>
                      ) : e.price ? (
                        <span className="text-white/35 text-[11px]">{e.price}</span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="text-xs text-white/30 uppercase tracking-wider mt-8 mb-2">Katso myös</p>
        <div className="flex flex-wrap gap-2">
          {[
            { href: '/joulukonsertit', label: '🎄 Joulukonsertit' },
            { href: '/tapahtumat/viikonloppu', label: '🎉 Viikonloppu' },
            { href: '/tapahtumat/ilmaiset', label: '🆓 Ilmaiset tapahtumat' },
            { href: '/tapahtumat/lapset', label: '🧸 Lapsille' },
          ].map((l) => (
            <Link key={l.href} href={l.href}
              className="text-sm px-3 py-1.5 rounded-full transition-colors hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>
              {l.label}
            </Link>
          ))}
        </div>

        <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mt-10 mb-3">Usein kysyttyä</h2>
        <dl className="space-y-4">
          {kysymykset.map((q) => (
            <div key={q.k}>
              <dt className="font-semibold text-white/85 text-sm">{q.k}</dt>
              <dd className="text-sm text-white/45 leading-relaxed mt-1">{q.v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
