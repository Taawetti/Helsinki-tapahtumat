import { useState, useEffect, useCallback, useRef } from 'react'
import { Event, DateFilter, SourceStatus, CATEGORIES } from '@/lib/types'
import { getDateRange, haversineKm } from '@/lib/utils'
import { getCategoryScores, virtualStartTime } from '@/lib/preferences'
import type { GeoCoords } from './useGeolocation'

interface CacheEntry { events: Event[]; hasMore: boolean; total: number; ts: number; generatedAt?: string; sources?: SourceStatus[] }
const eventsCache = new Map<string, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000
const LS_PREFIX = 'events-v2-'
const LS_TTL = 30 * 60 * 1000

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
  eventsCache.set(key, { events, hasMore: false, total, ts: ts ?? Date.now() })
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
  error: string | null
  hasMore: boolean
  total: number
  generatedAt: string | null
  sources: SourceStatus[]
  loadMore: () => void
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
  const [error, setError] = useState<string | null>(null)
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

      const { start, end, startAfter } = getDateRange(dateFilter, customDate, customDateEnd)

      const keywordsFromCategories = activeCategories
        .flatMap((id) => CATEGORIES.find((c) => c.id === id)?.keywords ?? [])
        .join(',')

      const params = new URLSearchParams({ start, end, page: String(pageNum), municipality })
      if (startAfter) params.set('startAfter', startAfter)
      if (bbox) params.set('bbox', bbox)
      if (keyword) params.set('keyword', keyword)
      if (keywordsFromCategories) params.set('categories', keywordsFromCategories)

      const cacheKey = params.toString()
      const cached = eventsCache.get(cacheKey)
      const now = Date.now()

      if (cached) {
        // Serve cached results immediately — no loading flash
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

        if (now - cached.ts < CACHE_TTL) return // still fresh, skip revalidation

        // Stale: revalidate silently in background
        setFetchingFull(true)
        try {
          const res = await fetch(`/api/events?${params}`, { signal: controller.signal })
          if (!res.ok) { setFetchingFull(false); return }
          const data = await res.json()
          if (!controller.signal.aborted) {
            const staleEntry: CacheEntry = { events: data.events, hasMore: data.hasMore, total: data.total, ts: Date.now(), generatedAt: data.generatedAt, sources: data.sources }
            eventsCache.set(cacheKey, staleEntry)
            try { localStorage.setItem(LS_PREFIX + cacheKey, JSON.stringify(staleEntry)) } catch {}
            setEvents(prev => applySort(data.events, append ? prev.slice(0, (pageNum - 1) * 50) : [], append))
            setHasMore(data.hasMore)
            setTotal(data.total)
            if (!append) {
              setGeneratedAt(data.generatedAt ?? null)
              setSources(data.sources ?? [])
            }
            setFetchingFull(false)
          }
        } catch {
          setFetchingFull(false)
        }
        return
      }

      // Cache miss: two-phase fetch
      setLoading(true)

      try {
        // Phase 1: LinkedEvents only — shows results in ~1s
        const quickParams = new URLSearchParams(params)
        quickParams.set('quick', '1')
        const quickRes = await fetch(`/api/events?${quickParams}`, { signal: controller.signal })
        if (!quickRes.ok) throw new Error(`Virhe: ${quickRes.status}`)
        const quickData = await quickRes.json()

        if (!controller.signal.aborted) {
          setEvents(prev => applySort(quickData.events, append ? prev : [], append))
          setHasMore(quickData.hasMore)
          setTotal(quickData.total)
          if (!append) {
            setGeneratedAt(quickData.generatedAt ?? null)
            setSources(quickData.sources ?? [])
          }
          setLoading(false)
          setFetchingFull(true)
        }

        // Phase 2: All sources — silent background update
        const fullRes = await fetch(`/api/events?${params}`, { signal: controller.signal })
        if (!fullRes.ok) { setFetchingFull(false); return }
        const fullData = await fullRes.json()

        if (!controller.signal.aborted) {
          const entry: CacheEntry = { events: fullData.events, hasMore: fullData.hasMore, total: fullData.total, ts: Date.now(), generatedAt: fullData.generatedAt, sources: fullData.sources }
          eventsCache.set(cacheKey, entry)
          try { localStorage.setItem(LS_PREFIX + cacheKey, JSON.stringify(entry)) } catch {}
          setEvents(prev => applySort(fullData.events, append ? prev.slice(0, (pageNum - 1) * 50) : [], append))
          setHasMore(fullData.hasMore)
          setTotal(fullData.total)
          if (!append) {
            setGeneratedAt(fullData.generatedAt ?? null)
            setSources(fullData.sources ?? [])
          }
          setFetchingFull(false)
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setFetchingFull(false)
          return
        }
        setError('Tapahtumien lataaminen epäonnistui. Yritä uudelleen.')
        setLoading(false)
        setFetchingFull(false)
      }
    },
    [dateFilter, customDate, customDateEnd, keyword, municipality, activeCategories, bbox, nearbyCoords, applySort]
  )

  useEffect(() => {
    setPage(1)
    // Only clear events if there's no cached result for the new filter — avoids flash
    const { start, end, startAfter } = getDateRange(dateFilter, customDate, customDateEnd)
    const kws = activeCategories.flatMap((id) => CATEGORIES.find((c) => c.id === id)?.keywords ?? []).join(',')
    const p = new URLSearchParams({ start, end, page: '1', municipality })
    if (startAfter) p.set('startAfter', startAfter)
    if (bbox) p.set('bbox', bbox)
    if (keyword) p.set('keyword', keyword)
    if (kws) p.set('categories', kws)
    const ck = p.toString()
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
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchEvents(1, false)
    }, keyword ? 350 : 0)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, customDate, customDateEnd ?? '', keyword, municipality, activeCategories.join(','), bbox ?? '', nearbyCoords?.lat ?? '', nearbyCoords?.lon ?? ''])

  const loadMore = useCallback(() => {
    const next = page + 1
    setPage(next)
    fetchEvents(next, true)
  }, [page, fetchEvents])

  return { events, loading, fetchingFull, error, hasMore, total, generatedAt, sources, loadMore }
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
