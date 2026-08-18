import type { Metadata } from 'next'
import Link from 'next/link'
import { helsinkiDateOf, helsinkiDateRange } from '@/lib/helsinki-time'

export const revalidate = 900 // 15 min — lähdeterveys tuoreena ilman jatkuvaa fan-outia

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC =
  'Kaikkien 41 tapahtumalähteen tila nyt: mitkä lähteet vastaavat ja paljonko tapahtumia kukin tuottaa. Läpinäkyvyys: näytämme itse, kun lähde rikkoutuu.'

export const metadata: Metadata = {
  title: 'Lähteet kunnossa — Mitä tänään',
  description: DESC,
  alternates: { canonical: `${BASE}/lahteet` },
  openGraph: {
    title: '📡 Lähteet kunnossa — Mitä tänään',
    description: DESC,
    locale: 'fi_FI',
    type: 'website',
    url: `${BASE}/lahteet`,
  },
}

interface SourceStat {
  name: string
  ok: boolean
  count: number
}

interface AggregatePayload {
  events?: { startTime: string }[]
  total?: number
  generatedAt?: string
  sources?: SourceStat[]
}

// Ystävälliset nimet julkiselle sivulle — aggregaatin tekniset avaimet
// (app/api/events/route.ts EXTERNAL_SOURCES) eivät kerro ulkopuoliselle
// mitään. Avaimet joita ei ole listattu näytetään sellaisenaan.
const SOURCE_LABELS: Record<string, string> = {
  'linked-events': 'Helsingin tapahtumarajapinta',
  ticketmaster: 'Ticketmaster',
  fienta: 'Fienta',
  billetto: 'Billetto',
  meetup: 'Meetup',
  rss: 'RSS-syötteet',
  venues: 'Keikkapaikkojen omat ohjelmat',
  culture: 'Kulttuuritalojen ohjelmat',
  espoo: 'Espoon tapahtumat',
  helmet: 'Helmet-kirjastot',
  ilmonet: 'Ilmonet',
  finna: 'Finna (museot & arkistot)',
  visitfinland: 'Visit Finland',
  sports: 'Urheilusarjojen otteluohjelmat',
  festivals: 'Festivaalit',
  theatre: 'Kansallisteatteri ym. teatterit',
  bars: 'Baarien ohjelmat',
  ra: 'Resident Advisor',
  museums: 'Taidemuseot',
  liiga: 'Jääkiekkoliiga',
  kide: 'Kide.app',
  arenas: 'Olympiastadion & areenat',
  recurring: 'Toistuvat tapahtumat',
  pubivisat: 'Pubivisat',
  stadissa: 'Stadissa.fi',
  myhelsinki: 'MyHelsinki',
  openings: 'Avajaiset (Google News)',
  allas: 'Allas Sea Pool',
  lippu: 'Lippu.fi / Eventim',
  scraped: 'Venue-ohjelmat (yhdistetty)',
  flyingdutchman: 'Flying Dutchman',
  juttutupa: 'Juttutupa',
  lepakkomies: 'Lepakkomies',
  glivelab: 'G Livelab',
  kulttuuritalo: 'Kulttuuritalo',
  postbar: 'Post Bar',
  korjaamo: 'Korjaamo',
  malmitalo: 'Malmitalo',
  vuotalo: 'Vuotalo',
  savoy: 'Savoy-teatteri',
  nauramaan: 'Nauramaan',
  siltanen: 'Siltanen',
}

interface SourceHealthResult {
  payload: AggregatePayload
  /** Minuuttia generatedAt-aikaleimasta — laskettu haun yhteydessä, ei renderissä
   *  (Date.now() renderissä rikkoisi React Compiler -puhtaussäännön). */
  minutesAgo: number | null
}

async function fetchSourceHealth(): Promise<SourceHealthResult | null> {
  // TÄYSI fan-out (ei quick=1): sources-tila syntyy vasta kun kaikki
  // EXTERNAL_SOURCES on haettu — quick-haku palauttaisi vain linked-eventsin.
  // Sama start..+6d-ikkuna kuin lähdeterveyden kanarialla
  // (lib/source-health.ts checkSourceHealth).
  const { start, end } = helsinkiDateRange(6)
  const params = new URLSearchParams({ start, end, page: '1', municipality: 'helsinki' })
  try {
    const res = await fetch(`${BASE}/api/events?${params}`, {
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) return null
    const payload = (await res.json()) as AggregatePayload
    const minutesAgo = payload.generatedAt
      ? Math.max(0, Math.round((Date.now() - new Date(payload.generatedAt).getTime()) / 60000))
      : null
    return { payload, minutesAgo }
  } catch {
    return null
  }
}

export default async function LahteetSivu() {
  const { start } = helsinkiDateRange(6)
  const result = await fetchSourceHealth()
  const payload = result?.payload ?? null

  const sources = payload?.sources ?? []
  const okSources = sources.filter((s) => s.ok)
  const failedSources = sources.filter((s) => !s.ok)
  const total7d = payload?.total ?? payload?.events?.length ?? 0
  const todayCount = (payload?.events ?? []).filter((e) => helsinkiDateOf(e.startTime) === start).length

  const generatedAt = payload?.generatedAt ? new Date(payload.generatedAt) : null
  const minutesAgo = result?.minutesAgo ?? null
  const checkedLabel = generatedAt
    ? `klo ${generatedAt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' })} (${minutesAgo === 0 ? 'juuri nyt' : `${minutesAgo} min sitten`})`
    : null

  const allOk = sources.length > 0 && failedSources.length === 0

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-gray-300 transition-colors">Mitä tänään</Link>
          <span>/</span>
          <span className="text-white">Lähteet</span>
        </nav>

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">📡 Lähteet kunnossa</h1>
          <p className="text-gray-400">
            Kaikkien tapahtumalähteiden tila juuri nyt — julkisesti, sellaisena kuin se on.
          </p>
        </div>

        {/* Status banner */}
        {payload === null ? (
          <div className="mb-6 px-4 py-4 rounded-xl bg-gray-900 border border-gray-700 text-gray-300 text-sm">
            Lähdetietoja ei saatu juuri nyt haettua — sivu tarkistaa tilan automaattisesti uudelleen
            15 minuutin kuluttua.
          </div>
        ) : allOk ? (
          <div className="mb-6 px-4 py-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 font-semibold">
            ✓ Kaikki {sources.length} lähdettä kunnossa
          </div>
        ) : (
          <div className="mb-6 px-4 py-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300">
            <p className="font-semibold">⚠ {failedSources.length} lähdettä ei vastaa</p>
            <p className="text-sm mt-1 text-orange-200/80">
              {failedSources.map((s) => SOURCE_LABELS[s.name] ?? s.name).join(', ')} — muu ohjelma
              näkyy normaalisti, mutta näiden lähteiden tapahtumat voivat puuttua.
            </p>
          </div>
        )}

        {/* Key numbers */}
        {payload !== null && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
            <div className="bg-gray-900 rounded-xl p-3">
              <p className="text-2xl font-bold">{todayCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">tapahtumaa tänään</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3">
              <p className="text-2xl font-bold">{total7d}</p>
              <p className="text-xs text-gray-500 mt-0.5">tapahtumaa 7 pv</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3">
              <p className="text-2xl font-bold">
                {okSources.length}<span className="text-gray-500 text-lg">/{sources.length}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">lähdettä vastaa</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3">
              <p className="text-2xl font-bold">{minutesAgo !== null ? `${minutesAgo} min` : '—'}</p>
              <p className="text-xs text-gray-500 mt-0.5">sitten tarkistettu</p>
            </div>
          </div>
        )}

        {/* Source table — kunnossa olevat ensin, rikkinäiset loppuun */}
        {sources.length > 0 && (
          <table className="w-full text-sm mb-8">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="py-2 pr-4 font-medium">Lähde</th>
                <th className="py-2 pr-4 font-medium">Tila</th>
                <th className="py-2 font-medium text-right">Tapahtumia (7 pv)</th>
              </tr>
            </thead>
            <tbody>
              {[...okSources, ...failedSources].map((s) => (
                <tr key={s.name} className="border-b border-gray-900">
                  <td className="py-2 pr-4">
                    {SOURCE_LABELS[s.name] ?? s.name}
                    {SOURCE_LABELS[s.name] && (
                      <span className="text-gray-600 text-xs ml-1.5">{s.name}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {s.ok ? (
                      <span className="text-green-400">✓ Kunnossa</span>
                    ) : (
                      <span className="text-red-400">✗ Ei vastausta</span>
                    )}
                  </td>
                  <td className={`py-2 text-right ${s.ok && s.count === 0 ? 'text-yellow-400' : 'text-gray-300'}`}>
                    {s.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Selite — miksi tämä sivu on olemassa */}
        <div className="bg-gray-900 rounded-xl p-5 mb-8 text-sm text-gray-400 leading-relaxed space-y-3">
          <h2 className="text-white font-semibold">Miksi tämä sivu on olemassa?</h2>
          <p>
            Mitä tänään kerää Helsingin tapahtumaohjelman {sources.length > 0 ? `${sources.length} ` : ''}eri
            lähteestä — kaupungin avoimesta rajapinnasta lippukauppoihin, keikkapaikkojen omiin
            ohjelmiin ja pieniin klubeihin. Tämä sivu näyttää jokaisen lähteen tilan julkisesti.
          </p>
          <p>
            Läpinäkyvyys on tarkoituksellista: jos jokin lähde rikkoutuu tai lakkaa vastaamasta,
            se näkyy tässä heti — emme piilota vikoja. Tarkistus tehdään 15 minuutin välein
            hakemalla koko tapahtuma-aggregaatti, eli täsmälleen sama data joka näkyy myös
            sovelluksen etusivulla.
          </p>
          <p>
            Huom: nolla tapahtumaa ei aina tarkoita vikaa — osa lähteistä on kausiluonteisia tai
            tuottaa tapahtumia vain tiettyinä viikonpäivinä. Vastaamaton lähde (✗) sen sijaan on
            aina oikea häiriö.
            {checkedLabel && <> Tila tarkistettu {checkedLabel}.</>}
          </p>
        </div>

        <div className="pt-6 border-t border-gray-800 flex items-center justify-between gap-4">
          <Link href="/" className="text-blue-400 hover:text-blue-300 transition-colors text-sm">
            ← Kaikki Helsinki tapahtumat
          </Link>
          <Link href="/tapahtumat/tanaan" className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
            Mitä tänään tapahtuu →
          </Link>
        </div>
      </div>
    </main>
  )
}
