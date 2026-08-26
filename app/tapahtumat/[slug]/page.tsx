import type { Metadata } from 'next'
import { curateForLanding } from '@/lib/seo-curation'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import HomeShell from '@/components/HomeShell'
import { VIBES, NEIGHBORHOODS, NEIGHBORHOOD_INESSIVE, type Vibe, type Neighborhood } from '@/lib/types'
import { classifyEvent, extractYsoIds } from '@/lib/event-classify'
import { fetchLinkedEventsAll, LE_MAX_PAGE_SIZE } from '@/lib/linked-events'
import { helsinkiToday, formatEventDate } from '@/lib/helsinki-time'

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

interface LEEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  start_time: string
  end_time?: string | null
  images?: { url: string }[]
  location?: {
    name?: { fi?: string; en?: string }
    street_address?: { fi?: string; en?: string }
    address_locality?: { fi?: string; en?: string }
    '@id'?: string
  }
  keywords?: { '@id'?: string; name?: { fi?: string; en?: string } }[]
  offers?: { is_free: boolean; price?: { fi?: string }; info_url?: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

interface PageEvent {
  id: string
  title: string
  shortDescription: string
  startTime: string
  endTime: string | null
  venue: string
  address: string
  categories: string[]
  ysoIds: string[]
  isFree: boolean
  price: string | null
  ticketUrl: string | null
  image: string | null
}

function normalizeLE(raw: LEEvent): PageEvent {
  const title = raw.name?.fi || raw.name?.en || raw.name?.sv || 'Tapahtuma'
  const shortDescription = raw.short_description?.fi || raw.short_description?.en || ''
  const venue = raw.location?.name?.fi || raw.location?.name?.en || ''
  const address = raw.location?.street_address?.fi || raw.location?.street_address?.en || ''
  // slice(0,4) TÄSMÄLLEEN kuten /api/events normalize — muuten sama tapahtuma
  // luokittuisi eri tavoin sovelluksessa ja SEO-sivulla (rikkoisi "yksi totuus")
  const categories = (raw.keywords || []).map((k) => k.name?.fi || k.name?.en || '').filter(Boolean).slice(0, 4)
  const ysoIds = extractYsoIds(raw.keywords)
  const offer = raw.offers?.[0]
  const isFree = offer?.is_free ?? false
  const price = isFree ? null : (offer?.price?.fi || null)
  const ticketUrl = offer?.info_url?.fi || offer?.info_url?.en || raw.info_url?.fi || raw.info_url?.en || null
  const image = raw.images?.[0]?.url || null
  return { id: raw.id, title, shortDescription, startTime: raw.start_time, endTime: raw.end_time || null, venue, address, categories, ysoIds, isFree, price, ticketUrl, image }
}

function dateRange() {
  // HELSINGIN kalenteripäivä, ei UTC:n. `new Date().toISOString()` antaa
  // UTC-päivän, joka on klo 00–03 Helsingin aikaa VIELÄ EDELLINEN päivä —
  // mitattu 22.8.2026 klo 01.01 EEST → UTC-päivä 2026-08-21. Ikkuna alkoi
  // silloin eilisestä, ja koska alla oleva päiväsuodatin nojaa tähän arvoon,
  // eilen alkaneet tapahtumat olisivat päässeet läpi "tulevina".
  const start = helsinkiToday()
  // +30 pv lasketaan keskipäivän ankkurista, jotta kesäajan siirtymä ei
  // heittäisi loppupäivää vuorokaudella väärin.
  const end = new Date(new Date(`${start}T12:00:00Z`).getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
  return { start, end }
}

// VIBES.keywords ovat LUOKITTELIJAN hahmoja, eivät hakusanoja: '^x' tarkoittaa
// "tokenin alku" (lib/types.ts). LinkedEventsin `text=`-parametri ei tunne sitä
// merkkiä, joten '^yökerho' osui NOLLAAN riviin ja koko sivu jäi tyhjäksi.
// Mitattu: '^yökerho' 0 → 'yökerho' 11, '^baari' 0 → 'baari' 135,
// '^fest' 0 → 'fest' 435, '^kurssi' 0 → 'kurssi' 48.
const asSearchTerm = (kw: string) => kw.replace(/^\^/, '')

// Vain ikkunassa ALKAVAT. Tämä suodatin on koko korjauksen tärkein osa: sivulla
// ei ollut päivärajausta LAINKAAN, joten LinkedEventsin "yhä käynnissä" -rivit
// (vuosien vanhat näyttelyt ja roskarivit kuten start_time 0026-09-23) eivät
// vain vieneet tilaa vaan RENDERÖITYIVÄT tulevina tapahtumina — ja nouseva
// lajittelu nosti ne kärkeen. Mitattu /tapahtumat/museo näytti 17 tapahtumaa
// joista 17 oli menneitä, otsikon alla teksti "17 tapahtumaa seuraavan 30
// päivän aikana", ja schema.org-lohko julisti ne EventScheduled-tilaisina.
function startsWithin(e: PageEvent, start: string, end: string): boolean {
  const day = e.startTime?.slice(0, 10)
  return !!day && day >= start && day <= end
}

async function fetchByText(keywords: string[]): Promise<PageEvent[]> {
  const { start, end } = dateRange()
  const terms = [...new Set(keywords.slice(0, 2).map(asSearchTerm).filter(Boolean))]

  // Laskeva järjestys + sivutus. Nouseva lajittelu 30 rivin sivulla antoi
  // mitatusti 0/30 ikkunassa alkavaa sanoille museo, taide ja lapsi — koko
  // sivun sisältö oli vanhentunutta. Sivutus tarvitaan koska sivu näyttää 40
  // AIKAISIMMAN tapahtuman: pelkkä laskeva sivu 1 antaisi 30 päivän päässä
  // olevat, ei ensi viikon.
  const perTerm = await Promise.all(
    terms.map((text) =>
      fetchLinkedEventsAll<LEEvent>(
        (page) =>
          `https://api.hel.fi/linkedevents/v1/event/?${new URLSearchParams({
            text,
            format: 'json',
            start,
            end,
            page: String(page),
            page_size: String(LE_MAX_PAGE_SIZE),
            include: 'location,keywords',
            sort: '-start_time',
            division: 'helsinki',
          })}`,
        () => ({ next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }),
      ),
    ),
  )

  let events: PageEvent[] = []
  const seen = new Set<string>()
  for (const { rows } of perTerm) {
    for (const raw of rows) {
      if (seen.has(raw.id)) continue
      seen.add(raw.id)
      const ev = normalizeLE(raw)
      if (startsWithin(ev, start, end)) events.push(ev)
    }
  }

  // Kuratoitu järjestys, ks. lib/seo-curation.ts — mitään ei poisteta.
  events = curateForLanding(events)
  return events.slice(0, 40)
}

async function fetchByBbox(neighborhood: Neighborhood): Promise<PageEvent[]> {
  const { start, end } = dateRange()

  // Sama korjaus kuin fetchByTextissä: laskeva järjestys, sivutus ja
  // päivärajaus. Kaupunginosasivuilla oli täsmälleen sama muoto — nouseva
  // lajittelu, 50 rivin sivu ja ei päiväsuodatinta.
  const { rows } = await fetchLinkedEventsAll<LEEvent>(
    (page) =>
      `https://api.hel.fi/linkedevents/v1/event/?${new URLSearchParams({
        bbox: neighborhood.bbox,
        format: 'json',
        start,
        end,
        page: String(page),
        page_size: String(LE_MAX_PAGE_SIZE),
        include: 'location,keywords',
        sort: '-start_time',
      })}`,
    () => ({ next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }),
  )

  let events = rows.map(normalizeLE).filter((e) => startsWithin(e, start, end))
  // Kuratoitu järjestys, ks. lib/seo-curation.ts — mitään ei poisteta.
  events = curateForLanding(events)
  return events.slice(0, 40)
}

// AIKAVYÖHYKE PUUTTUI. Tämä sivu muotoili ajat omalla kopiollaan ilman
// timeZonea, jolloin palvelimen vyöhyke ratkaisi: Vercel ajaa UTC:ssä, joten
// klo 21.00 alkava keikka näkyi muodossa "klo 18.00" — kolme tuntia väärin
// kaikilla 25 kategoriasivulla. Mitattu 26.8.2026 samalla tapahtumalla:
// UTC "pe 11.9. klo 18.00" vs. Helsinki "pe 11.9. klo 21.00".
//
// Kolmella sisarsivulla (tanaan, viikonloppu, ilmaiset) timeZone oli jo
// mukana — vain tämä kopio jäi jälkeen, mikä on juuri se mitä kopioidulle
// logiikalle tapahtuu. Käytetään jaettua apufunktiota, joka hoitaa myös
// pelkän päivämäärän sisältävät rivit.

const VIBE_DESCRIPTIONS: Record<string, string> = {
  keikka:   'Helsingin parhaat live-keikat ja konsertit yhdessä paikassa. Tavastia, Circus Helsinki, On the Rocks, G Livelab ja kaikki muut keikkapaikat — ohjelma päivitetään automaattisesti päivittäin.',
  yoelama:  'Helsinki yöelämä — yökerhot, klubit, disko ja afterpartyt. Löydä parhaat bileet tänä iltana ja tulevina viikonloppuina Helsingissä.',
  baari:    'Pubikeikat, pubivisat, karaoke-illat ja baaritapahtumat Helsingissä. Löydä tänään paras baari- tai pub-ilta pääkaupunkiseudulla.',
  urheilu:  'Urheilutapahtumat Helsingissä: jalkapallopelit, jääkiekko-ottelut (HIFK, Jokerit), juoksukilpailut ja muut urheilutapahtumat. Ottelukalenteri aina ajan tasalla.',
  standup:  'Stand up -keikat ja komediaesitykset Helsingissä. Parhaat suomalaiset ja kansainväliset koomikot sekä avoin mikki -illat.',
  museo:    'Museot ja näyttelyt Helsingissä — Ateneum, Kiasma, HAM, Suomen kansallismuseo ja paljon muuta. Löydä ilmaiset ja maksulliset näyttelyt aukioloaikoineen.',
  lapset:   'Tapahtumat lapsille ja perheille Helsingissä: ilmaiset lastentapahtumat, satutunnit, luovuuspajat, lasten teatteriesitykset ja perhekonsertit.',
  tyopaja:  'Kurssit, työpajat ja koulutustapahtumat Helsingissä. Kuvaamataitoa, kokkikursseja, tanssia, käsitöitä — uusia taitoja ja elämyksiä kaikille.',
  teatteri: 'Teatteriesitykset ja tanssiesitykset Helsingissä. Kansallisteatteri, Helsingin kaupunginteatteri, Svenska Teatern, itsenäiset teatterit ja vierailevat ryhmät.',
  taide:    'Taidenäyttelyt ja galleriat Helsingissä. Kuvataidetta, valokuvaa, designia ja nykytaidetta — aukioloajat ja tapahtumat päivitetään automaattisesti.',
}

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return [
    ...VIBES.map((v) => ({ slug: v.id })),
    ...NEIGHBORHOODS.map((n) => ({ slug: n.id })),
  ]
}

// Käsin kirjoitetut kuvaukset korkean hakuvolyymin vibe-sivuille — muille
// vibeille käytetään alla olevaa mallia.
const VIBE_DESC_OVERRIDES: Record<string, string> = {
  keikka: 'Keikat Helsingissä: tulevat konsertit ja livemusiikki klubeilta areenoille — Tavastia, Kulttuuritalo, Olympiastadion ja pienet lavat yhdessä listassa.',
  yoelama: 'Yöelämä Helsingissä: klubit, DJ-illat, tekno ja live-illat — Kaiku, Ääniwalli, Post Bar ja muut yökerhot koottuna yhdeksi ohjelmaksi joka viikonloppu.',
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  const vibe = VIBES.find((v) => v.id === slug)
  if (vibe) {
    const desc = VIBE_DESC_OVERRIDES[slug]
      ?? `Kaikki ${vibe.label.toLowerCase()} tapahtumat Helsingissä. Löydä parhaat ${vibe.keywords.slice(0, 3).join(', ')} -tapahtumat aikatauluineen.`
    return {
      title: `${vibe.label} Helsinki – tapahtumat | Mitä tänään`,
      description: desc,
      alternates: { canonical: `${BASE}/tapahtumat/${slug}` },
      openGraph: { title: `${vibe.emoji} ${vibe.label} Helsinki`, description: desc, locale: 'fi_FI', type: 'website', url: `${BASE}/tapahtumat/${slug}` },
    }
  }

  const n = NEIGHBORHOODS.find((nb) => nb.id === slug)
  if (n) {
    const locative = NEIGHBORHOOD_INESSIVE[slug] || `${n.name}ssa`
    const desc = `Kaikki tapahtumat ${locative} – ${n.vibe}. Löydä tulevat tapahtumat, konsertit, näyttelyt ja muut menot ${n.name}sta.`
    return {
      title: `Tapahtumat ${locative} | Mitä tänään`,
      description: desc,
      alternates: { canonical: `${BASE}/tapahtumat/${slug}` },
      openGraph: { title: `${n.emoji} ${n.name} tapahtumat`, description: desc, locale: 'fi_FI', type: 'website', url: `${BASE}/tapahtumat/${slug}` },
    }
  }

  return {}
}

export default async function TapahtumaSivu({ params }: Props) {
  const { slug } = await params

  const vibe: Vibe | undefined = VIBES.find((v) => v.id === slug)
  const neighborhood: Neighborhood | undefined = NEIGHBORHOODS.find((n) => n.id === slug)

  if (!vibe && !neighborhood) notFound()

  const events = vibe
    ? (await fetchByText(vibe.keywords)).filter((e) =>
        // Yksi totuus: sama kerroksellinen luokittelu kuin sovelluksessa
        // (lib/event-classify) — tekstihaku tuo kandidaatit, classifyEvent
        // rajaa ne oikeaan kategoriaan (vetot mukaan lukien)
        classifyEvent({
          title: e.title,
          shortDescription: e.shortDescription,
          categories: e.categories,
          ysoIds: e.ysoIds,
          location: { name: e.venue },
        }).includes(slug)
      )
    : await fetchByBbox(neighborhood!)

  const pageTitle = vibe
    ? `${vibe.emoji} ${vibe.label} Helsingissä`
    : `${neighborhood!.emoji} Tapahtumat ${NEIGHBORHOOD_INESSIVE[slug] || neighborhood!.name + 'ssa'}`

  const pageSubtitle = vibe
    ? `${events.length} tapahtumaa seuraavan 30 päivän aikana`
    : neighborhood!.vibe

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: pageTitle,
    url: `${BASE}/tapahtumat/${slug}`,
    numberOfItems: events.length,
    itemListElement: events.slice(0, 15).map((e, i) => ({
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
          name: e.venue || 'Helsinki',
          address: { '@type': 'PostalAddress', streetAddress: e.address, addressLocality: 'Helsinki', addressCountry: 'FI' },
        },
        ...(e.isFree
          ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }
          : e.ticketUrl
          ? { offers: { '@type': 'Offer', url: e.ticketUrl, priceCurrency: 'EUR' } }
          : {}),
        url: `${BASE}/e/${encodeURIComponent(e.id)}`,
      },
    })),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Tapahtumat', item: `${BASE}/tapahtumat` },
      { '@type': 'ListItem', position: 3, name: vibe ? vibe.label : neighborhood!.name, item: `${BASE}/tapahtumat/${slug}` },
    ],
  }

  const staticDesc = vibe
    ? VIBE_DESCRIPTIONS[vibe.id]
    : `Kaikki tapahtumat ${NEIGHBORHOOD_INESSIVE[slug] || neighborhood!.name + 'ssa'} — ${neighborhood!.vibe}. Löydä tulevat tapahtumat, konsertit, näyttelyt ja muut menot ${neighborhood!.name}sta.`

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* Sovellusnäkymä suodatin valmiiksi päällä — sama tila kuin jos käyttäjä
          painaisi tunnelma- tai kaupunginosasirua etusivulla. Päiväikkuna on
          'week' eikä oletus 'today', koska kapealla tunnelmalla yksi päivä on
          usein tyhjä: mitattu 26.8.2026 underground 1 tapahtuma / 30 pv, museo 4.
          Viikko on jo esiladattu, joten siitä ei tule lisäkuormaa. */}
      <HomeShell
        initialVibes={vibe ? [vibe.id] : undefined}
        initialHood={neighborhood ? slug : undefined}
        initialDateFilter="week"
      />

      {/* Sivun oma sisältö sovelluksen alla. TÄMÄ ON SIVUN HAKUKONEARVO: 30
          päivän kuratoitu lista, kuvausteksti ja ristiinlinkit. Sovellusnäkymä
          näyttää viikon; tämä lista jatkaa siitä eteenpäin, joten se ei ole
          toistoa vaan sivun pidempi aikajänne. H1 on ruudunlukijoille ja
          Googlelle — sovelluksella on jo oma otsikkorivinsä. */}
      <section className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <h1 className="sr-only">{pageTitle}</h1>
        <p className="text-sm text-white/35 leading-relaxed">{pageSubtitle}</p>
        {staticDesc && (
          <p className="mt-3 text-[13px] text-white/28 leading-relaxed">{staticDesc}</p>
        )}

        {events.length > 0 && (
          <>
            <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mt-8 mb-3">
              Tulevat <span className="text-white/30 font-bold">· {events.length} · 30 päivää</span>
            </h2>
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id}>
                  <Link href={`/e/${encodeURIComponent(e.id)}`}
                    className="flex items-start gap-3 rounded-xl p-3 transition-colors group"
                    style={{ background: 'rgba(255,255,255,.04)' }}>
                    {e.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.image} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white/90 group-hover:text-blue-300 transition-colors line-clamp-2 leading-snug text-[14px]">
                        {e.title}
                      </h3>
                      <p className="text-[12px] text-white/35 mt-1">
                        {formatEventDate(e.startTime)}
                        {e.venue && <span className="text-white/25"> • {e.venue}</span>}
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

        {/* Ristiinlinkit — sisäinen linkitys on osa näiden sivujen hakukonearvoa,
            joten ne säilyvät kehyksen vaihtuessa. */}
        <p className="text-xs text-white/30 uppercase tracking-wider mt-8 mb-2">
          {vibe ? 'Muut kategoriat' : 'Muut alueet'}
        </p>
        <div className="flex flex-wrap gap-2">
          {vibe
            ? VIBES.filter((v) => v.id !== slug).map((v) => (
                <Link key={v.id} href={`/tapahtumat/${v.id}`}
                  className="text-sm px-3 py-1.5 rounded-full transition-colors hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>
                  {v.emoji} {v.label}
                </Link>
              ))
            : NEIGHBORHOODS.filter((n) => n.id !== slug && n.municipality === neighborhood!.municipality).map((n) => (
                <Link key={n.id} href={`/tapahtumat/${n.id}`}
                  className="text-sm px-3 py-1.5 rounded-full transition-colors hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>
                  {n.emoji} {n.name}
                </Link>
              ))}
        </div>

        {neighborhood && (
          <>
            <p className="text-xs text-white/30 uppercase tracking-wider mt-6 mb-2">Kategoriat</p>
            <div className="flex flex-wrap gap-2">
              {VIBES.map((v) => (
                <Link key={v.id} href={`/tapahtumat/${v.id}`}
                  className="text-sm px-3 py-1.5 rounded-full transition-colors hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,.045)', color: 'rgba(255,255,255,.6)' }}>
                  {v.emoji} {v.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  )
}
