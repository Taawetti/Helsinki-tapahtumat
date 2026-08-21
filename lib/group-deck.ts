// Jaettu pakanrakennus ryhmäpäätöskoneelle — /api/group/create ja
// /api/group/[code]/rematch käyttävät molemmat tätä. Hakee ehdokaslähteet
// (tapahtumat, ravintolat, aktiviteetit, arvosanat) rinnakkain sisäisillä
// HTTP-kutsuilla ja kokoaa kuratoidun swaippauspakan.
import { getDateRange } from '@/lib/utils'
import { NEIGHBORHOODS } from '@/lib/types'
import { buildDeck } from '@/lib/candidate'
import { fetchRainExpected } from '@/lib/weather'
import { normalizeHelsinkiTimestamp } from '@/lib/helsinki-time'
import type { Candidate, GroupWhen, DeckInput, BudgetId } from '@/lib/candidate'
import type { Event, Restaurant, Activity, DateFilter } from '@/lib/types'

const WHEN_TO_FILTER: Record<GroupWhen, DateFilter> = { tonight: 'tonight', day: 'today', weekend: 'weekend' }

export interface DeckBuildOptions {
  customStart?: string | null   // v3: oma päivävalinta ohittaa when-esivalinnan
  customEnd?: string | null
  budget?: BudgetId
  areas?: string[]              // v3.1: valitut alueet (tyhjä = koko kaupunki)
  excludeIds?: Set<string>      // rematch: edellisen kierroksen kortit pois pakasta
}

export async function buildGroupDeck(origin: string, when: GroupWhen, fiilis: string[], opts: DeckBuildOptions = {}): Promise<Candidate[]> {
  let start: string
  let end: string
  let startAfter: string | undefined
  if (opts.customStart) {
    // Oma päivävalinta — käytetään suoraan (ei startAfter-karsintaa tuleville päiville)
    start = opts.customStart
    end = opts.customEnd ?? opts.customStart
  } else {
    const r = getDateRange(WHEN_TO_FILTER[when])
    start = r.start
    end = r.end
    startAfter = r.startAfter
  }

  // Kunnat valittujen alueiden mukaan: pelkät Helsinki-alueet → helsinki;
  // Espoo/Vantaa mukana → haetaan myös niiden division-tapahtumat.
  // (LinkedEvents jakaa kunnittain; ravintolat/aktiviteetit ovat pk-seutu-
  // painotteita joka tapauksessa — aluesuodatin hoitaa loput bbox:lla.)
  const areas = opts.areas ?? []
  const municipalities = [...new Set(
    areas
      .map(id => NEIGHBORHOODS.find(n => n.id === id)?.municipality)
      .filter((m): m is string => Boolean(m)),
  )]
  const munisToFetch = municipalities.length > 0 ? municipalities : ['helsinki']

  const eventFetches = munisToFetch.map(muni => {
    const evParams = new URLSearchParams({ start, end, page: '1', municipality: muni, quick: '1' })
    if (startAfter) evParams.set('startAfter', startAfter)
    return `${origin}/api/events?${evParams}`
  })

  // KLUBILÄHTEET: quick=1 hakee vain LinkedEvents-rungon, joten klubikeikat
  // (Resident Advisor, Ticketmaster, Fienta, Billetto, Lippu.fi) eivät koskaan
  // päätyneet ryhmäpäätöspakkaan (käyttäjätapaus 8/2026: "valitsin keikat/
  // klubit lauantaille, eikä pakassa ollut keikkoja"). Haetaan ne erikseen
  // rinnakkain — jokainen reitti vastaa nopeasti omasta lähteestään, ja
  // buildDeck deduppaa otsikoiden perusteella.
  const CLUB_SOURCES = ['ra', 'ticketmaster', 'fienta', 'billetto', 'lippu']
  const clubParams = new URLSearchParams({ start, end })
  const clubFetches = CLUB_SOURCES.map(name => `${origin}/api/${name}?${clubParams}`)

  // Yksittäisen lähteen kaatuminen ei estä pakkaa.
  const j = async <T,>(url: string, fallback: T): Promise<T> => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) })
      if (!r.ok) return fallback
      return (await r.json()) as T
    } catch { return fallback }
  }
  const [rest, act, rat, weather, ...eventResponses] = await Promise.all([
    j<{ restaurants: Restaurant[] }>(`${origin}/api/restaurants`, { restaurants: [] }),
    j<{ activities: Activity[] }>(`${origin}/api/activities`, { activities: [] }),
    j<{ ratings: Record<string, { rating: number; reviewCount: number }> }>(`${origin}/api/venue-ratings`, { ratings: {} }),
    fetchRainExpected(start).catch(() => null), // sade-ennuste pakan päivälle (ei avainta)
    ...[...eventFetches, ...clubFetches].map(url => j<{ events: Event[] }>(url, { events: [] })),
  ])

  const activityRatings = new Map<string, { rating: number; reviewCount: number }>()
  for (const [k, v] of Object.entries(rat.ratings ?? {})) activityRatings.set(k, { rating: v.rating, reviewCount: v.reviewCount })

  const input: DeckInput = {
    // AIKAVYÖHYKE: klubilähteet haetaan tässä SUORAAN (ohi /api/events-
    // aggregaatin), joten niiden naiivit aikaleimat eivät ole käyneet
    // normalisoinnin läpi. Ilman tätä esim. "2026-08-22T23:30:00" luetaan
    // UTC-palvelimella 02:30 Helsinkiä seuraavana päivänä → klubi-ilta
    // putoaa illan pakasta ja näkyy väärällä päivällä.
    events: eventResponses.flatMap(e => (e.events ?? []).map(ev => ({
      ...ev,
      startTime: normalizeHelsinkiTimestamp(ev.startTime) ?? ev.startTime,
      endTime: normalizeHelsinkiTimestamp(ev.endTime),
    }))),
    restaurants: rest.restaurants ?? [],
    activities: act.activities ?? [],
    activityRatings,
  }
  // Siemen: jokainen pakanrakennus on oma satunnaisuutensa → eri sessioilla ja
  // eri kierroksilla eri pakka (samaa siementä ei tallenneta; pakka itsessään
  // on session snapshot, joten ryhmä näkee aina identtisen pakankaistansa).
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return buildDeck(input, { when, fiilis, size: 24, budget: opts.budget, areas, weather, seed, excludeIds: opts.excludeIds })
}
