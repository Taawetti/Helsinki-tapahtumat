// Jaettu pakanrakennus ryhmäpäätöskoneelle — /api/group/create ja
// /api/group/[code]/rematch käyttävät molemmat tätä. Hakee ehdokaslähteet
// (tapahtumat, ravintolat, aktiviteetit, arvosanat) rinnakkain sisäisillä
// HTTP-kutsuilla ja kokoaa kuratoidun swaippauspakan.
import { getDateRange } from '@/lib/utils'
import { buildDeck } from '@/lib/candidate'
import type { Candidate, GroupWhen, Fiilis, DeckInput } from '@/lib/candidate'
import type { Event, Restaurant, Activity, DateFilter } from '@/lib/types'

const WHEN_TO_FILTER: Record<GroupWhen, DateFilter> = { tonight: 'tonight', day: 'today', weekend: 'weekend' }

export async function buildGroupDeck(origin: string, when: GroupWhen, fiilis: Fiilis[]): Promise<Candidate[]> {
  const { start, end, startAfter } = getDateRange(WHEN_TO_FILTER[when])
  const evParams = new URLSearchParams({ start, end, page: '1', municipality: 'helsinki', quick: '1' })
  if (startAfter) evParams.set('startAfter', startAfter)

  // Yksittäisen lähteen kaatuminen ei estä pakkaa.
  const j = async <T,>(url: string, fallback: T): Promise<T> => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) })
      if (!r.ok) return fallback
      return (await r.json()) as T
    } catch { return fallback }
  }
  const [ev, rest, act, rat] = await Promise.all([
    j<{ events: Event[] }>(`${origin}/api/events?${evParams}`, { events: [] }),
    j<{ restaurants: Restaurant[] }>(`${origin}/api/restaurants`, { restaurants: [] }),
    j<{ activities: Activity[] }>(`${origin}/api/activities`, { activities: [] }),
    j<{ ratings: Record<string, { rating: number; reviewCount: number }> }>(`${origin}/api/venue-ratings`, { ratings: {} }),
  ])

  const activityRatings = new Map<string, { rating: number; reviewCount: number }>()
  for (const [k, v] of Object.entries(rat.ratings ?? {})) activityRatings.set(k, { rating: v.rating, reviewCount: v.reviewCount })

  const input: DeckInput = {
    events: ev.events ?? [],
    restaurants: rest.restaurants ?? [],
    activities: act.activities ?? [],
    activityRatings,
  }
  return buildDeck(input, { when, fiilis, size: 24 })
}
