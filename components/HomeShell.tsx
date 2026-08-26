// Etusivun palvelinkuori. Jaettu suomenkielisen "/" ja englanninkielisen "/en"
// välillä, jotta molemmat sivut hakevat datan täsmälleen samalla tavalla eikä
// kieliversioiden välille pääse syntymään eroa.

import HomeClient from '@/components/HomeClient'
import type { GuideSlug, GuidePayload } from '@/components/GuideInlineView'
import { fetchInitialEvents } from '@/lib/fetchInitialEvents'
import { getDateRange } from '@/lib/utils'

/** @param initialGuide  Avaa sovelluksen suoraan tähän opasnäkymään.
 *  @param initialGuideData  Palvelimella haettu data samalle oppaalle, jotta
 *    Googlelle lähtevä HTML sisältää listan eikä tyhjää kuorta. */
export default async function HomeShell({ initialGuide, initialGuideData, heroAsHeading }: {
  initialGuide?: GuideSlug
  initialGuideData?: GuidePayload
  /** Ks. HomeClient: laskeutumissivu tuo oman h1:nsä, jolloin sovelluksen
   *  kaupunkiotsikko ei saa olla h1. Oletus päätellään initialGuidesta,
   *  jotta jo muunnetut sivut korjautuvat ilman erillistä lippua. */
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
      heroAsHeading={heroAsHeading ?? !initialGuide}
      preloadedData={{
        today:    { start: todayRange.start,    end: todayRange.end,    events: todayData.events,    total: todayData.total    },
        tomorrow: { start: tomorrowRange.start, end: tomorrowRange.end, events: tomorrowData.events, total: tomorrowData.total },
        weekend:  { start: weekendRange.start,  end: weekendRange.end,  events: weekendData.events,  total: weekendData.total  },
        week:     { start: weekRange.start,     end: weekRange.end,     events: weekData.events,     total: weekData.total     },
      }}
    />
  )
}
