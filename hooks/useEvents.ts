import { useState, useEffect, useCallback, useRef } from 'react'
import { Event, DateFilter, SourceStatus, CATEGORIES } from '@/lib/types'
import { getDateRange, haversineKm } from '@/lib/utils'
import { haeKahdessaVaiheessa, tapahtumaHakuParams, ESILADATTAVAT } from '@/lib/events-fetch'
import { getCategoryScores, virtualStartTime } from '@/lib/preferences'
import type { GeoCoords } from './useGeolocation'

/** seed = palvelimen esirenderöimä LinkedEvents-siemen (HomeClient
 *  preloadEventsCache): OSITTAINEN data, ei koskaan lopullinen. Käsitellään
 *  kuin pikatulos — näytetään vain jos täysi haku ei ehdi armonajassa. */
interface CacheEntry { events: Event[]; hasMore: boolean; total: number; ts: number; generatedAt?: string; sources?: SourceStatus[]; seed?: boolean }
type EventsResponse = { events: Event[]; hasMore: boolean; total: number; generatedAt?: string; sources?: SourceStatus[] }
const eventsCache = new Map<string, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000
// v4: aikaleimojen normalisointi (naiivi → Helsinki-offset). v3-entryissä on
// normalisoimattomia aikoja, jotka näkyisivät paluukäyttäjälle vielä 30 min
// julkaisun jälkeen väärällä päivällä ja puuttuisivat Illalla-näkymästä.
const LS_PREFIX = 'events-v4-'
const LS_TTL = 30 * 60 * 1000

// One-time sweep of the previous cache generation's keys (they'd never be
// read again and would sit in localStorage as dead weight)
if (typeof window !== 'undefined') {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith('events-v2-') || k?.startsWith('events-v3-')) localStorage.removeItem(k)
    }
  } catch {}
}

// ts override: pass a stale timestamp to serve seeded data instantly while
// still triggering a background revalidation against the full source fan-out.
export function preloadEventsCache(key: string, events: Event[], total: number, ts?: number): void {
  if (eventsCache.has(key)) return
  // Prefer an unexpired localStorage entry over the seed: it came from a full
  // 40-source fan-out, while seeds are a LinkedEvents-only subset. Seeding
  // first would block useEvents' localStorage restore for the same key.
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (raw) {
      const entry: CacheEntry = JSON.parse(raw)
      if (Date.now() - entry.ts < LS_TTL) {
        eventsCache.set(key, entry)
        return
      }
    }
  } catch {}
  eventsCache.set(key, { events, hasMore: false, total, ts: ts ?? Date.now(), seed: true })
}

interface UseEventsOptions {
  dateFilter: DateFilter
  customDate?: string
  customDateEnd?: string
  keyword: string
  municipality: string
  activeCategories: string[]
  bbox?: string
  nearbyCoords?: GeoCoords | null
}

interface UseEventsResult {
  events: Event[]
  loading: boolean
  fetchingFull: boolean
  /** Näkyvä lista on osittainen (pikatulos/siemen) ja täysi haku kesken. */
  osittainen: boolean
  error: string | null
  hasMore: boolean
  total: number
  generatedAt: string | null
  sources: SourceStatus[]
  loadMore: () => void
}

// localStorage-kiintiö on 5–10 MB per origin. Hakuikkuna (90 pv) tuottaa
// mitatusti ~5,8 MB dataa, joten sen tallentaminen täyttäisi kiintiön ja
// QuotaExceededError voisi kaataa muutkin merkinnät. Iso vastaus jää siis
// vain muistivälimuistiin (eventsCache), joka riittää istunnon ajan.
const LS_MAX_CHARS = 250_000
function persist(key: string, entry: CacheEntry): void {
  try {
    const json = JSON.stringify(entry)
    if (json.length > LS_MAX_CHARS) return
    localStorage.setItem(LS_PREFIX + key, json)
  } catch { /* privaattitila tai kiintiö täynnä */ }
}

// ── Naapuri-ikkunoiden esilataus ─────────────────────────────────────────────
// Kun etusivun Tänään-haku on valmis, haetaan hiljaa Illalla, Huomenna ja
// Viikonloppu välimuistiin (lib/events-fetch ESILADATTAVAT, yhteensä < 1 MB).
// Päivächipin napautus osuu silloin tuoreeseen välimuistiin ja lista ilmestyy
// heti täytenä — ilman tätä kylmä täysi haku kesti mitatusti 8–15 s
// (omistaja 24.9.2026: "Stand up · 3" → "· 19" vasta sekuntien päästä).
// Kerran istunnossa, vain oletushaulle (ei bbox/kategoria), ei
// datansäästötilassa, ja 1,5 s viiveellä ettei se kilpaile itse sivun kanssa.
let naapuritEsiladattu = false
function esilataaNaapurit(o: { dateFilter: DateFilter; municipality: string; bbox?: string; activeCategories: string[] }): void {
  if (naapuritEsiladattu || typeof window === 'undefined') return
  if (o.dateFilter !== 'today' || o.bbox || o.activeCategories.length > 0) return
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return
  naapuritEsiladattu = true
  setTimeout(async () => {
    for (const f of ESILADATTAVAT) {
      const params = tapahtumaHakuParams({ dateFilter: f, page: 1, municipality: o.municipality })
      const key = params.toString()
      const c = eventsCache.get(key)
      if (c && Date.now() - c.ts < CACHE_TTL) continue
      try {
        const res = await fetch(`/api/events?${params}`)
        if (!res.ok) continue
        const d = (await res.json()) as EventsResponse
        const entry: CacheEntry = { events: d.events, hasMore: d.hasMore, total: d.total, ts: Date.now(), generatedAt: d.generatedAt, sources: d.sources }
        eventsCache.set(key, entry)
        persist(key, entry)
      } catch { /* esilataus on lisä, ei ehto */ }
    }
  }, 1500)
}

export function useEvents({
  dateFilter,
  customDate,
  customDateEnd,
  keyword,
  municipality,
  activeCategories,
  bbox,
  nearbyCoords,
}: UseEventsOptions): UseEventsResult {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchingFull, setFetchingFull] = useState(false)
  /** Näkyvä data on OSITTAINEN (pikatulos tai siemen) ja täysi haku on
   *  kesken — UI näyttää "Haetaan…" + skeletonit. Eri asia kuin fetchingFull,
   *  joka on tosi myös täyden mutta yli 5 min vanhan datan hiljaisessa
   *  päivityksessä (silloin skeletonit lupaisivat lisää sisältöä turhaan). */
  const [osittainen, setOsittainen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Ensimmäinen haku mountissa: siemen näytetään heti (ei skeleton-välähdystä
   *  etusivun ensimaalaukseen); myöhemmät suodatinvaihdot odottavat armonajan. */
  const ensimmainenRef = useRef(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [sources, setSources] = useState<SourceStatus[]>([])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const applySort = useCallback((incoming: Event[], prev: Event[], append: boolean): Event[] => {
    const merged = append ? [...prev, ...incoming] : incoming
    const seen = new Set<string>()
    const unique = merged.filter((e: Event) => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })
    if (nearbyCoords) {
      const { lat, lon } = nearbyCoords
      unique.sort((a: Event, b: Event) => {
        const da = (a.location?.lat && a.location?.lon) ? haversineKm(lat, lon, a.location.lat, a.location.lon) : 999
        const db = (b.location?.lat && b.location?.lon) ? haversineKm(lat, lon, b.location.lat, b.location.lon) : 999
        return da - db
      })
    } else {
      const scores = getCategoryScores()
      if (Object.keys(scores).length > 0) {
        unique.sort((a: Event, b: Event) => virtualStartTime(a, scores) - virtualStartTime(b, scores))
      } else {
        // Chronological fallback — appended pages arrive as later day-windows,
        // so plain concat order would be block-wise instead of time order
        unique.sort((a: Event, b: Event) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      }
    }
    return unique
  }, [nearbyCoords])

  const fetchEvents = useCallback(
    async (pageNum: number, append: boolean) => {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setError(null)
      setFetchingFull(false) // reset from any previous aborted fetch

      // Avain ja parametrit YHDESTÄ rakentajasta (lib/events-fetch), jotta
      // esilataus ja suodatinvaihdon välimuistitarkistus osuvat samaan
      // merkkijonoon. keyword EI mene palvelimelle: LinkedEventsin text-haku
      // ei tunne esiintyjänimiä ja pudotti mitatusti KOKO aineiston (1446 → 0);
      // suodatus tehdään klientissä (HomeClient filteredEvents).
      const params = tapahtumaHakuParams({ dateFilter, customDate, customDateEnd, page: pageNum, municipality, bbox, activeCategories })

      const cacheKey = params.toString()
      const cached = eventsCache.get(cacheKey)
      const now = Date.now()
      const ensimmainen = ensimmainenRef.current
      ensimmainenRef.current = false

      if (cached && !cached.seed) {
        // Serve cached results immediately — no loading flash (täysi data)
        setOsittainen(false)
        setEvents(prev => applySort(cached.events, append ? prev : [], append))
        setHasMore(cached.hasMore)
        setTotal(cached.total)
        // Freshness reflects the page-1 fan-out; later pages are LinkedEvents-only
        // and would clobber the 40-source status with a single entry.
        if (!append) {
          setGeneratedAt(cached.generatedAt ?? null)
          setSources(cached.sources ?? [])
        }
        setLoading(false)

        if (now - cached.ts < CACHE_TTL) {
          esilataaNaapurit({ dateFilter, municipality, bbox, activeCategories })
          return // still fresh, skip revalidation
        }
        // Vanha täysi data: näytetään ja päivitetään hiljaa (ei skeletoneita).

        // Stale: revalidate silently in background
        setFetchingFull(true)
        try {
          const res = await fetch(`/api/events?${params}`, { signal: controller.signal })
          if (!res.ok) { setFetchingFull(false); return }
          const data = await res.json()
          if (!controller.signal.aborted) {
            const staleEntry: CacheEntry = { events: data.events, hasMore: data.hasMore, total: data.total, ts: Date.now(), generatedAt: data.generatedAt, sources: data.sources }
            eventsCache.set(cacheKey, staleEntry)
            persist(cacheKey, staleEntry)
            // No count-based slicing — page sizes vary (day-window batches);
            // applySort dedupes re-fetched events by id.
            setEvents(prev => applySort(data.events, append ? prev : [], append))
            setHasMore(data.hasMore)
            setTotal(data.total)
            if (!append) {
              setGeneratedAt(data.generatedAt ?? null)
              setSources(data.sources ?? [])
            }
            setFetchingFull(false)
            esilataaNaapurit({ dateFilter, municipality, bbox, activeCategories })
          }
        } catch {
          setFetchingFull(false)
        }
        return
      }

      // Cache miss TAI siemen: pikatulos (LinkedEvents, 1. päivä — tai
      // palvelimen siemen) ja täysi haku (46 lähdettä, koko väli) RINNAKKAIN
      // + armonaika — lib/events-fetch. Jos täysi ehtii 0,8 s:ssa, pikatulosta
      // ei näytetä lainkaan; muuten se on väliaikainen ja UI kertoo haun olevan
      // kesken (osittainen). Mountissa siemen näytetään heti (armonaika 0):
      // etusivun ensimaalaus ei saa välähtää skeletonina.
      const siemen = cached?.seed ? cached : null
      if (!(siemen && ensimmainen)) setLoading(true)

      const hae = async (quick: boolean): Promise<EventsResponse> => {
        const p = new URLSearchParams(params)
        if (quick) p.set('quick', '1')
        const res = await fetch(`/api/events?${p}`, { signal: controller.signal })
        if (!res.ok) throw new Error(`Virhe: ${res.status}`)
        return (await res.json()) as EventsResponse
      }
      // No count-based slicing — page sizes vary (day-window batches);
      // applySort dedupes re-fetched events by id.
      const sovella = (data: EventsResponse) => {
        setEvents(prev => applySort(data.events, append ? prev : [], append))
        setHasMore(data.hasMore)
        setTotal(data.total)
        if (!append) {
          setGeneratedAt(data.generatedAt ?? null)
          setSources(data.sources ?? [])
        }
      }

      await haeKahdessaVaiheessa<EventsResponse>({
        pika: siemen
          ? () => Promise.resolve({ events: siemen.events, hasMore: siemen.hasMore, total: siemen.total, generatedAt: siemen.generatedAt, sources: siemen.sources })
          : () => hae(true),
        taysi: () => hae(false),
        armonaikaMs: siemen && ensimmainen ? 0 : undefined,
        // Peruttu (uusi suodatin kesken haun): ei yhtään setStatea perumisen
        // jälkeen — uusi fetchEvents-kutsu on jo nollannut fetchingFullin.
        peruttu: () => controller.signal.aborted,
        naytaPika: (d) => { sovella(d); setLoading(false); setFetchingFull(true); setOsittainen(true) },
        naytaTaysi: (d) => {
          const entry: CacheEntry = { events: d.events, hasMore: d.hasMore, total: d.total, ts: Date.now(), generatedAt: d.generatedAt, sources: d.sources }
          eventsCache.set(cacheKey, entry)
          persist(cacheKey, entry)
          sovella(d)
          setLoading(false)
          setFetchingFull(false)
          setOsittainen(false)
          esilataaNaapurit({ dateFilter, municipality, bbox, activeCategories })
        },
        // Täysi kaatui: pikatulos jää — se on yhä osittainen, mutta haku ei ole
        // kesken, joten skeletonit pois (ei luvata lisää sisältöä).
        taysiEpaonnistui: () => { setFetchingFull(false); setOsittainen(false) },
        epaonnistui: () => {
          setError('Tapahtumien lataaminen epäonnistui. Yritä uudelleen.')
          setLoading(false)
          setFetchingFull(false)
          setOsittainen(false)
        },
      })
    },
    [dateFilter, customDate, customDateEnd, municipality, activeCategories, bbox, nearbyCoords, applySort]
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination when filters change
    setPage(1)
    // Only clear events if there's no cached result for the new filter — avoids flash.
    // Sama avainrakentaja kuin fetchEventsissä ja esilatauksessa (lib/events-fetch).
    const ck = tapahtumaHakuParams({ dateFilter, customDate, customDateEnd, page: 1, municipality, bbox, activeCategories }).toString()
    // Siemen (osittainen) ei kelpaa "vanhan listan" tilalle suodatinvaihdossa:
    // edellisen päivän kortit eivät saa jäädä näkyviin uuden chipin alle
    // (omistaja 24.9.2026: "lista näyttää vielä vanhoja tapahtumia"). Mountissa
    // siemen näytetään heti — silloin ei ole vanhaa listaa jota vaihtaa.
    if (eventsCache.get(ck)?.seed && !ensimmainenRef.current) setEvents([])
    if (!eventsCache.has(ck)) {
      // Check localStorage before showing empty state — instant results for returning users
      try {
        const raw = localStorage.getItem(LS_PREFIX + ck)
        if (raw) {
          const entry: CacheEntry = JSON.parse(raw)
          if (Date.now() - entry.ts < LS_TTL) {
            eventsCache.set(ck, entry)
          } else {
            localStorage.removeItem(LS_PREFIX + ck)
          }
        }
      } catch {}
      if (!eventsCache.has(ck)) setEvents([])
    }
    // Ei debouncea hakusanalle: pyyntö ei enää riipu keywordista, joten
    // kirjoittaminen ei laukaise uusia hakuja — haku tehdään KERRAN kun
    // aikaikkuna vaihtuu 'search'-tilaan, ja loput suodatetaan klientissä.
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchEvents(1, false)
    }, 0)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, customDate, customDateEnd ?? '', municipality, activeCategories.join(','), bbox ?? '', nearbyCoords?.lat ?? '', nearbyCoords?.lon ?? ''])

  const loadMore = useCallback(() => {
    const next = page + 1
    setPage(next)
    fetchEvents(next, true)
  }, [page, fetchEvents])

  return { events, loading, fetchingFull, osittainen, error, hasMore, total, generatedAt, sources, loadMore }
}

// Lightweight hook for collection previews (fetches up to 10 events)
export function useCollectionEvents(
  dateFilter: DateFilter,
  categoryIds: string[],
  municipality: string,
  priceFilter: string,
  searchKeyword?: string
): Event[] {
  const [events, setEvents] = useState<Event[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const { start, end, startAfter } = getDateRange(dateFilter)

    const params = new URLSearchParams({ start, end, municipality, page: '1' })
    if (startAfter) params.set('startAfter', startAfter)
    if (searchKeyword) params.set('keyword', searchKeyword)

    fetch(`/api/events?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        let result: Event[] = data.events || []

        // Filter by price
        if (priceFilter === 'free') result = result.filter((e) => e.isFree)
        if (priceFilter === 'paid') result = result.filter((e) => !e.isFree)

        // Filter by category keywords
        if (categoryIds.length > 0) {
          const kws = categoryIds.flatMap(
            (id) => CATEGORIES.find((c) => c.id === id)?.keywords ?? []
          )
          result = result.filter((e) =>
            e.categories.some((cat) =>
              kws.some((kw) => cat.toLowerCase().includes(kw.toLowerCase()))
            )
          )
        }

        setEvents(result.slice(0, 10))
      })
      .catch(() => {})

    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, municipality, categoryIds.join(','), priceFilter, searchKeyword ?? ''])

  return events
}
