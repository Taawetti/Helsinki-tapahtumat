import HomeClient from '@/components/HomeClient'
import { fetchInitialEvents } from '@/lib/fetchInitialEvents'
import { getDateRange } from '@/lib/utils'

export default async function Page() {
  const todayRange   = getDateRange('today')
  const tomorrowRange = getDateRange('tomorrow')
  const weekendRange = getDateRange('weekend')
  const weekRange    = getDateRange('week')

  const [todayData, tomorrowData, weekendData, weekData] = await Promise.all([
    fetchInitialEvents(todayRange.start,   todayRange.end),
    fetchInitialEvents(tomorrowRange.start, tomorrowRange.end),
    fetchInitialEvents(weekendRange.start, weekendRange.end),
    fetchInitialEvents(weekRange.start,    weekRange.end),
  ])

  return (
    <HomeClient
      preloadedData={{
        today:    { start: todayRange.start,    end: todayRange.end,    events: todayData.events,    total: todayData.total    },
        tomorrow: { start: tomorrowRange.start, end: tomorrowRange.end, events: tomorrowData.events, total: tomorrowData.total },
        weekend:  { start: weekendRange.start,  end: weekendRange.end,  events: weekendData.events,  total: weekendData.total  },
        week:     { start: weekRange.start,     end: weekRange.end,     events: weekData.events,     total: weekData.total     },
      }}
    />
  )
}
