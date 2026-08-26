// Etusivun palvelinkuori. Jaettu suomenkielisen "/" ja englanninkielisen "/en"
// välillä, jotta molemmat sivut hakevat datan täsmälleen samalla tavalla eikä
// kieliversioiden välille pääse syntymään eroa.

import HomeClient from '@/components/HomeClient'
import type { GuideSlug, GuidePayload } from '@/components/GuideInlineView'
import { fetchInitialEvents } from '@/lib/fetchInitialEvents'
import { getDateRange } from '@/lib/utils'
import type { DateFilter, PriceFilter } from '@/lib/types'

/** @param initialGuide  Avaa sovelluksen suoraan tähän opasnäkymään.
 *  @param initialGuideData  Palvelimella haettu data samalle oppaalle, jotta
 *    Googlelle lähtevä HTML sisältää listan eikä tyhjää kuorta. */
export default async function HomeShell({ initialGuide, initialGuideData, initialVibes, initialHood, initialPriceFilter, initialMode, initialDateFilter, heroAsHeading }: {
  initialGuide?: GuideSlug
  initialGuideData?: GuidePayload
  /** Ks. HomeClient. Kategoriasivu avaa sovelluksen tunnelmasuodatin päällä. */
  initialVibes?: string[]
  initialHood?: string | null
  initialPriceFilter?: PriceFilter
  initialMode?: 'discover' | 'uutta'
  initialDateFilter?: DateFilter
  /** Ks. HomeClient: laskeutumissivu tuo oman h1:nsä, jolloin sovelluksen
   *  kaupunkiotsikko ei saa olla h1. Oletus päätellään laskeutumislipuista:
   *  MIKÄ TAHANSA niistä tarkoittaa laskeutumissivua. Ehdosta puuttui aluksi
   *  initialDateFilter, ja juuri ne neljä sivua jotka välittävät pelkän
   *  päiväsuodattimen (tanaan, viikonloppu ja niiden englanninkieliset
   *  vastineet) saivat kaksi h1:tä — kattava tarkistus paljasti sen. */
  heroAsHeading?: boolean
} = {}) {
  const todayRange    = getDateRange('today')
  const tomorrowRange = getDateRange('tomorrow')
  const weekendRange  = getDateRange('weekend')
  const weekRange     = getDateRange('week')

  // ── MITÄ ESILADATAAN ────────────────────────────────────────────────────
  // Etusivu esilataa kaikki neljä päiväikkunaa, koska käyttäjä voi painaa mitä
  // tahansa siruista heti. Laskeutumissivu avautuu YHTEEN tiettyyn tilaan,
  // joten se tarvitsee vain sen yhden.
  //
  // MIKSI TÄMÄ ON TÄRKEÄÄ. Kun 47 laskeutumissivua muutettiin 26.8.2026
  // avautumaan sovellusnäkymään, jokainen niistä alkoi hakea neljä ikkunaa
  // palvelimella tunnin välein uusiutuen. Se nelinkertaisti palvelintyön
  // sivua kohden, ja samana päivänä Vercelin laskenta-aika loppui kesken
  // (FAIR_USE_LIMITS_EXCEEDED, fluidCpuDuration) ja koko sivusto sulkeutui.
  // Käyttäjä ei menetä mitään: hakemattomat ikkunat haetaan normaalisti
  // selaimessa jos hän vaihtaa päivää, kuten 'month'-ikkunan kanssa on aina
  // tehty. Tyhjä lista ohitetaan välimuistin siemennyksessä (HomeClient),
  // joten se putoaa suoraan tavalliseen hakuun.
  const tarvitaan: DateFilter[] = initialDateFilter
    ? [initialDateFilter]
    : (initialGuide || initialVibes?.length || initialHood || initialMode)
      ? ['today']
      : ['today', 'tomorrow', 'weekend', 'week']

  const tyhja = { events: [], total: 0 }
  const hae = (f: DateFilter, start: string, end: string) =>
    tarvitaan.includes(f) ? fetchInitialEvents(start, end) : Promise.resolve(tyhja)

  const [todayData, tomorrowData, weekendData, weekData] = await Promise.all([
    hae('today',    todayRange.start,    todayRange.end),
    hae('tomorrow', tomorrowRange.start, tomorrowRange.end),
    hae('weekend',  weekendRange.start,  weekendRange.end),
    hae('week',     weekRange.start,     weekRange.end),
  ])

  return (
    <HomeClient
      initialGuide={initialGuide}
      initialGuideData={initialGuideData}
      initialVibes={initialVibes}
      initialHood={initialHood}
      initialPriceFilter={initialPriceFilter}
      initialMode={initialMode}
      initialDateFilter={initialDateFilter}
      heroAsHeading={heroAsHeading ?? !(initialGuide || initialVibes?.length || initialHood || initialPriceFilter || initialMode || initialDateFilter)}
      preloadedData={{
        today:    { start: todayRange.start,    end: todayRange.end,    events: todayData.events,    total: todayData.total    },
        tomorrow: { start: tomorrowRange.start, end: tomorrowRange.end, events: tomorrowData.events, total: tomorrowData.total },
        weekend:  { start: weekendRange.start,  end: weekendRange.end,  events: weekendData.events,  total: weekendData.total  },
        week:     { start: weekRange.start,     end: weekRange.end,     events: weekData.events,     total: weekData.total     },
      }}
    />
  )
}
