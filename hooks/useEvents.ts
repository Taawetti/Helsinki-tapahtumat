import { useState, useEffect, useCallback, useRef } from 'react'
import { Event, DateFilter, CATEGORIES } from '@/lib/types'
import { getDateRange, haversineKm } from '@/lib/utils'
import { getCategoryScores, virtualStartTime } from '@/lib/preferences'
import type { GeoCoords } from './useGeolocation'

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
  error: string | null
  hasMore: boolean
  total: number
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)

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

      setLoading(true)
      setError(null)

      const { start, end, startAfter } = getDateRange(dateFilter, customDate, customDateEnd)

      const keywordsFromCategories = activeCategories
        .flatMap((id) => CATEGORIES.find((c) => c.id === id)?.keywords ?? [])
        .join(',')

      const params = new URLSearchParams({ start, end, page: String(pageNum), municipality })
      if (startAfter) params.set('startAfter', startAfter)
      if (bbox) params.set('bbox', bbox)
      if (keyword) params.set('keyword', keyword)
      if (keywordsFromCategories) params.set('categories', keywordsFromCategories)

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
          setLoading(false) // Show content immediately
        }

        // Phase 2: All sources — silent background update
        const fullRes = await fetch(`/api/events?${params}`, { signal: controller.signal })
        if (!fullRes.ok) return
        const fullData = await fullRes.json()

        if (!controller.signal.aborted) {
          setEvents(prev => applySort(fullData.events, append ? prev.slice(0, (pageNum - 1) * 50) : [], append))
          setHasMore(fullData.hasMore)
          setTotal(fullData.total)
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError('Tapahtumien lataaminen epäonnistui. Yritä uudelleen.')
        setLoading(false)
      }
    },
    [dateFilter, customDate, customDateEnd, keyword, municipality, activeCategories, bbox, nearbyCoords, applySort]
  )

  useEffect(() => {
    setPage(1)
    setEvents([]) // Clear stale events immediately on filter change
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

  return { events, loading, error, hasMore, total, loadMore }
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
