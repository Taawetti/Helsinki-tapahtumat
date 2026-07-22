'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Fragment, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Loader2, Heart, Bell, Plus, ChevronLeft } from 'lucide-react'
import { Event, Activity, Restaurant, DateFilter, PriceFilter, CATEGORIES, VIBES, Vibe, matchesVibeText } from '@/lib/types'
import { haversineKm, getDateRange, formatTime } from '@/lib/utils'
import { nightlifeScore, TERRACE_REGEX } from '@/lib/nightlife'
import { useFavorites } from '@/contexts/FavoritesContext'
import { useEvents, preloadEventsCache } from '@/hooks/useEvents'
import { useGeolocation } from '@/hooks/useGeolocation'
import { getCategoryScores } from '@/lib/preferences'
import EventCard from '@/components/EventCard'
import HeroSwiper from '@/components/HeroSwiper'
import EventDetailPanel from '@/components/EventDetailPanel'
import SearchBar from '@/components/SearchBar'
import PosterCard from '@/components/PosterCard'
import InstallBanner from '@/components/InstallBanner'
import VibePanel from '@/components/VibePanel'
import DatePicker from '@/components/DatePicker'
import EiTiedaModal, { EiTiedaMode } from '@/components/EiTiedaModal'
import JarjestajaForm from '@/components/JarjestajaForm'
import NewsletterBanner from '@/components/NewsletterBanner'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })
// Tab views are code-split: each only mounts when its tab is opened, so the
// ~250 KB opening_hours library (restaurants/activities/ideas) and the views
// themselves stay out of the initial bundle.
const RestaurantsView = dynamic(() => import('@/components/RestaurantsView'), { ssr: false })
const ActivitiesView = dynamic(() => import('@/components/ActivitiesView'), { ssr: false })
const IdeaView = dynamic(() => import('@/components/IdeaView'), { ssr: false })

interface EmptyStateProps {
  keyword: string
  activeVibes: string[]
  activeCategories: string[]
  priceFilter: PriceFilter
  dateFilter: DateFilter
  onClear: () => void
  onDateChange: (d: DateFilter) => void
}

// ── Koti: kategoriaruudukon 8 laattaa (design 1-koti.png) ─────────────────
// tint = RGB-tripletti radial-hehkulle — korttien sävyt vaihtelevat tarkoituksella
const HOME_GRID_TILES: { id: string; tint: string }[] = [
  { id: 'keikka',      tint: '255,107,107' },
  { id: 'yoelama',     tint: '175,130,255' },
  { id: 'standup',     tint: '95,217,166'  },
  { id: 'urheilu',     tint: '95,150,255'  },
  { id: 'baari',       tint: '232,192,106' },
  { id: 'underground', tint: '160,160,190' },
  { id: 'teatteri',    tint: '175,130,255' },
  { id: 'taide',       tint: '232,192,106' },
]

// ── Kompakti vaakarivikortti (design: pieni kuvatiili + aikachip, 1-rivinen
//    nimi, meta "kategoria · paikka") ─────────────────────────────────────
function RowCard({ event, onClick }: { event: Event; onClick: (e: Event) => void }) {
  const { lang, t } = useLanguage()
  const now = Date.now()
  const start = new Date(event.startTime)
  const msUntil = start.getTime() - now
  const isToday = start.toDateString() === new Date().toDateString()
  const time = start.toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  let dateLabel = isToday
    ? time
    : start.toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric' }) + ' ' + time
  if (msUntil > 0 && msUntil < 90 * 60 * 1000) dateLabel = `⏱ ${Math.round(msUntil / 60000)} min`
  return (
    <button
      onClick={() => onClick(event)}
      className="group shrink-0 text-left rounded-[14px] overflow-hidden"
      style={{ width: 148, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}
    >
      <div className="relative w-full overflow-hidden" style={{ height: 84 }}>
        {event.image ? (
          <img src={event.image} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={e => { (e.target as HTMLElement).style.display = 'none' }} />
        ) : (
          <div className="absolute inset-0" style={{ background: 'radial-gradient(100% 100% at 30% 0%, rgba(107,118,255,.28), transparent 70%), #12121a' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.55) 0%,transparent 60%)' }} />
        <span className="absolute top-1.5 left-1.5 text-[10px] font-black px-2 py-0.5 rounded-full text-white/90" style={{ background: 'rgba(10,10,12,.72)', backdropFilter: 'blur(8px)' }}>{dateLabel}</span>
        {event.isFree && (
          <span className="absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(95,217,166,.9)', color: '#06281a' }}>{t('common.free_badge')}</span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="text-white font-black text-[12.5px] leading-tight truncate" style={{ letterSpacing: '-0.01em' }}>{event.title}</p>
        <p className="text-[10.5px] font-semibold truncate mt-0.5" style={{ color: 'rgba(255,255,255,.45)' }}>
          {[event.categories[0], event.location?.name].filter(Boolean).join(' · ')}
        </p>
      </div>
    </button>
  )
}

// ── Carousel row ─────────────────────────────────────────
function CarouselRow({ title, events, onClick, onSeeAll }: { title: string; events: Event[]; onClick: (e: Event) => void; onSeeAll?: () => void }) {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  if (events.length === 0) return null
  const hasMore = events.length > 10
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-white text-[16px] tracking-tight flex items-baseline gap-1.5" style={{ letterSpacing: '-0.02em' }}>
          {title}
          <span className="text-white/25 font-bold text-[13px]">· {events.length}</span>
        </h2>
        {onSeeAll ? (
          <button onClick={onSeeAll}
            className="text-[12px] font-black shrink-0 transition-colors"
            style={{ color: '#a3abff' }}>
            {t('discover.see_all')} ›
          </button>
        ) : hasMore && !expanded ? (
          <button onClick={() => setExpanded(true)}
            className="text-[12px] font-black shrink-0 transition-colors"
            style={{ color: '#a3abff' }}>
            {t('discover.see_all')} {events.length} →
          </button>
        ) : expanded ? (
          <button onClick={() => setExpanded(false)}
            className="text-[12px] font-black text-white/30 hover:text-white/60 shrink-0 transition-colors">
            {t('discover.see_fewer')}
          </button>
        ) : null}
      </div>
      {!expanded ? (
        <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
          {events.slice(0, 10).map(e => <RowCard key={e.id} event={e} onClick={onClick} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {events.map(e => <PosterCard key={e.id} event={e} onClick={onClick} />)}
        </div>
      )}
    </section>
  )
}

function EmptyState({ keyword, activeVibes, activeCategories, priceFilter, dateFilter, onClear, onDateChange }: EmptyStateProps) {
  const { t } = useLanguage()
  const hasFilters = keyword || activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all'
  const isNarrowDate = dateFilter === 'today' || dateFilter === 'tonight'

  let emoji = '🏙'
  let heading = t('discover.no_events')
  let sub = t('discover.no_events_sub')

  if (keyword) {
    emoji = '🔍'
    heading = `${t('discover.no_results')} "${keyword}"`
    sub = t('discover.no_results_sub')
  } else if (priceFilter === 'free' && isNarrowDate) {
    emoji = '🎁'
    heading = t('discover.no_free_today')
    sub = t('discover.no_free_today_sub')
  } else if (activeVibes.length > 0 || activeCategories.length > 0) {
    emoji = '🎯'
    heading = t('discover.no_filter_match')
    sub = t('discover.no_filter_sub')
  } else if (isNarrowDate) {
    emoji = '📅'
    heading = t('discover.quiet_today')
    sub = t('discover.quiet_sub')
  }

  return (
    <div className="flex flex-col items-center py-24 text-center gap-4">
      <span className="text-5xl">{emoji}</span>
      <div>
        <p className="text-white/50 font-bold text-base">{heading}</p>
        <p className="text-white/25 text-sm mt-1">{sub}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-1">
        {isNarrowDate && (
          <button
            onClick={() => onDateChange('week')}
            className="text-sm font-bold px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition-all"
          >
            {t('discover.expand_week')}
          </button>
        )}
        {hasFilters && (
          <button
            onClick={onClear}
            className="text-sm font-bold px-4 py-2 rounded-xl border border-purple-500/30 text-purple-400/70 hover:text-purple-300 hover:border-purple-500/50 transition-all"
          >
            {t('common.clear_filters')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Event category helpers ────────────────────────────────
function matchesText(e: Event, pattern: RegExp): boolean {
  return pattern.test([e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase())
}
const isKeikka  = (e: Event) => matchesText(e, /keikka|konsertti|live[\s-]?musiikki|bändi|gig/)
const isUrheilu = (e: Event) => matchesText(e, /urheilu|jääkiekko|jalkapallo|koripallo|ottelu|sm-liiga|khl|nba|liiga/)

// Finnish concept words → category/title terms that identify matching events.
// Needed because Linked Events full-text search is too permissive.
const KEYWORD_CONCEPTS: Record<string, string[]> = {
  keikka:      ['musiikki', 'keikka', 'konsertti', 'concert', 'live', 'rock', 'jazz', 'folk', 'pop', 'metal', 'festivaali', 'festival'],
  keikkoja:    ['musiikki', 'keikka', 'konsertti', 'concert', 'live', 'festivaali', 'festival'],
  livekeikka:  ['musiikki', 'keikka', 'konsertti', 'concert', 'live'],
  konsertti:   ['musiikki', 'keikka', 'konsertti', 'concert', 'klassinen', 'orkesteri', 'sinfonia'],
  konsertit:   ['musiikki', 'keikka', 'konsertti', 'concert', 'klassinen', 'orkesteri'],
  festivaali:  ['festivaali', 'festival', 'musiikki', 'keikka'],
}
const isSurprise = (e: Event) => matchesText(e, /sauna|melont|jooga|silent|pop.?up|taikur|sirkus|impro|flash|yömelont|saunavene/)
const isTerrace = (e: Event) => {
  const month = new Date().getMonth() + 1
  if (month < 6 || month > 8) return false
  return matchesText(e, TERRACE_REGEX)
}
function isAlkaaPian(e: Event): boolean {
  const ms = new Date(e.startTime).getTime() - Date.now()
  return ms > 0 && ms < 3 * 60 * 60 * 1000
}

type AppMode = 'discover' | 'idea' | 'map' | 'favorites' | 'restaurants' | 'activities'
type ListStyle = 'feed' | 'grid'

interface PreloadedDateRange {
  start: string
  end: string
  events: Event[]
  total: number
}

// Module flag: the tonight seed parses Dates over the whole preloaded array,
// so run it once per page load instead of on every re-render.
let tonightSeeded = false

export default function HomeClient({
  preloadedData,
}: {
  preloadedData: {
    today: PreloadedDateRange
    tomorrow: PreloadedDateRange
    weekend: PreloadedDateRange
    week: PreloadedDateRange
  }
}) {
  // Pre-seed in-memory cache for today/tomorrow/weekend/week.
  // Guard: compare server-computed dates (UTC on Vercel) with client local dates.
  // If they mismatch (Helsinki midnight–3 AM window, UTC+3 vs UTC), skip that filter —
  // it falls through to the normal two-phase fetch automatically.
  // Seeds are marked STALE on purpose: they are a LinkedEvents-only slice (and
  // the upstream feed is flaky), so the full 40-source fan-out must always
  // revalidate in the background. A "fresh" seed used to skip that entirely,
  // leaving users stuck on partial data with no freshness badge and no way
  // to tell anything was missing.
  for (const [filter, data] of [
    ['today',    preloadedData.today],
    ['tomorrow', preloadedData.tomorrow],
    ['weekend',  preloadedData.weekend],
    ['week',     preloadedData.week],
  ] as [DateFilter, PreloadedDateRange][]) {
    if (data.events.length === 0) continue
    const localRange = getDateRange(filter)
    if (localRange.start === data.start && localRange.end === data.end) {
      preloadEventsCache(
        new URLSearchParams({ start: data.start, end: data.end, page: '1', municipality: 'helsinki' }).toString(),
        data.events,
        data.total,
        Date.now() - 6 * 60 * 1000,
      )
    }
  }
  // Seed 'tonight' from today's preloaded data — same day filtered by the 17:00
  // cutoff, so the evening default paints instantly. Seeded deliberately stale:
  // the full 40-source fan-out revalidates in the background right away, since
  // the preloaded set is LinkedEvents-only and misses the nightlife long tail.
  // Client-only + once per load: avoids per-render Date parsing and keeps the
  // server-side module cache untouched.
  if (typeof window !== 'undefined' && !tonightSeeded && preloadedData.today.events.length > 0) {
    tonightSeeded = true
    const tonightRange = getDateRange('tonight')
    if (tonightRange.startAfter && tonightRange.start === preloadedData.today.start && tonightRange.end === preloadedData.today.end) {
      const cutoff = new Date(tonightRange.startAfter).getTime()
      const tonightEvents = preloadedData.today.events.filter(e => new Date(e.startTime).getTime() >= cutoff)
      if (tonightEvents.length > 0) {
        const tonightParams = new URLSearchParams({ start: tonightRange.start, end: tonightRange.end, page: '1', municipality: 'helsinki' })
        tonightParams.set('startAfter', tonightRange.startAfter)
        preloadEventsCache(tonightParams.toString(), tonightEvents, tonightEvents.length, Date.now() - 6 * 60 * 1000)
      }
    }
  }
  const { lang, t } = useLanguage()
  const { favorites, count: favCount } = useFavorites()
  const [mode, setMode] = useState<AppMode>('discover')
  // Kartta/Suosikit ovat "toisen tason" sivuja (yläpalkin pyöreät napit) —
  // ‹-paluunappi palaa sivulle jolta tultiin
  const [pageBack, setPageBack] = useState<AppMode>('discover')
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [municipality, setMunicipality] = useState('helsinki')
  const [activeCategories, setActiveCategories] = useState<string[]>([])
  const [activeVibes, setActiveVibes] = useState<string[]>([])
  const [keyword, setKeyword] = useState('')
  const [listStyle, setListStyle] = useState<ListStyle>('feed')
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all')
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [mobileTab, setMobileTab] = useState<'discover' | 'idea' | 'map' | 'favorites' | 'restaurants' | 'activities'>('discover')
  const [customDate, setCustomDate] = useState('')
  const [customDateEnd, setCustomDateEnd] = useState('')
  const [showEiTieda, setShowEiTieda] = useState(false)
  const [eiTiedaMode, setEiTiedaMode] = useState<EiTiedaMode>('general')
  const [showJarjestajaForm, setShowJarjestajaForm] = useState(false)
  const [showVibePanel, setShowVibePanel] = useState(false)
  const [liveOnly, setLiveOnly] = useState(false)
  // Koti: avoinna oleva kategoria (ruudukko/aihepiirit) — null = etusivu
  const [koCat, setKoCat] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // Kategorian avaus/vaihto vie aina listan alkuun — muuten näkymä jää
  // etusivun scrollikohtaan ja lista aukeaa "puolesta välistä"
  useEffect(() => {
    if (koCat) window.scrollTo(0, 0)
  }, [koCat])

  // Ilta-painotus: illalla NOSTETAAN yökeikat kärkeen mutta EI rajata päivää —
  // oletus pysyy 'today' (koko päivä näkyvissä). Aiempi 'tonight'-automaatti
  // piilotti kaikki päiväsaikaan alkavat tapahtumat ja teki etusivusta tyhjän
  // näköisen. useEffect (ei initializer) → ei SSR/hydraatioristiriitaa.
  const [isEvening, setIsEvening] = useState(false)
  useEffect(() => {
    if (new Date().getHours() >= 17) setIsEvening(true)
  }, [])

  // "Nyt menossa" -kello: päivitä minuutin välein kun suodatin on päällä —
  // muuten käynnissä-tila jäätyy kytkentähetkeen (päättyneet jäävät listalle,
  // juuri alkaneet eivät ilmesty).
  const [liveNow, setLiveNow] = useState(0)
  useEffect(() => {
    if (!liveOnly) return
    setLiveNow(Date.now())
    const id = setInterval(() => setLiveNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [liveOnly])

  // ── Unified search: lazy-load activities + restaurants on first keystroke ──
  const [allActivities, setAllActivities] = useState<Activity[]>([])
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([])
  const searchDataLoaded = useRef(false)

  useEffect(() => {
    if (!keyword || searchDataLoaded.current) return
    searchDataLoaded.current = true
    fetch('/api/activities').then(r => r.json()).then(d => setAllActivities(d?.activities ?? [])).catch(() => {})
    fetch('/api/restaurants').then(r => r.json()).then(d => setAllRestaurants(d?.restaurants ?? [])).catch(() => {})
  }, [keyword])

  const localSearchHits = useMemo(() => {
    if (!keyword || keyword.length < 2) return { activities: [], restaurants: [] }
    const kw = keyword.toLowerCase()
    const ACT_LABEL: Record<string, string> = {
      sauna: '🧖 Sauna', museo: '🏛 Museo', nahtavyys: '🌄 Nähtävyys',
      galleria: '🖼 Galleria', nakopaikka: '🔭 Näköpaikka', uimaranta: '🏖 Uimaranta',
      puisto: '🌳 Puisto', markkina: '🛍 Markkina', urheilu: '⚽ Urheilu', muu: '✨ Muut',
    }
    const REST_EMOJI: Record<string, string> = {
      ravintola: '🍽', kahvila: '☕', baari: '🍺', pikaruoka: '🍟', muu: '🍴',
    }
    return {
      activities: allActivities
        .filter(a => a.name.toLowerCase().includes(kw) || a.description?.toLowerCase().includes(kw))
        .slice(0, 4)
        .map(a => ({ id: a.id, name: a.name, sub: ACT_LABEL[a.category] ?? '✨' })),
      restaurants: allRestaurants
        .filter(r =>
          r.name.toLowerCase().includes(kw) ||
          r.description?.toLowerCase().includes(kw) ||
          r.cuisines?.some(c => c.toLowerCase().includes(kw))
        )
        .slice(0, 4)
        .map(r => ({ id: r.id, name: r.name, sub: `${REST_EMOJI[r.type] ?? '🍴'} ${r.description || r.type}` })),
    }
  }, [keyword, allActivities, allRestaurants])

  const handleSelectActivity = useCallback(() => {
    setKeyword('')
    setMode('activities')
    setMobileTab('activities')
  }, [])

  const [jumpToRestaurant, setJumpToRestaurant] = useState<{ id: string } | undefined>()

  const handleSelectRestaurant = useCallback((id: string) => {
    setKeyword('')
    setMode('restaurants')
    setMobileTab('restaurants')
    setJumpToRestaurant({ id })
  }, [])

  const [mapTarget, setMapTarget] = useState<{ lat: number; lon: number; name: string; type?: 'event' | 'restaurant' | 'activity' } | null>(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [nearbyMode, setNearbyMode] = useState(false)
  const geo = useGeolocation()

  function handleNearbyToggle() {
    if (nearbyMode) { setNearbyMode(false); return }
    if (!geo.coords) geo.request()
    setNearbyMode(true)
  }

  const { events, loading, fetchingFull, error, hasMore, total, generatedAt, sources, loadMore } = useEvents({
    dateFilter: mode === 'map' ? 'month' : dateFilter,
    customDate, customDateEnd, keyword, municipality, activeCategories, bbox: '',
    nearbyCoords: nearbyMode && geo.coords ? geo.coords : null,
  })

  const handleRangeChange = useCallback((start: string, end: string) => {
    setCustomDate(start)
    setCustomDateEnd(end)
    setDateFilter(start ? 'range' : 'today')
    setLiveOnly(false)
  }, [])

  // Infinite scroll — trigger loadMore when sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loading) loadMore() },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, loadMore])

  const handleVibeToggle = useCallback((id: string) => {
    if (id === 'kaikki') {
      // Toggle: if already active → back to carousels, else → list of all events
      setActiveVibes((prev) => prev.includes('kaikki') ? [] : ['kaikki'])
      return
    }
    // Selecting a specific vibe deselects 'kaikki'
    setActiveVibes((prev) => {
      const without = prev.filter((v) => v !== 'kaikki')
      return without.includes(id) ? without.filter((v) => v !== id) : [...without, id]
    })
    // Map "ilmainen" vibe to price filter
    if (id === 'ilmainen') {
      setPriceFilter((p) => p === 'free' ? 'all' : 'free')
    }
  }, [])

  const handleCategoryToggle = useCallback((id: string) => {
    setActiveCategories((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id])
  }, [])

  const clearFilters = useCallback(() => {
    setActiveCategories([]); setActiveVibes([]); setKeyword('')
    setDateFilter('today'); setMunicipality('helsinki')
    setPriceFilter('all'); setCustomDate(''); setCustomDateEnd(''); setLiveOnly(false)
  }, [])

  const handleShowOnMap = useCallback((lat: number, lon: number, name: string, type?: 'event' | 'restaurant' | 'activity') => {
    setMapTarget({ lat, lon, name, type })
    // Muista lähtösivu, jotta kartan ‹-paluunappi palaa oikeaan näkymään
    setMode((prev) => {
      if (prev !== 'map' && prev !== 'favorites') setPageBack(prev)
      return 'map'
    })
    setMobileTab('map')
  }, [])

  // Check if user already has an active push subscription
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setPushEnabled(!!sub)
    }).catch(() => {})
  }, [])

  const handleBellClick = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      // Unsubscribe
      await existing.unsubscribe()
      await fetch('/api/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: existing.endpoint }) })
      setPushEnabled(false)
      return
    }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    })
    const scores = getCategoryScores()
    const topCats = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([cat]) => cat)
      .join(',')
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...sub.toJSON(), preferredCategories: topCats }),
    })
    setPushEnabled(true)
  }

  // Local notification: alert about today's events after 8h gap
  useEffect(() => {
    if (typeof window === 'undefined' || !events.length) return
    const ask = async () => {
      if (Notification.permission === 'default') return // don't auto-ask, user must click bell
      if (Notification.permission !== 'granted') return
      const last = Number(localStorage.getItem('hki-notif-ts') || 0)
      if (Date.now() - last < 8 * 60 * 60 * 1000) return
      localStorage.setItem('hki-notif-ts', String(Date.now()))
      new Notification('Helsinki Tapahtumat', {
        body: `${events.length} ${t('notif.events_today')}`,
        icon: '/icon-192.png',
        tag: 'hki-daily',
      })
    }
    ask()
  }, [events.length])

  const handleMobileTab = useCallback((tab: typeof mobileTab) => {
    setMobileTab(tab)
    if (tab === 'discover') { setMode('discover'); setKoCat(null) }
    else if (tab === 'idea') setMode('idea')
    else if (tab === 'map') setMode('map')
    else if (tab === 'favorites') setMode('favorites')
    else if (tab === 'restaurants') setMode('restaurants')
    else if (tab === 'activities') setMode('activities')
  }, [])

  // Kartta/Suosikit avataan yläpalkin pyöreistä napeista; muistetaan mistä
  // tultiin niin ‹-paluunappi vie takaisin oikealle sivulle
  const openOverlayMode = useCallback((m: 'map' | 'favorites') => {
    setMode((prev) => {
      if (prev !== 'map' && prev !== 'favorites') setPageBack(prev)
      return m
    })
    setMobileTab(m)
  }, [])

  const goBack = useCallback(() => {
    setMode(pageBack)
    setMobileTab(pageBack as typeof mobileTab)
  }, [pageBack])

// Vibe-based client filter on top of API results
  const filteredEvents = useMemo(() => {
    let result = events

    // Keyword concept filter — applied client-side because Linked Events full-text search
    // returns too many false positives (word "keikka" appears in unrelated descriptions).
    if (keyword) {
      const kw = keyword.toLowerCase().trim()
      const conceptTerms = KEYWORD_CONCEPTS[kw]
      if (conceptTerms) {
        // Concept search: match against categories + title
        result = result.filter((e) => {
          const haystack = [e.title, e.shortDescription ?? '', ...e.categories].join(' ').toLowerCase()
          return conceptTerms.some((term) => haystack.includes(term))
        })
      } else {
        // Specific search: match title or shortDescription
        result = result.filter((e) => {
          const haystack = [e.title, e.shortDescription ?? '', e.location?.name ?? ''].join(' ').toLowerCase()
          return haystack.includes(kw)
        })
      }
    }

    // Vibe filter — 'kaikki' shows all events unfiltered (list mode without keyword filter)
    const activeVibeIds = activeVibes.filter((v) => v !== 'ilmainen' && v !== 'kaikki')
    if (activeVibeIds.length > 0) {
      const activeVibeObjs = activeVibeIds
        .map((id) => VIBES.find((v) => v.id === id))
        .filter((v): v is Vibe => !!v)
      const isNightlife = activeVibeIds.includes('yoelama')
      result = result.filter((e) => {
        const haystack = [e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase()
        // Per-vibe matchaus poissulkusanoineen — flat-keyword-lista päästi
        // vauvatapahtumat Keikkaan ("musiikkia" osui)
        const kwMatch = activeVibeObjs.some((vb) => matchesVibeText(haystack, vb))
        // Evening events (19:30+) count as nightlife — but not sports matches
        const d = new Date(e.startTime)
        const eveningMatch = isNightlife && (d.getHours() > 19 || (d.getHours() === 19 && d.getMinutes() >= 30)) && !isUrheilu(e)
        return kwMatch || eveningMatch
      })
    }

    // Category filter
    if (activeCategories.length > 0) {
      const kws = activeCategories.flatMap((id) => CATEGORIES.find((c) => c.id === id)?.keywords ?? [])
      result = result.filter((e) =>
        e.categories.some((cat) => kws.some((kw) => cat.toLowerCase().includes(kw.toLowerCase())))
      )
    }

    if (priceFilter === 'free') result = result.filter((e) => e.isFree)
    if (priceFilter === 'paid') result = result.filter((e) => !e.isFree)

    // "Nyt menossa" — started already and still running. Most sources omit
    // endTime, so events without one count as live for 3 h after start.
    if (liveOnly) {
      const nowTs = liveNow || Date.now()
      result = result.filter((e) => {
        const startTs = new Date(e.startTime).getTime()
        if (startTs > nowTs) return false
        if (e.endTime) return new Date(e.endTime).getTime() >= nowTs
        return nowTs - startTs < 3 * 60 * 60 * 1000
      })
    }
    return result
  }, [events, activeCategories, activeVibes, priceFilter, liveOnly, liveNow])

  const discoverEvents = useMemo(
    () => [...filteredEvents].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [filteredEvents]
  )

  // Base events for carousels — date/keyword filtered but NOT vibe/category filtered
  // so rows always show content even when a specific vibe is active
  const baseEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [events]
  )

  // "🎸 ILLAN KEIKAT" — pyyhkäisyheron 5 nostoa: parhaat pisteet ensin,
  // näytöllä aikajärjestyksessä
  const heroGigs = useMemo(() => {
    const picks = baseEvents
      .filter((e) => nightlifeScore(e) >= 3 && !!e.image)
      .sort((a, b) => nightlifeScore(b) - nightlifeScore(a))
      .slice(0, 5)
    return picks.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [baseEvents])

  // Kompaktit vaakarivit (design: hero → ruudukko → Illan parhaat → Ilmaiseksi).
  // Heron 5 nostoa jätetään pois "Illan parhaat" -rivistä ettei sama sisältö toistu.
  const carousels = useMemo(() => {
    const heroIds = new Set(heroGigs.map((e) => e.id))
    const rows = [
      { id: 'parhaat',  title: t('discover.carousel_best'), events: baseEvents.filter(e => nightlifeScore(e) >= 3 && !heroIds.has(e.id)) },
      { id: 'ilmainen', title: t('discover.carousel_free'), events: baseEvents.filter(e => e.isFree) },
    ]
    return rows.filter(r => r.events.length > 0)
  }, [baseEvents, t, heroGigs])

  // Kategorian pystylista (koCat): ruudukon/aihepiirin napautus avaa tämän
  const koCatEvents = useMemo(() => {
    if (!koCat) return []
    if (koCat === 'ilmainen') return baseEvents.filter((e) => e.isFree)
    const vibe = VIBES.find((v) => v.id === koCat)
    if (!vibe) return []
    return baseEvents.filter((e) => {
      const hay = [e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase()
      return matchesVibeText(hay, vibe)
    })
  }, [koCat, baseEvents])

  // 'kaikki' counts as 0 — it's "show all", not a real filter selection
  const activeCount = activeVibes.filter(v => v !== 'kaikki').length + activeCategories.length + (priceFilter !== 'all' ? 1 : 0) + (liveOnly ? 1 : 0)

  // Suodatinpalkin teksti: näytä KAIKKI aktiiviset suodattimet. Pelkän
  // ensimmäisen aihepiirin näyttäminen piilotti esim. hintasuodattimen —
  // "Stand up · 1 tapahtumaa" ilman selitystä, kun 🎁 Ilmainen oli päällä.
  // ('ilmainen'-vibe kartoittuu hintasuodattimeen → hintachip edustaa sitä.)
  const activeFilterLabel = [
    ...(liveOnly ? ['🔴 Nyt menossa'] : []),
    ...activeVibes
      .filter((v) => v !== 'kaikki' && v !== 'ilmainen')
      .map((v) => { const vb = VIBES.find((x) => x.id === v); return vb ? `${vb.emoji} ${vb.label}` : v }),
    ...(priceFilter === 'free' ? [`🎁 ${t('common.free')}`] : priceFilter === 'paid' ? ['💳 Maksulliset'] : []),
  ].join(' · ') || t('common.filters')

  // Freshness badge counts — hoisted so the ok/fail split lives in one place
  const okSourceCount = sources.filter(s => s.ok).length
  const failedSourceCount = sources.length - okSourceCount

  const handleQuickAction = useCallback((id: string) => {
    switch (id) {
      case 'ei-tieda':
        setEiTiedaMode('general')
        setShowEiTieda(true)
        break
      case 'treffi':
        setEiTiedaMode('treffi')
        setShowEiTieda(true)
        break
      case 'ilmainen':
        setPriceFilter(p => p === 'free' ? 'all' : 'free')
        break
      case 'keikka':
        setActiveVibes(p => p.includes('keikka') ? p.filter(v => v !== 'keikka') : [...p, 'keikka'])
        break
      case 'outo':
        setActiveVibes(['tyopaja'])
        break
      case 'halpa':
        setPriceFilter(p => p === 'free' ? 'all' : 'free')
        break
      case 'viela-ehtii':
        setDateFilter('tonight')
        setCustomDate('')
        break
      case 'iltasuunnitelma':
        document.getElementById('iltasuunnitelma')?.scrollIntoView({ behavior: 'smooth' })
        break
    }
  }, [])

  return (
    <div className="min-h-screen text-white pb-20 md:pb-0" style={{ background: '#0a0a0c' }}>
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-30 border-b border-white/5" style={{ background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px)' }}>
        {/* ── Mobile header row 1: logo + actions ── */}
        <div className="md:hidden flex items-center justify-between px-4 pt-3 pb-2">
          <button onClick={() => { setMode('discover'); setMobileTab('discover'); setKoCat(null) }} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>M</div>
            <span className="font-black text-sm tracking-tight" style={{ color: '#a3abff' }}>
              Mitä tänään
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBellClick}
              title={pushEnabled ? 'Peruuta ilmoitukset' : 'Tilaa päiväilmoitukset'}
              className={`p-2 rounded-xl border transition-all ${pushEnabled ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15 text-[#a3abff]' : 'border-white/8 text-white/40 bg-white/4 hover:text-white/70'}`}
            >
              <Bell size={15} />
            </button>
            <button
              onClick={() => openOverlayMode('map')}
              title={t('nav.map')}
              className={`relative p-2 rounded-xl border transition-all ${mode === 'map' ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 bg-white/4 hover:text-white/70'}`}
            >
              <span className="text-[15px] leading-none">🗺</span>
            </button>
            <button
              onClick={() => openOverlayMode('favorites')}
              title={t('fav.title')}
              className={`relative p-2 rounded-xl border transition-all ${mode === 'favorites' ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 bg-white/4 hover:text-white/70'}`}
            >
              <Heart size={15} fill={favCount > 0 ? '#6b76ff' : 'none'} style={{ color: '#6b76ff' }} />
              {favCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>{favCount}</span>
              )}
            </button>
            <button onClick={() => setShowJarjestajaForm((p) => !p)}
              title={t('form.add_event')}
              className={`relative p-2 rounded-xl border transition-all ${showJarjestajaForm ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 text-white/40 bg-white/4'}`}
              style={showJarjestajaForm ? { color: '#6b76ff' } : {}}>
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        {/* ── Mobile header row 2: search ── */}
        <div className="md:hidden px-4 pb-3">
          <SearchBar
            value={keyword}
            onChange={(v) => { setKeyword(v); if (v) { setMode('discover'); setMobileTab('discover'); setKoCat(null) } }}
            activityHits={localSearchHits.activities}
            restaurantHits={localSearchHits.restaurants}
            onSelectActivity={handleSelectActivity}
            onSelectRestaurant={handleSelectRestaurant}
          />
        </div>

        {/* ── Desktop header: single row ── */}
        <div className="hidden md:flex max-w-6xl mx-auto px-4 py-3 items-center gap-3">
          <button onClick={() => { setMode('discover'); setMobileTab('discover'); setKoCat(null) }} className="shrink-0 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>M</div>
            <span className="font-black text-sm tracking-tight" style={{ color: '#a3abff' }}>
              Mitä tänään
            </span>
          </button>

          <div className="flex gap-0.5 bg-white/5 rounded-xl p-1">
            {(['discover', 'idea', 'restaurants', 'activities'] as AppMode[]).map((m) => (
              <button key={m} onClick={() => { setMode(m); setMobileTab(m as typeof mobileTab); if (m === 'discover') setKoCat(null) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === m ? 'text-white' : 'text-white/35 hover:text-white/65'}`}
                style={mode === m ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)' } : {}}>
                {m === 'discover' ? `🏠 ${t('nav.home')}` : m === 'idea' ? `🎲 ${t('nav.idea')}` : m === 'restaurants' ? `🍽 ${t('nav.restaurants')}` : `🧖 ${t('nav.activities')}`}
              </button>
            ))}
            <Link href="/suunnittele"
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-white/35 hover:text-white/65"
              style={{ textDecoration: 'none' }}>
              ✈️ Suunnittele
            </Link>
          </div>

          <div className="flex-1 max-w-md">
            <SearchBar
            value={keyword}
            onChange={(v) => { setKeyword(v); if (v) { setMode('discover'); setMobileTab('discover'); setKoCat(null) } }}
            activityHits={localSearchHits.activities}
            restaurantHits={localSearchHits.restaurants}
            onSelectActivity={handleSelectActivity}
            onSelectRestaurant={handleSelectRestaurant}
          />
          </div>

          <button
            onClick={handleBellClick}
            title={pushEnabled ? 'Peruuta ilmoitukset' : 'Tilaa päiväilmoitukset'}
            className={`shrink-0 p-2 rounded-xl border transition-all ${pushEnabled ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15 text-[#a3abff]' : 'border-white/8 text-white/40 bg-white/4 hover:text-white/70'}`}
          >
            <Bell size={15} />
          </button>

          <button
            onClick={() => openOverlayMode('map')}
            title={t('nav.map')}
            className={`relative shrink-0 p-2 rounded-xl border transition-all ${mode === 'map' ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 bg-white/4 hover:text-white/70'}`}
          >
            <span className="text-[15px] leading-none">🗺</span>
          </button>

          <button
            onClick={() => openOverlayMode('favorites')}
            title={t('fav.title')}
            className={`relative shrink-0 p-2 rounded-xl border transition-all ${mode === 'favorites' ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 bg-white/4 hover:text-white/70'}`}
          >
            <Heart size={15} fill={favCount > 0 ? '#6b76ff' : 'none'} style={{ color: '#6b76ff' }} />
            {favCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>{favCount}</span>
            )}
          </button>

          <button onClick={() => setShowJarjestajaForm((p) => !p)}
            title={t('form.add_event')}
            className={`relative shrink-0 p-2 rounded-xl border transition-all ${showJarjestajaForm ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 text-white/40 bg-white/4 hover:text-white/70'}`}
            style={showJarjestajaForm ? { color: '#6b76ff' } : {}}>
            <Plus size={16} strokeWidth={2.5} />
          </button>
        </div>

      </header>

      {/* ══ FAVORITES ══ */}
      {mode === 'favorites' && (
        <main className="max-w-2xl mx-auto px-4 pt-4 pb-24 space-y-4">
          {/* Heading + ‹ back */}
          <div className="flex items-center gap-3">
            <button onClick={goBack} aria-label="Takaisin"
              className="shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center border transition-all border-white/10 bg-white/8 hover:bg-white/14">
              <ChevronLeft size={18} className="text-white" />
            </button>
            <Heart size={22} fill="#6b76ff" style={{ color: '#6b76ff' }} />
            <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.6rem,5vw,2.4rem)', letterSpacing: '-0.03em' }}>
              {t('fav.title')}
            </h1>
            <span className="text-white/35 text-sm font-bold">· {favCount} {t('fav.saved_count')}</span>
          </div>

          {favorites.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-4 text-center">
              <Heart size={48} className="text-white/8" />
              <p className="text-white/30 font-bold">{t('fav.empty')}</p>
              <p className="text-white/15 text-sm">{t('fav.hint')}</p>
              <button onClick={() => { setMode('discover'); setMobileTab('discover'); setKoCat(null) }}
                className="px-5 py-2.5 rounded-full text-sm font-black text-white"
                style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                {t('fav.browse')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {[...favorites]
                .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                .map((e) => {
                  const isToday = new Date(e.startTime).toDateString() === new Date().toDateString()
                  const timeStr = new Date(e.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
                  const dateStr = isToday ? 'Tänään' : new Date(e.startTime).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                  return (
                    <button key={e.id} onClick={() => setSelectedEvent(e)}
                      className="w-full text-left rounded-2xl overflow-hidden flex gap-0 transition-all active:scale-[.99]"
                      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                      {e.image && (
                        <div className="relative shrink-0 w-28" style={{ aspectRatio: '3/4' }}>
                          <img src={e.image} alt={e.title} className="absolute inset-0 w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 p-4 space-y-1.5 min-w-0">
                        <div className="flex items-start gap-2 justify-between">
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(107,118,255,.12)', color: '#a3abff' }}>
                            {dateStr} {timeStr}
                          </span>
                          {e.isFree && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">{t('common.free_badge')}</span>
                          )}
                        </div>
                        <h3 className="font-black text-white text-sm leading-tight line-clamp-2" style={{ letterSpacing: '-0.01em' }}>{e.title}</h3>
                        {e.location?.name && (
                          <p className="text-white/35 text-xs truncate">{e.location.name}</p>
                        )}
                        {!e.isFree && e.price && (
                          <p className="text-white/30 text-xs">{e.price}</p>
                        )}
                        {(e.ticketUrl || e.infoUrl) && (
                          <a href={e.ticketUrl ?? e.infoUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                            onClick={ev => ev.stopPropagation()}
                            className="inline-block text-[11px] font-black px-3 py-1 rounded-full text-white"
                            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                            {e.ticketUrl ? `${t('detail.buy_tickets')} →` : `${t('common.more_info')} →`}
                          </a>
                        )}
                      </div>
                    </button>
                  )
                })}
            </div>
          )}
        </main>
      )}

      {/* ══ DISCOVER ══ */}
      {mode === 'discover' && (
        <main className="max-w-6xl mx-auto px-4 pt-5 pb-20 space-y-5">

          {/* City headline */}
          <div>
            <h1 className="font-black text-white leading-none select-none"
              style={{ fontSize: 'clamp(2.8rem,12vw,8rem)', letterSpacing: '-0.04em' }}>
              {municipality.toUpperCase()}
            </h1>
            <p className="text-white/18 text-[11px] font-bold tracking-[0.3em] uppercase mt-1">
              {new Date().toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              {/* Tuoreusleima: montako lähdettä vastasi ja milloin — vajaa data ei saa olla näkymätöntä */}
              {fetchingFull ? (
                <span className="normal-case tracking-normal"> · päivitetään lähteitä…</span>
              ) : generatedAt && sources.length > 1 ? (
                <span className="normal-case tracking-normal">
                  {' · '}{okSourceCount} lähdettä · klo {formatTime(generatedAt)}
                  {failedSourceCount > 0 && ` · ${failedSourceCount} ei vastannut`}
                </span>
              ) : null}
            </p>
          </div>

          {/* Date strip */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 items-center">
            {([
              { d: 'today' as DateFilter, label: t('date.today') },
              { d: 'tonight' as DateFilter, label: '🌙 ' + t('date.tonight_short') },
              { d: 'tomorrow' as DateFilter, label: t('date.tomorrow') },
              { d: 'weekend' as DateFilter, label: '🎉 ' + t('date.weekend') },
              { d: 'week' as DateFilter, label: t('date.week_short') },
            ]).map(({ d, label }) => {
              const isActive = dateFilter === d && !customDate && !customDateEnd
              return (
                <button key={d} onClick={() => { setDateFilter(d); setCustomDate(''); setCustomDateEnd(''); setLiveOnly(false) }}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-black transition-all ${
                    isActive ? 'text-white' : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/65'
                  }`}
                  style={isActive ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 4px 16px -4px rgba(91,101,230,.4)' } : {}}>
                  {label}
                </button>
              )
            })}
            <DatePicker size="md" value={customDate} valueEnd={customDateEnd} onChangeRange={handleRangeChange} onChange={(v) => { setCustomDate(v); setCustomDateEnd(''); setDateFilter(v ? 'custom' : 'today'); setLiveOnly(false) }} />
            <button
              onClick={handleNearbyToggle}
              title={geo.denied ? 'Sijaintia ei sallittu' : 'Lähellä sinua'}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-black transition-all ${
                nearbyMode && geo.coords ? 'text-white' : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/65'
              }`}
              style={nearbyMode && geo.coords ? { background: 'linear-gradient(150deg,#0ea5e9,#0284c7)', boxShadow: '0 4px 16px -4px rgba(14,165,233,.4)' } : {}}>
              {geo.loading ? '⏳' : geo.denied ? '📍✕' : '📍'} Lähellä
            </button>
            <button
              onClick={() => {
                // Käynnissä olevat ovat alkaneet ennen nyt-hetkeä → tonight-raja (17→)
                // piilottaisi ne, joten pakota päiväksi 'today' kun suodatin kytketään.
                setLiveOnly(v => !v)
                if (!liveOnly) { setDateFilter('today'); setCustomDate(''); setCustomDateEnd('') }
              }}
              title="Käynnissä juuri nyt"
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-black transition-all ${
                liveOnly ? 'text-white' : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/65'
              }`}
              style={liveOnly ? { background: 'linear-gradient(150deg,#ef4444,#b91c1c)', boxShadow: '0 4px 16px -4px rgba(239,68,68,.4)' } : {}}>
              🔴 Nyt menossa
            </button>
          </div>

          {/* Aktiivinen filtteripalkki — ilmestyy kun kategoria valittu */}
          {(activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all' || liveOnly) && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl"
              style={{ background: 'rgba(107,118,255,.08)', border: '1px solid rgba(107,118,255,.2)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-black text-[13px]" style={{ color: '#a3abff' }}>
                  {activeFilterLabel}
                </span>
                <span className="text-[12px]" style={{ color: 'rgba(255,255,255,.3)' }}>
                  · {discoverEvents.length} {t('discover.events_count')}
                </span>
              </div>
              <button
                onClick={clearFilters}
                className="text-[12px] font-black flex-shrink-0 ml-3 px-3 py-1 rounded-full transition-all"
                style={{ color: 'rgba(255,255,255,.4)', border: '1px solid rgba(255,255,255,.1)' }}
              >
                {t('discover.exit_search')}
              </button>
            </div>
          )}


          {/* ── Loading skeleton — näkyy vain kun tapahtumia ei vielä ole ── */}
          {loading && baseEvents.length === 0 && (
            <div className="space-y-5">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: '-0.01em' }}>Haetaan tapahtumia</span>
              </div>
              {[0, 1, 2].map(i => (
                <div key={i} className="space-y-3">
                  <div className="h-4 rounded-lg skeleton-shimmer" style={{ width: 80 + i * 24 }} />
                  <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4">
                    {[0, 1, 2, 3].map(j => (
                      <div key={j} className="shrink-0 w-40 rounded-[18px] skeleton-shimmer" style={{ aspectRatio: '3/4', flexShrink: 0 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ KATEGORIAN PYSTYLISTA (koCat) — ← Takaisin + rikkaat kortit ═══ */}
          {koCat && !keyword && activeVibes.length === 0 && activeCategories.length === 0 && priceFilter === 'all' && !liveOnly && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setKoCat(null)}
                  className="shrink-0 flex items-center gap-1 px-3.5 py-2 rounded-full text-[13px] font-black text-white/70 hover:text-white transition-all"
                  style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
                  ← {t('common.back')}
                </button>
                <h2 className="font-black text-white text-[19px] leading-none" style={{ letterSpacing: '-0.02em' }}>
                  {koCat === 'ilmainen' ? `🎁 ${t('discover.carousel_free')}` : `${VIBES.find(v => v.id === koCat)?.emoji ?? ''} ${VIBES.find(v => v.id === koCat)?.label ?? ''}`}
                </h2>
                <span className="text-white/30 text-[13px] font-bold">· {koCatEvents.length}</span>
              </div>
              {koCatEvents.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center gap-3">
                  <span className="text-4xl">🫥</span>
                  <p className="text-white/40 font-bold">{t('discover.no_filter_match')}</p>
                  <p className="text-white/20 text-sm">{t('discover.quiet_sub')}</p>
                </div>
              ) : (
                /* Mobiilissa designin pystylista; leveällä 2 korttia vierekkäin */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  {koCatEvents.map((e) => (
                    <EventCard key={e.id} event={e} onClick={setSelectedEvent}
                      distance={geo.coords && e.location?.lat && e.location?.lon
                        ? haversineKm(geo.coords.lat, geo.coords.lon, e.location.lat, e.location.lon)
                        : undefined} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ═══ ETUSIVU (koFront) — hero → ruudukko → kompaktit rivit → aihepiirit ═══ */}
          {!koCat && !keyword && activeVibes.length === 0 && activeCategories.length === 0 && priceFilter === 'all' && !liveOnly && (
            <>
              {/* Tilarivi: vihreä pulssipiste + päivän tapahtumamäärä */}
              {!loading && baseEvents.length > 0 && (
                <div className="flex items-center gap-2 -mb-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#5fd9a6', boxShadow: '0 0 8px rgba(95,217,166,.8)', animation: 'pulse-glow 2s ease-in-out infinite' }} />
                  <span className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,.55)' }}>
                    {baseEvents.length} {dateFilter === 'today' || dateFilter === 'tonight' ? t('discover.events_today') : t('discover.events_count')}
                  </span>
                </div>
              )}

              {/* HERO: 🎸 Illan keikat — pyyhkäistävä, 5 nostoa */}
              {!loading && <HeroSwiper events={heroGigs} onOpen={setSelectedEvent} />}

              {/* Kategoriaruudukko */}
              {!loading && baseEvents.length > 0 && (
                <section>
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="font-black text-white text-[18px]" style={{ letterSpacing: '-0.02em' }}>{t('discover.grid_title')}</h2>
                    <span className="text-[12px] font-bold text-white/30">{t('discover.grid_sub')}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {HOME_GRID_TILES.map(({ id, tint }) => {
                      const vibe = VIBES.find(v => v.id === id)
                      if (!vibe) return null
                      return (
                        <button key={id} onClick={() => setKoCat(id)}
                          className="flex flex-col items-center justify-center gap-1.5 rounded-[16px] py-4 px-1 transition-transform active:scale-95"
                          style={{
                            background: `radial-gradient(120% 100% at 50% 0%, rgba(${tint},.16), rgba(255,255,255,.03) 70%)`,
                            border: '1px solid rgba(255,255,255,.07)',
                          }}>
                          <span className="text-[26px] leading-none">{vibe.emoji}</span>
                          <span className="text-[11px] font-black text-white/85 text-center leading-tight">{t(vibe.tKey as TranslationKey)}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Kompaktit vaakarivit: Illan parhaat + Ilmaiseksi tänään */}
              {!loading && carousels.map(row => (
                <CarouselRow key={row.id} title={row.title} events={row.events} onClick={setSelectedEvent}
                  onSeeAll={row.id === 'ilmainen' ? () => setKoCat('ilmainen') : undefined} />
              ))}

              {/* Phase 2 spinner */}
              {fetchingFull && baseEvents.length > 0 && (
                <div className="flex items-center justify-center gap-2 py-3">
                  <Loader2 size={14} className="animate-spin text-white/30" />
                  <span className="text-white/30 text-[13px]">Haetaan lisää...</span>
                </div>
              )}

              {/* 🎨 Kaikki aihepiirit — keskitetty pilleri */}
              {!loading && baseEvents.length > 0 && (
                <div className="flex justify-center pt-1">
                  <button onClick={() => setShowVibePanel(true)}
                    className="flex items-center gap-2 px-5 py-3 rounded-full text-[13.5px] font-black text-white transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
                    🎨 {t('discover.all_vibes')}
                    <span className="text-white/40">▾</span>
                  </button>
                </div>
              )}

              {/* Suunnittele-linkki mobiilissa (poistui alapalkista) */}
              <div className="md:hidden flex justify-center">
                <Link href="/suunnittele" className="text-[12px] font-bold text-white/35 hover:text-white/60 transition-colors" style={{ textDecoration: 'none' }}>
                  ✈️ Suunnittele täydellinen ilta →
                </Link>
              </div>
            </>
          )}

          {/* ── Flat grid — näkyy kun keyword, kategoria, vibe tai Nyt menossa valittu ── */}
          {(keyword || activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all' || liveOnly) && discoverEvents.length > 0 && (
            <section>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {discoverEvents.map(e => (
                  <PosterCard key={e.id} event={e} onClick={setSelectedEvent}
                    distance={geo.coords && e.location?.lat && e.location?.lon
                      ? haversineKm(geo.coords.lat, geo.coords.lon, e.location.lat, e.location.lon)
                      : undefined} />
                ))}
              </div>
              <div ref={sentinelRef} className="h-1" />
              {(loading || fetchingFull) && <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-white/30" /></div>}
            </section>
          )}

          {/* ── Nyt menossa: tyhjä tila — ilman tätä alue jäisi selittämättä tyhjäksi ── */}
          {liveOnly && !loading && !fetchingFull && discoverEvents.length === 0 && baseEvents.length > 0 && (
            <div className="flex flex-col items-center py-16 text-center gap-3">
              <span className="text-4xl">🌃</span>
              <div>
                <p className="text-white/40 font-bold">Ei mitään käynnissä juuri nyt</p>
                <p className="text-white/20 text-sm mt-1">Katso 🌙 Illalla — illan menot alkavat pian</p>
              </div>
            </div>
          )}

          {!loading && !fetchingFull && baseEvents.length === 0 && (
            <EmptyState
              keyword={keyword}
              activeVibes={activeVibes}
              activeCategories={activeCategories}
              priceFilter={priceFilter}
              dateFilter={dateFilter}
              onClear={clearFilters}
              onDateChange={(d) => { setDateFilter(d); setCustomDate(''); setLiveOnly(false) }}
            />
          )}


          {/* Newsletter signup */}
          <NewsletterBanner />

        </main>
      )}

      {/* ══ IDEA ══ */}
      {mode === 'idea' && (
        <IdeaView
          events={filteredEvents}
          onShowOnMap={(lat, lon, name, type) => handleShowOnMap(lat, lon, name, type)}
          onEventClick={setSelectedEvent}
        />
      )}

      {/* ══ MAP ══ */}
      {mode === 'map' && (
        <main className="px-2 pt-2 pb-0">
          <div className="flex items-center gap-3 px-2 pb-2">
            <button onClick={goBack} aria-label="Takaisin"
              className="shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center border transition-all border-white/10 bg-white/8 hover:bg-white/14">
              <ChevronLeft size={18} className="text-white" />
            </button>
            <h1 className="font-black text-white leading-none text-[22px]" style={{ letterSpacing: '-0.02em' }}>
              {t('nav.map')}
            </h1>
          </div>
          <MapView events={filteredEvents} onEventClick={setSelectedEvent} mapTarget={mapTarget} onTargetConsumed={() => setMapTarget(null)}/>
        </main>
      )}

      {/* ══ RESTAURANTS ══ */}
      {mode === 'restaurants' && <RestaurantsView onShowOnMap={(lat, lon, name) => handleShowOnMap(lat, lon, name, 'restaurant')} jumpToId={jumpToRestaurant?.id} jumpToKey={jumpToRestaurant} />}

      {/* ══ ACTIVITIES ══ */}
      {mode === 'activities' && <ActivitiesView onShowOnMap={(lat, lon, name) => handleShowOnMap(lat, lon, name, 'activity')} />}

      {/* ── MOBILE NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/7"
        style={{ background: 'rgba(10,10,12,0.94)', backdropFilter: 'blur(18px)', height: 72, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-4 h-full">
          {([
            { tab: 'discover' as const,     emoji: '🏠', labelKey: 'nav.home'        },
            { tab: 'idea' as const,          emoji: '🎲', labelKey: 'nav.idea'        },
            { tab: 'restaurants' as const,   emoji: '🍽', labelKey: 'nav.restaurants' },
            { tab: 'activities' as const,    emoji: '🧖', labelKey: 'nav.activities'  },
          ] as const).map(({ tab, emoji, labelKey }) => {
            const isActive = mobileTab === tab
            return (
              <button key={tab} onClick={() => handleMobileTab(tab)}
                className="relative flex flex-col items-center justify-center gap-0.5 transition-all"
                style={{ color: isActive ? '#6b76ff' : 'rgba(255,255,255,0.4)' }}>
                <span className="text-lg leading-none" style={isActive ? { filter: 'drop-shadow(0 0 8px rgba(91,101,230,.5))' } : {}}>{emoji}</span>
                <span className="text-[10px] font-bold">{t(labelKey)}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Aihepiiripaneeli — valinta avaa kategorian pystylistan (koCat) */}
      <VibePanel
        open={showVibePanel}
        active={koCat ? [koCat] : []}
        onToggle={(id) => {
          setKoCat(id === 'kaikki' ? null : id)
          setShowVibePanel(false)
        }}
        onClear={() => setKoCat(null)}
        onClose={() => setShowVibePanel(false)}
      />

      <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)}/>
      <InstallBanner/>

      {showEiTieda && (
        <EiTiedaModal
          events={filteredEvents}
          mode={eiTiedaMode}
          onClose={() => setShowEiTieda(false)}
          onSelect={(e) => { setSelectedEvent(e); setShowEiTieda(false) }}
        />
      )}

      {showJarjestajaForm && (
        <JarjestajaForm onClose={() => setShowJarjestajaForm(false)} />
      )}
    </div>
  )
}
