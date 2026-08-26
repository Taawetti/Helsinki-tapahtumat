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

  const [todayData, tomorrowData, weekendData, weekData] = await Promise.all([
    fetchInitialEvents(todayRange.start,    todayRange.end),
    fetchInitialEvents(tomorrowRange.start, tomorrowRange.end),
    fetchInitialEvents(weekendRange.start,  weekendRange.end),
    fetchInitialEvents(weekRange.start,     weekRange.end),
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
