'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Fragment, useState, useCallback, useMemo, useEffect } from 'react'
import { Loader2, SlidersHorizontal, Heart, Bell } from 'lucide-react'
import { Event, DateFilter, PriceFilter, CATEGORIES, VIBES } from '@/lib/types'
import { useFavorites } from '@/contexts/FavoritesContext'
import { useEvents } from '@/hooks/useEvents'
import EventCard from '@/components/EventCard'
import FeedCard from '@/components/FeedCard'
import EventDetailPanel from '@/components/EventDetailPanel'
import SearchBar from '@/components/SearchBar'
import PosterCard from '@/components/PosterCard'
import InstallBanner from '@/components/InstallBanner'
import VibeBar from '@/components/VibeBar'
import DatePicker from '@/components/DatePicker'
import EiTiedaModal, { EiTiedaMode } from '@/components/EiTiedaModal'
import JarjestajaForm from '@/components/JarjestajaForm'
import NewsletterBanner from '@/components/NewsletterBanner'
import RestaurantsView from '@/components/RestaurantsView'
import ActivitiesView from '@/components/ActivitiesView'
import IdeaView from '@/components/IdeaView'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

interface EmptyStateProps {
  keyword: string
  activeVibes: string[]
  activeCategories: string[]
  priceFilter: PriceFilter
  dateFilter: DateFilter
  onClear: () => void
  onDateChange: (d: DateFilter) => void
}

// ── Horizontal carousel card ─────────────────────────────
function RowCard({ event, onClick }: { event: Event; onClick: (e: Event) => void }) {
  const { lang } = useLanguage()
  const now = Date.now()
  const start = new Date(event.startTime)
  const msUntil = start.getTime() - now
  const todayStr = new Date().toDateString()
  const isToday = start.toDateString() === todayStr
  const time = start.toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  let dateLabel = isToday
    ? `Tänään ${time}`
    : start.toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric' }) + ' ' + time
  if (msUntil > 0 && msUntil < 90 * 60 * 1000) dateLabel = `⏱ ${Math.round(msUntil / 60000)} min`
  return (
    <button
      onClick={() => onClick(event)}
      className="group shrink-0 w-40 text-left rounded-[18px] overflow-hidden"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}
    >
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/4' }}>
        {event.image ? (
          <img src={event.image} alt={event.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={e => { (e.target as HTMLElement).style.display = 'none' }} />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.9) 0%,rgba(10,10,12,.1) 50%,transparent 100%)' }} />
        <div className="absolute top-2 left-2">
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white/90" style={{ background: 'rgba(10,10,12,.7)', backdropFilter: 'blur(8px)' }}>{dateLabel}</span>
        </div>
        {event.isFree && (
          <div className="absolute top-2 right-2">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white bg-emerald-500">ILMAINEN</span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-white font-black text-[13px] leading-tight line-clamp-2" style={{ letterSpacing: '-0.01em' }}>{event.title}</p>
          {event.location?.name && <p className="text-white/50 text-[11px] truncate mt-0.5">{event.location.name}</p>}
        </div>
      </div>
      {!event.isFree && event.price && (
        <div className="px-3 py-2.5">
          <span className="text-[11px] font-black" style={{ color: '#a3abff' }}>Osta → {event.price}</span>
        </div>
      )}
    </button>
  )
}

// ── Carousel row ─────────────────────────────────────────
function CarouselRow({ title, events, onClick }: { title: string; events: Event[]; onClick: (e: Event) => void }) {
  const [expanded, setExpanded] = useState(false)
  if (events.length === 0) return null
  const hasMore = events.length > 10
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-white text-[17px] tracking-tight flex items-baseline gap-1.5" style={{ letterSpacing: '-0.02em' }}>
          {title}
          <span className="text-white/25 font-bold text-[13px]">· {events.length}</span>
        </h2>
        {hasMore && !expanded && (
          <button onClick={() => setExpanded(true)}
            className="text-[12px] font-black shrink-0 transition-colors"
            style={{ color: '#a3abff' }}>
            Katso kaikki {events.length} →
          </button>
        )}
        {expanded && (
          <button onClick={() => setExpanded(false)}
            className="text-[12px] font-black text-white/30 hover:text-white/60 shrink-0 transition-colors">
            Näytä vähemmän ↑
          </button>
        )}
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
const isSurprise = (e: Event) => matchesText(e, /sauna|melont|jooga|silent|pop.?up|taikur|sirkus|impro|flash|yömelont|saunavene/)
const isTerrace = (e: Event) => {
  const month = new Date().getMonth() + 1
  if (month < 6 || month > 8) return false
  return matchesText(e, /terassi|ulkoilma|outdoor|puisto|esplanadi|kasarmitori|allas|ranta|ulkoilta|kesäohjelma/)
}
function isAlkaaPian(e: Event): boolean {
  const ms = new Date(e.startTime).getTime() - Date.now()
  return ms > 0 && ms < 3 * 60 * 60 * 1000
}

function nightlifeScore(e: Event): number {
  const text = [e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase()
  if (/festivaali|festival|festarit/.test(text)) return 8
  if (/keikka|konsertti|live[\s-]?musiikki|bändi|gig/.test(text)) return 7
  if (/klubi|dj[\s-]?set|yökerho|disco|rave|after[\s-]?party/.test(text)) return 6
  if (/jääkiekko|jalkapallo|ottelu|urheilu|koripallo/.test(text)) return 5
  if (/stand[\s-]?up|komedia|comedy/.test(text)) return 4
  if (/baari|pub|cocktail|terassi/.test(text)) return 3
  if (/ravintola|illallinen|pop[\s-]?up|ruoka/.test(text)) return 2
  if (/näyttely|museo|luento|seminaari|workshop|työpaja/.test(text)) return -1
  return e.image ? 1 : 0
}

type AppMode = 'discover' | 'idea' | 'map' | 'favorites' | 'restaurants' | 'activities'
type ListStyle = 'feed' | 'grid'

export default function Home() {
  const { lang, setLang, t } = useLanguage()
  const { favorites, count: favCount } = useFavorites()
  const [mode, setMode] = useState<AppMode>('discover')
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
  const [mapTarget, setMapTarget] = useState<{ lat: number; lon: number; name: string; type?: 'event' | 'restaurant' | 'activity' } | null>(null)
  const { events, loading, error, hasMore, total, loadMore } = useEvents({
    dateFilter: mode === 'map' ? 'month' : dateFilter,
    customDate, customDateEnd, keyword, municipality, activeCategories, bbox: '',
  })

  const handleRangeChange = useCallback((start: string, end: string) => {
    setCustomDate(start)
    setCustomDateEnd(end)
    setDateFilter(start ? 'range' : 'today')
  }, [])

  const handleVibeToggle = useCallback((id: string) => {
    setActiveVibes((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id])
    // Map "ilmainen" vibe to price filter
    if (id === 'ilmainen') {
      setPriceFilter((p) => p === 'free' ? 'all' : 'free')
      return
    }
  }, [])

  const handleCategoryToggle = useCallback((id: string) => {
    setActiveCategories((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id])
  }, [])

  const clearFilters = useCallback(() => {
    setActiveCategories([]); setActiveVibes([]); setKeyword('')
    setDateFilter('today'); setMunicipality('helsinki')
    setPriceFilter('all'); setCustomDate(''); setCustomDateEnd('')
  }, [])

  const handleShowOnMap = useCallback((lat: number, lon: number, name: string, type?: 'event' | 'restaurant' | 'activity') => {
    setMapTarget({ lat, lon, name, type })
    setMode('map')
    setMobileTab('map')
  }, [])

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
    if (tab === 'discover') setMode('discover')
    else if (tab === 'idea') setMode('idea')
    else if (tab === 'map') setMode('map')
    else if (tab === 'favorites') setMode('favorites')
    else if (tab === 'restaurants') setMode('restaurants')
    else if (tab === 'activities') setMode('activities')
  }, [])

// Vibe-based client filter on top of API results
  const filteredEvents = useMemo(() => {
    let result = events

    // Vibe filter — substring match; Yöelämä also matches evening start times
    const activeVibeIds = activeVibes.filter((v) => v !== 'ilmainen')
    if (activeVibeIds.length > 0) {
      const vibeKeywords = activeVibeIds.flatMap((id) => VIBES.find((v) => v.id === id)?.keywords ?? [])
      const isNightlife = activeVibeIds.includes('yoelama')
      result = result.filter((e) => {
        const haystack = [e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase()
        const kwMatch = vibeKeywords.some((kw) => haystack.includes(kw.toLowerCase()))
        // Evening events (19:30+) count as nightlife even without matching keywords
        const d = new Date(e.startTime)
        const eveningMatch = isNightlife && (d.getHours() > 19 || (d.getHours() === 19 && d.getMinutes() >= 30))
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
    return result
  }, [events, activeCategories, activeVibes, priceFilter])

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

  const heroEvent = useMemo(() => discoverEvents.find((e) => nightlifeScore(e) >= 3 && e.image) ?? null, [discoverEvents])

  const carousels = useMemo(() => [
    { id: 'pian',      title: 'Juuri sopivasti aikaa ⏱', events: baseEvents.filter(isAlkaaPian) },
    { id: 'parhaat',   title: 'Illan parhaat ✦',         events: baseEvents.filter(e => nightlifeScore(e) >= 3 && !!e.image) },
    { id: 'ilmainen',  title: 'Ilmaiseksi tänään 🎁',    events: baseEvents.filter(e => e.isFree) },
    { id: 'terassit',  title: 'Kesäillan terassit ☀️',   events: baseEvents.filter(isTerrace) },
    { id: 'ylatys',    title: 'Erilainen ilta ✨',        events: baseEvents.filter(isSurprise) },
  ].filter(r => r.events.length > 0), [baseEvents])

  const activeCount = activeVibes.length + activeCategories.length + (priceFilter !== 'all' ? 1 : 0)

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
          <button onClick={() => { setMode('discover'); setMobileTab('discover') }} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>M</div>
            <span className="font-black text-sm tracking-tight" style={{ color: '#a3abff' }}>
              Mitä tänään
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setLang(lang === 'fi' ? 'en' : 'fi')}
              className="text-[11px] font-black px-2.5 py-1.5 rounded-xl border border-white/10 text-white/45 hover:text-white hover:border-white/20 transition-all bg-white/3">
              {lang === 'fi' ? 'EN' : 'FI'}
            </button>
            <button
              onClick={async () => { if (typeof Notification === 'undefined') return; await Notification.requestPermission() }}
              className="p-2 rounded-xl border border-white/8 text-white/40 bg-white/4 hover:text-white/70 transition-all"
            >
              <Bell size={15} />
            </button>
            <button onClick={() => setShowFilters((p) => !p)}
              className={`relative p-2 rounded-xl border transition-all ${showFilters ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 text-white/40 bg-white/4'}`}
              style={showFilters ? { color: '#6b76ff' } : {}}>
              <SlidersHorizontal size={15} />
              {activeCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>{activeCount}</span>
              )}
            </button>
          </div>
        </div>
        {/* ── Mobile header row 2: search ── */}
        <div className="md:hidden px-4 pb-3">
          <SearchBar value={keyword} onChange={(v) => { setKeyword(v); if (v) { setMode('discover'); setMobileTab('discover') } }} />
        </div>

        {/* ── Desktop header: single row ── */}
        <div className="hidden md:flex max-w-6xl mx-auto px-4 py-3 items-center gap-3">
          <button onClick={() => { setMode('discover'); setMobileTab('discover') }} className="shrink-0 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>M</div>
            <span className="font-black text-sm tracking-tight" style={{ color: '#a3abff' }}>
              Mitä tänään
            </span>
          </button>

          <div className="flex gap-0.5 bg-white/5 rounded-xl p-1">
            {(['discover', 'idea', 'restaurants', 'activities', 'map', 'favorites'] as AppMode[]).map((m) => (
              <button key={m} onClick={() => { setMode(m); setMobileTab(m as typeof mobileTab) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === m ? 'text-white' : 'text-white/35 hover:text-white/65'}`}
                style={mode === m ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)' } : {}}>
                {m === 'discover' ? `🏠 ${t('nav.home')}` : m === 'idea' ? `🎲 ${t('nav.idea')}` : m === 'map' ? `🗺 ${t('nav.map')}` : m === 'restaurants' ? `🍽 ${t('nav.restaurants')}` : m === 'activities' ? `🧖 ${t('nav.activities')}` : `♥ ${t('nav.favorites')}`}
              </button>
            ))}
          </div>

          <div className="flex-1 max-w-md">
            <SearchBar value={keyword} onChange={(v) => { setKeyword(v); if (v) { setMode('discover'); setMobileTab('discover') } }} />
          </div>

          <button onClick={() => setLang(lang === 'fi' ? 'en' : 'fi')}
            className="shrink-0 text-[11px] font-black px-3 py-1.5 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition-all bg-white/3">
            {lang === 'fi' ? '🇬🇧 EN' : '🇫🇮 FI'}
          </button>

          <button
            onClick={async () => { if (typeof Notification === 'undefined') return; await Notification.requestPermission() }}
            className="shrink-0 p-2 rounded-xl border border-white/8 text-white/40 bg-white/4 hover:text-white/70 transition-all"
            title="Tilaa ilmoitukset"
          >
            <Bell size={15} />
          </button>

          <button onClick={() => setShowFilters((p) => !p)}
            className={`relative shrink-0 p-2 rounded-xl border transition-all ${showFilters ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 text-white/40 bg-white/4 hover:text-white/70'}`}
            style={showFilters ? { color: '#6b76ff' } : {}}>
            <SlidersHorizontal size={15} />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>{activeCount}</span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="border-t border-white/5 px-4 py-4 max-w-6xl mx-auto space-y-3">
            {/* Date row */}
            <div className="flex flex-wrap gap-2 items-center">
              {(['today','tonight','tomorrow','weekend','week','month'] as DateFilter[]).map((d) => {
                const dateLabels: Record<string, string> = {
                  today:   t('date.today'),
                  tonight: `🌙 ${t('filter.tonight_short')}`,
                  tomorrow:t('date.tomorrow'),
                  weekend: `🎉 ${t('date.weekend')}`,
                  week:    t('filter.week_short'),
                  month:   t('date.month'),
                }
                const isActive = dateFilter === d && !customDate && !customDateEnd
                return (
                  <button key={d} onClick={() => { setDateFilter(d); setCustomDate(''); setCustomDateEnd('') }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${isActive ? 'text-white border-transparent' : 'text-white/40 border-white/10 hover:text-white/70'}`}
                    style={isActive ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', borderColor: 'transparent' } : {}}>
                    {dateLabels[d]}
                  </button>
                )
              })}
              <DatePicker size="sm" value={customDate} valueEnd={customDateEnd} onChangeRange={handleRangeChange} onChange={(v) => { setCustomDate(v); setCustomDateEnd(''); setDateFilter(v ? 'custom' : 'today') }} />
            </div>
            {/* Price row */}
            <div className="flex gap-2">
              {(['all','free','paid'] as PriceFilter[]).map((p) => {
                const priceLabels: Record<string, string> = {
                  all:  t('filter.all_price'),
                  free: t('filter.free'),
                  paid: t('filter.paid'),
                }
                return (
                  <button key={p} onClick={() => setPriceFilter(p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${priceFilter === p ? 'bg-white/12 border-white/20 text-white' : 'text-white/40 border-white/8 hover:text-white/60'}`}>
                    {priceLabels[p]}
                  </button>
                )
              })}
              {activeCount > 0 && (
                <button onClick={clearFilters} className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold text-white/30 border border-white/8 hover:text-white/60 transition-all">
                  {t('common.clear_all')}
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ══ FAVORITES ══ */}
      {mode === 'favorites' && (
        <main className="max-w-2xl mx-auto px-4 pt-4 pb-24 space-y-4">
          {/* Heading */}
          <div>
            <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">HELSINKI</p>
            <div className="flex items-center gap-3">
              <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.8rem,6vw,3rem)', letterSpacing: '-0.03em' }}>
                {t('fav.title')}
              </h1>
              {favCount > 0 && (
                <span className="px-2.5 py-1 rounded-full text-sm font-black" style={{ background: 'rgba(107,118,255,.12)', color: '#6b76ff' }}>
                  {favCount}
                </span>
              )}
            </div>
          </div>

          {favorites.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-4 text-center">
              <Heart size={48} className="text-white/8" />
              <p className="text-white/30 font-bold">{t('fav.empty')}</p>
              <p className="text-white/15 text-sm">{t('fav.hint')}</p>
              <button onClick={() => { setMode('discover'); setMobileTab('discover') }}
                className="px-5 py-2.5 rounded-full text-sm font-black text-white"
                style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                Selaa tapahtumia →
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
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">ILMAINEN</span>
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
                            {e.ticketUrl ? 'Osta liput →' : 'Lisätietoja →'}
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
            </p>
          </div>

          {/* Date strip */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 items-center">
            {([
              { d: 'today' as DateFilter, label: t('date.today') },
              { d: 'tomorrow' as DateFilter, label: t('date.tomorrow') },
              { d: 'weekend' as DateFilter, label: '🎉 ' + t('date.weekend') },
              { d: 'week' as DateFilter, label: t('date.week_short') },
            ]).map(({ d, label }) => {
              const isActive = dateFilter === d && !customDate && !customDateEnd
              return (
                <button key={d} onClick={() => { setDateFilter(d); setCustomDate(''); setCustomDateEnd('') }}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-black transition-all ${
                    isActive ? 'text-white' : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/65'
                  }`}
                  style={isActive ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 4px 16px -4px rgba(91,101,230,.4)' } : {}}>
                  {label}
                </button>
              )
            })}
            <DatePicker size="md" value={customDate} valueEnd={customDateEnd} onChangeRange={handleRangeChange} onChange={(v) => { setCustomDate(v); setCustomDateEnd(''); setDateFilter(v ? 'custom' : 'today') }} />
          </div>

          {/* Aktiivinen filtteripalkki — ilmestyy kun kategoria valittu */}
          {(activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all') && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl"
              style={{ background: 'rgba(107,118,255,.08)', border: '1px solid rgba(107,118,255,.2)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-black text-[13px]" style={{ color: '#a3abff' }}>
                  {activeVibes[0]
                    ? (VIBES.find(v => v.id === activeVibes[0])?.emoji + ' ' + VIBES.find(v => v.id === activeVibes[0])?.label)
                    : priceFilter === 'free' ? '🎁 Ilmainen' : 'Suodatettu'}
                </span>
                <span className="text-[12px]" style={{ color: 'rgba(255,255,255,.3)' }}>
                  · {discoverEvents.length} tapahtumaa
                </span>
              </div>
              <button
                onClick={clearFilters}
                className="text-[12px] font-black flex-shrink-0 ml-3 px-3 py-1 rounded-full transition-all"
                style={{ color: 'rgba(255,255,255,.4)', border: '1px solid rgba(255,255,255,.1)' }}
              >
                Poistu hausta ×
              </button>
            </div>
          )}

          {/* Loading skeletons */}
          {loading && baseEvents.length === 0 && (
            <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="shrink-0 w-40 rounded-[18px] overflow-hidden bg-white/4 animate-pulse" style={{ aspectRatio: '3/4' }} />
              ))}
            </div>
          )}

          {/* ── Hero "ILLAN NOSTO" ── */}
          {heroEvent && (
            <button onClick={() => setSelectedEvent(heroEvent)}
              className="group relative w-full rounded-[22px] overflow-hidden text-left"
              style={{ aspectRatio: '16/10', boxShadow: '0 22px 50px -20px rgba(91,101,230,.4)' }}>
              <img src={heroEvent.image!} alt={heroEvent.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,0.97) 0%,rgba(10,10,12,0.2) 55%,transparent 100%)' }} />
              {/* Badges row */}
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="text-[9px] font-black px-2.5 py-1 rounded-full text-white tracking-[.08em] uppercase" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>✦ ILLAN NOSTO</span>
                {heroEvent.categories[0] && (
                  <span className="text-[9px] font-black px-2.5 py-1 rounded-full text-white/80 uppercase tracking-[.08em]" style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.15)' }}>
                    {heroEvent.categories[0]}
                  </span>
                )}
              </div>
              {/* Heart */}
              <button className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.15)' }}
                onClick={e => { e.stopPropagation(); /* handled via EventDetailPanel heart */ }}>
                <Heart size={14} className="text-white/70" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 p-5">
                {heroEvent.location?.name && (
                  <p className="text-[11px] font-black uppercase tracking-[.1em] mb-1" style={{ color: 'rgba(255,255,255,.5)' }}>
                    {heroEvent.categories[0] ? `${heroEvent.categories[0].toUpperCase()} · ` : ''}{heroEvent.location.name.toUpperCase()}
                  </p>
                )}
                <h2 className="font-black text-white leading-tight mb-3" style={{ fontSize: 'clamp(1.4rem,5vw,2rem)', letterSpacing: '-0.02em' }}>
                  {heroEvent.title}
                </h2>
                <div className="flex items-center gap-3">
                  {!heroEvent.isFree && heroEvent.price ? (
                    <span className="px-4 py-2 rounded-full text-white text-[13px] font-black" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 10px 24px -8px rgba(91,101,230,.85)' }}>
                      Liput alk. {heroEvent.price} →
                    </span>
                  ) : heroEvent.isFree ? (
                    <span className="px-4 py-2 rounded-full text-white text-[13px] font-black bg-emerald-500">Ilmainen →</span>
                  ) : null}
                  <span className="text-white/50 text-[13px] font-bold">
                    {new Date(heroEvent.startTime).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'long' }).replace(/^./, c => c.toUpperCase())} {new Date(heroEvent.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </button>
          )}

          {/* ── Carousel rows — piilotetaan kun filtteri aktiivinen ── */}
          {!loading && activeVibes.length === 0 && activeCategories.length === 0 && priceFilter === 'all' && carousels.map(row => (
            <CarouselRow key={row.id} title={row.title} events={row.events} onClick={setSelectedEvent} />
          ))}

          {/* ── Filtteröity grid — näkyy kun kategoria valittu ── */}
          {!loading && (activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all') && discoverEvents.length > 0 && (
            <section>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {discoverEvents.filter(e => e.id !== heroEvent?.id).map(e => (
                  <PosterCard key={e.id} event={e} onClick={setSelectedEvent} />
                ))}
              </div>
              {hasMore && (
                <button onClick={loadMore} disabled={loading}
                  className="w-full py-3 rounded-2xl text-sm font-black text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/8 transition-all flex items-center justify-center gap-2 mt-3">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                  {t('common.load_more')}
                </button>
              )}
            </section>
          )}

          {/* ── Selaa aihepiireittäin — ikonigridi karusellivien jälkeen ── */}
          {!loading && baseEvents.length > 0 && (
            <section>
              <h2 className="font-black text-white text-[17px] mb-4" style={{ letterSpacing: '-0.02em' }}>
                Selaa aihepiireittäin
              </h2>
              <VibeBar
                active={activeVibes}
                onClearAll={() => { setActiveVibes([]); setPriceFilter('all') }}
                onToggle={(id) => {
                  if (id === 'ilmainen') { setPriceFilter((p) => p === 'free' ? 'all' : 'free'); return }
                  setActiveVibes((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id])
                }}
              />
            </section>
          )}

          {!loading && baseEvents.length === 0 && (
            <EmptyState
              keyword={keyword}
              activeVibes={activeVibes}
              activeCategories={activeCategories}
              priceFilter={priceFilter}
              dateFilter={dateFilter}
              onClear={clearFilters}
              onDateChange={(d) => { setDateFilter(d); setCustomDate('') }}
            />
          )}


          {/* Newsletter signup */}
          <NewsletterBanner />

          {/* Organizer CTA */}
          <div className="flex items-center justify-center pb-2">
            <button
              onClick={() => setShowJarjestajaForm(true)}
              className="text-xs text-white/20 hover:text-white/50 transition-all font-bold"
            >
              {t('discover.add_event')}
            </button>
          </div>
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
          <MapView events={filteredEvents} onEventClick={setSelectedEvent} mapTarget={mapTarget} onTargetConsumed={() => setMapTarget(null)}/>
        </main>
      )}

      {/* ══ RESTAURANTS ══ */}
      {mode === 'restaurants' && <RestaurantsView onShowOnMap={(lat, lon, name) => handleShowOnMap(lat, lon, name, 'restaurant')} />}

      {/* ══ ACTIVITIES ══ */}
      {mode === 'activities' && <ActivitiesView onShowOnMap={(lat, lon, name) => handleShowOnMap(lat, lon, name, 'activity')} />}

      {/* ── MOBILE NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/7"
        style={{ background: 'rgba(10,10,12,0.94)', backdropFilter: 'blur(18px)', height: 72, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-6 h-full">
          {([
            { tab: 'discover' as const,     emoji: '🏠', labelKey: 'nav.home'        },
            { tab: 'idea' as const,          emoji: '🎲', labelKey: 'nav.idea'        },
            { tab: 'restaurants' as const,   emoji: '🍽', labelKey: 'nav.restaurants' },
            { tab: 'activities' as const,    emoji: '🧖', labelKey: 'nav.activities'  },
            { tab: 'map' as const,           emoji: '🗺', labelKey: 'nav.map'         },
            { tab: 'favorites' as const,     emoji: '♥',  labelKey: 'nav.favorites'   },
          ] as const).map(({ tab, emoji, labelKey }) => {
            const isActive = mobileTab === tab
            return (
              <button key={tab} onClick={() => handleMobileTab(tab)}
                className="relative flex flex-col items-center justify-center gap-0.5 transition-all"
                style={{ color: isActive ? '#6b76ff' : 'rgba(255,255,255,0.4)' }}>
                <span className="text-lg leading-none" style={isActive ? { filter: 'drop-shadow(0 0 8px rgba(91,101,230,.5))' } : {}}>{emoji}</span>
                <span className="text-[10px] font-bold">{t(labelKey)}</span>
                {tab === 'favorites' && favCount > 0 && (
                  <span className="absolute top-2 right-[calc(50%-18px)] w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>{favCount}</span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

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
