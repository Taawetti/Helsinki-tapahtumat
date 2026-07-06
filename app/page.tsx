import HomeClient from '@/components/HomeClient'
import { fetchInitialEvents } from '@/lib/fetchInitialEvents'

export default async function Page() {
  const today = new Date().toISOString().split('T')[0]
  const { events, total } = await fetchInitialEvents(today)
  return <HomeClient initialEvents={events} initialTotal={total} serverDate={today} />
}
