'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Fragment, useState, useCallback, useMemo, useEffect } from 'react'
import { LayoutGrid, Map, Loader2, AlertCircle, SlidersHorizontal, X, Rss, Heart, Bell } from 'lucide-react'
import { Event, DateFilter, PriceFilter, CATEGORIES, VIBES, NEIGHBORHOODS } from '@/lib/types'
import { useFavorites } from '@/contexts/FavoritesContext'
import { useEvents } from '@/hooks/useEvents'
import EventCard from '@/components/EventCard'
import FeedCard from '@/components/FeedCard'
import EventDetailPanel from '@/components/EventDetailPanel'
import SearchBar from '@/components/SearchBar'
import PosterCard from '@/components/PosterCard'
import InstallBanner from '@/components/InstallBanner'
import VibeBar from '@/components/VibeBar'
import AdBanner from '@/components/AdBanner'
import DatePicker from '@/components/DatePicker'
import SpontaaniCard from '@/components/SpontaaniCard'
import QuickButtons from '@/components/QuickButtons'
import EiTiedaModal, { EiTiedaMode } from '@/components/EiTiedaModal'
import IltasuunnitelmaCard from '@/components/IltasuunnitelmaCard'
import JarjestajaForm from '@/components/JarjestajaForm'
import NewsletterBanner from '@/components/NewsletterBanner'
import RestaurantsView from '@/components/RestaurantsView'
import ActivitiesView from '@/components/ActivitiesView'
import IdeaView from '@/components/IdeaView'
import { useLanguage } from '@/contexts/LanguageContext'

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

function EmptyState({ keyword, activeVibes, activeCategories, priceFilter, dateFilter, onClear, onDateChange }: EmptyStateProps) {
  const hasFilters = keyword || activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all'
  const isNarrowDate = dateFilter === 'today' || dateFilter === 'tonight'

  let emoji = '🏙'
  let heading = 'Ei tapahtumia'
  let sub = 'Kokeile eri päivää tai laajenna hakua'

  if (keyword) {
    emoji = '🔍'
    heading = `Ei tuloksia haulle "${keyword}"`
    sub = 'Tarkista kirjoitusasu tai kokeile lyhyempää hakusanaa'
  } else if (priceFilter === 'free' && isNarrowDate) {
    emoji = '🎁'
    heading = 'Ei ilmaistapahtumia tänään'
    sub = 'Ilmaistapahtumia löytyy yleensä enemmän viikonloppuisin'
  } else if (activeVibes.length > 0 || activeCategories.length > 0) {
    emoji = '🎯'
    heading = 'Ei tuloksia valituilla suodattimilla'
    sub = 'Kokeile poistaa jokin suodatin tai laajenna aikaväliä'
  } else if (isNarrowDate) {
    emoji = '📅'
    heading = 'Ei tapahtumia tänä päivänä'
    sub = 'Tänään on hiljaista — kokeile laajentaa hakua'
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
            Laajenna viikkoon
          </button>
        )}
        {hasFilters && (
          <button
            onClick={onClear}
            className="text-sm font-bold px-4 py-2 rounded-xl border border-purple-500/30 text-purple-400/70 hover:text-purple-300 hover:border-purple-500/50 transition-all"
          >
            Tyhjennä suodattimet
          </button>
        )}
      </div>
    </div>
  )
}

function nightlifeScore(e: Event): number {
  const text = [e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase()
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
  const [showEiTieda, setShowEiTieda] = useState(false)
  const [eiTiedaMode, setEiTiedaMode] = useState<EiTiedaMode>('general')
  const [showJarjestajaForm, setShowJarjestajaForm] = useState(false)
  const [mapTarget, setMapTarget] = useState<{ lat: number; lon: number; name: string; type?: 'event' | 'restaurant' | 'activity' } | null>(null)
  const { events, loading, error, hasMore, total, loadMore } = useEvents({
    dateFilter, customDate, keyword, municipality, activeCategories, bbox: '',
  })

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
    setPriceFilter('all'); setCustomDate('')
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
        body: `${events.length} tapahtumaa tänään — katso mitä on tarjolla!`,
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
    () => [...filteredEvents].sort((a, b) => nightlifeScore(b) - nightlifeScore(a)),
    [filteredEvents]
  )

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
    <div className="min-h-screen text-white pb-20 md:pb-0" style={{ background: '#08080c' }}>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-30 border-b border-white/5" style={{ background: 'rgba(8,8,12,0.96)', backdropFilter: 'blur(20px)' }}>
        {/* ── Mobile header row 1: logo + actions ── */}
        <div className="md:hidden flex items-center justify-between px-4 pt-3 pb-2">
          <button onClick={() => { setMode('discover'); setMobileTab('discover') }} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}>M</div>
            <span className="font-black text-sm tracking-tight" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Mitä tänään
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setLang(lang === 'fi' ? 'en' : 'fi')}
              className="text-[11px] font-black px-2.5 py-1.5 rounded-xl border border-white/10 text-white/45 hover:text-white hover:border-white/20 transition-all bg-white/3">
              {lang === 'fi' ? 'EN' : 'FI'}
            </button>
            <button
              onClick={() => { setMode(mode === 'favorites' ? 'discover' : 'favorites'); setMobileTab(mode === 'favorites' ? 'discover' : 'favorites') }}
              className={`relative p-2 rounded-xl border transition-all ${mode === 'favorites' ? 'border-pink-500/60 text-pink-400 bg-pink-500/15' : 'border-white/8 text-white/40 bg-white/4'}`}
            >
              <Heart size={15} fill={mode === 'favorites' ? 'currentColor' : 'none'} />
              {favCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center bg-pink-500 text-white">{favCount}</span>
              )}
            </button>
            <button onClick={() => setShowFilters((p) => !p)}
              className={`relative p-2 rounded-xl border transition-all ${showFilters ? 'border-purple-500/60 text-purple-400 bg-purple-500/15' : 'border-white/8 text-white/40 bg-white/4'}`}>
              <SlidersHorizontal size={15} />
              {activeCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}>{activeCount}</span>
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
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}>M</div>
            <span className="font-black text-sm tracking-tight" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Mitä tänään
            </span>
          </button>

          <div className="flex gap-0.5 bg-white/5 rounded-xl p-1">
            {(['discover', 'idea', 'map', 'restaurants', 'activities'] as AppMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === m ? 'bg-white/12 text-white' : 'text-white/35 hover:text-white/65'}`}>
                {m === 'discover' ? `✦ ${t('nav.home')}` : m === 'idea' ? `🎲 ${t('nav.idea')}` : m === 'map' ? t('nav.map') : m === 'restaurants' ? `🍽 ${t('nav.restaurants')}` : `🧖 ${t('nav.activities')}`}
              </button>
            ))}
          </div>

          <div className="flex-1 max-w-md">
            <SearchBar value={keyword} onChange={(v) => { setKeyword(v); if (v) { setMode('discover'); setMobileTab('discover') } }} />
          </div>

          {false && (
            <div className="flex bg-white/5 rounded-xl p-1 gap-0.5 shrink-0">
              <button onClick={() => setListStyle('feed')} className={`p-2 rounded-lg transition-all ${listStyle === 'feed' ? 'bg-white/12 text-white' : 'text-white/35 hover:text-white/60'}`}><Rss size={14} /></button>
              <button onClick={() => setListStyle('grid')} className={`p-2 rounded-lg transition-all ${listStyle === 'grid' ? 'bg-white/12 text-white' : 'text-white/35 hover:text-white/60'}`}><LayoutGrid size={14} /></button>
              <button onClick={() => setMode('map')} className="p-2 rounded-lg transition-all text-white/35 hover:text-white/60"><Map size={14} /></button>
            </div>
          )}

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

          <button
            onClick={() => setMode(mode === 'favorites' ? 'discover' : 'favorites')}
            className={`relative shrink-0 p-2 rounded-xl border transition-all ${mode === 'favorites' ? 'border-pink-500/60 text-pink-400 bg-pink-500/15' : 'border-white/8 text-white/40 bg-white/4 hover:text-pink-400'}`}
            title="Suosikit"
          >
            <Heart size={15} fill={mode === 'favorites' ? 'currentColor' : 'none'} />
            {favCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center bg-pink-500 text-white">{favCount}</span>
            )}
          </button>

          <button onClick={() => setShowFilters((p) => !p)}
            className={`relative shrink-0 p-2 rounded-xl border transition-all ${showFilters ? 'border-purple-500/60 text-purple-400 bg-purple-500/15' : 'border-white/8 text-white/40 bg-white/4 hover:text-white/70'}`}>
            <SlidersHorizontal size={15} />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}>{activeCount}</span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="border-t border-white/5 px-4 py-4 max-w-6xl mx-auto space-y-3">
            {/* Date row */}
            <div className="flex flex-wrap gap-2 items-center">
              {(['today','tonight','tomorrow','weekend','week','month'] as DateFilter[]).map((d) => {
                const labels: Record<string,string> = { today:'Tänään', tonight:'🌙 Illalla', tomorrow:'Huomenna', weekend:'🎉 Viikonloppu', week:'Viikko', month:'Kuukausi' }
                return (
                  <button key={d} onClick={() => { setDateFilter(d); setCustomDate('') }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${dateFilter === d && !customDate ? 'text-white border-transparent' : 'text-white/40 border-white/10 hover:text-white/70'}`}
                    style={dateFilter === d && !customDate ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)', borderColor: 'transparent' } : {}}>
                    {labels[d]}
                  </button>
                )
              })}
              <DatePicker size="sm" value={customDate} onChange={(v) => { setCustomDate(v); setDateFilter(v ? 'custom' : 'today') }} />
            </div>
            {/* Price row */}
            <div className="flex gap-2">
              {(['all','free','paid'] as PriceFilter[]).map((p) => {
                const labels = { all: 'Kaikki', free: '🎁 Ilmaiset', paid: '🎟 Maksulliset' }
                return (
                  <button key={p} onClick={() => setPriceFilter(p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${priceFilter === p ? 'bg-white/12 border-white/20 text-white' : 'text-white/40 border-white/8 hover:text-white/60'}`}>
                    {labels[p]}
                  </button>
                )
              })}
              {activeCount > 0 && (
                <button onClick={clearFilters} className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold text-white/30 border border-white/8 hover:text-white/60 transition-all">
                  Tyhjennä kaikki
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ══ FAVORITES ══ */}
      {mode === 'favorites' && (
        <main className="max-w-6xl mx-auto px-4 pt-5 pb-20 space-y-5">
          <div className="flex items-center gap-3">
            <Heart size={20} fill="currentColor" className="text-pink-400" />
            <h2 className="text-lg font-black text-white">Suosikit</h2>
            <span className="text-white/30 text-sm">{favCount} tallennettu</span>
          </div>
          {favorites.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <Heart size={40} className="text-white/10 mx-auto" />
              <p className="text-white/30 text-sm">Ei vielä suosikkeja</p>
              <p className="text-white/20 text-xs">Paina ♥ tapahtumakortissa tallentaaksesi</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...favorites].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map((e, i) => (
                <FeedCard key={e.id} event={e} onClick={setSelectedEvent} index={i} />
              ))}
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
              {new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>

          {/* Date strip */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 items-center">
            {([
              { d: 'today' as DateFilter, label: 'Tänään' },
              { d: 'tomorrow' as DateFilter, label: 'Huomenna' },
              { d: 'weekend' as DateFilter, label: '🎉 Viikonloppu' },
              { d: 'week' as DateFilter, label: 'Viikko' },
              { d: 'month' as DateFilter, label: 'Kuukausi' },
            ]).map(({ d, label }) => (
              <button key={d} onClick={() => { setDateFilter(d); setCustomDate('') }}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-black transition-all ${
                  dateFilter === d && !customDate ? 'text-white shadow-lg shadow-purple-500/20' : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/65'
                }`}
                style={dateFilter === d && !customDate ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)' } : {}}>
                {label}
              </button>
            ))}
            <DatePicker size="md" value={customDate} onChange={(v) => { setCustomDate(v); setDateFilter(v ? 'custom' : 'today') }} />
          </div>

          {/* Vibe pills */}
          <VibeBar active={activeVibes} onToggle={(id) => {
            if (id === 'ilmainen') { setPriceFilter((p) => p === 'free' ? 'all' : 'free'); return }
            setActiveVibes((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id])
          }} />

          {/* Quick action buttons */}
          <QuickButtons onAction={handleQuickAction} />

          {/* Spontaani — best event starting soon */}
          {!loading && <SpontaaniCard events={filteredEvents} onOpen={setSelectedEvent} />}

          {/* Iltasuunnitelma — curated evening plan */}
          {!loading && filteredEvents.length >= 2 && (
            <IltasuunnitelmaCard events={filteredEvents} onEventClick={setSelectedEvent} />
          )}

          {/* Loading skeletons */}
          {loading && discoverEvents.length === 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden bg-white/4 animate-pulse">
                  <div className="w-full bg-white/5" style={{ aspectRatio: '3/4' }} />
                  <div className="p-3 space-y-1.5">
                    <div className="h-3.5 bg-white/6 rounded w-4/5" />
                    <div className="h-3 bg-white/4 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hero event — only if score ≥ 3 (actual nightlife) */}
          {(() => {
            const hero = discoverEvents.find((e) => nightlifeScore(e) >= 3 && e.image)
            if (!hero) return null
            return (
              <button onClick={() => setSelectedEvent(hero)}
                className="group relative w-full rounded-2xl overflow-hidden text-left" style={{ aspectRatio: '16/7' }}>
                <img src={hero.image!} alt={hero.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(8,8,12,0.95) 0%,rgba(8,8,12,0.3) 50%,transparent 100%)' }} />
                <div className="absolute top-4 left-4">
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}>✦ SUOSITUS</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
                  <h2 className="font-black text-white leading-tight mb-1.5" style={{ fontSize: 'clamp(1.3rem,3.5vw,2.2rem)', letterSpacing: '-0.02em' }}>
                    {hero.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {hero.location?.name && <span className="text-white/50">{hero.location.name}</span>}
                    <span className="font-bold" style={{ color: '#c084fc' }}>
                      {new Date(hero.startTime).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {hero.isFree && <span className="text-emerald-400 font-bold">Maksuton</span>}
                    {!hero.isFree && hero.price && <span className="text-white/40">{hero.price}</span>}
                  </div>
                </div>
              </button>
            )
          })()}

          {/* Ad slot — between hero and event grid */}
          <AdBanner slot="1234567890" format="horizontal" className="my-1" />

          {/* Event grid */}
          {discoverEvents.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {discoverEvents
                .filter((e) => !discoverEvents.find((h) => nightlifeScore(h) >= 3 && h.image)?.id || e.id !== discoverEvents.find((h) => nightlifeScore(h) >= 3 && h.image)?.id)
                .slice(0, 24)
                .map((e) => (
                  <PosterCard key={e.id} event={e} onClick={setSelectedEvent} />
                ))}
            </div>
          )}

          {!loading && discoverEvents.length === 0 && (
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

          {/* City selector */}
          <div className="pt-4 border-t border-white/5">
            <p className="text-xs font-black uppercase tracking-widest text-white/20 mb-3">Kaupunki</p>
            <div className="flex gap-2">
              {[{id:'helsinki',label:'Helsinki'},{id:'espoo',label:'Espoo'},{id:'vantaa',label:'Vantaa'}].map((c) => (
                <button key={c.id} onClick={() => setMunicipality(c.id)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${municipality === c.id ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40 hover:text-white/70'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category & neighborhood links — SEO internal linking */}
          <div className="pt-4 border-t border-white/5 space-y-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-white/20 mb-3">Tapahtumat kategorioittain</p>
              <div className="flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <Link
                    key={v.id}
                    href={`/tapahtumat/${v.id}`}
                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-all border border-white/6 hover:border-white/15"
                  >
                    {v.emoji} {v.label}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-white/20 mb-3">Tapahtumat alueittain</p>
              <div className="flex flex-wrap gap-2">
                {NEIGHBORHOODS.filter((n) => n.municipality === 'helsinki').map((n) => (
                  <Link
                    key={n.id}
                    href={`/tapahtumat/${n.id}`}
                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-all border border-white/6 hover:border-white/15"
                  >
                    {n.emoji} {n.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Newsletter signup */}
          <NewsletterBanner />

          {/* Organizer CTA */}
          <div className="flex items-center justify-center pb-2">
            <button
              onClick={() => setShowJarjestajaForm(true)}
              className="text-xs text-white/20 hover:text-white/50 transition-all font-bold"
            >
              + Lisää tapahtumasi sivulle
            </button>
          </div>
        </main>
      )}

      {/* ══ IDEA ══ */}
      {mode === 'idea' && (
        <IdeaView
          events={filteredEvents}
          onShowOnMap={(lat, lon, name) => handleShowOnMap(lat, lon, name)}
          onEventClick={setSelectedEvent}
        />
      )}

      {/* ══ MAP ══ */}
      {mode === 'map' && (
        <main className="px-2 pt-2 pb-0">
          <MapView events={filteredEvents} onEventClick={setSelectedEvent} mapTarget={mapTarget}/>
        </main>
      )}

      {/* ══ RESTAURANTS ══ */}
      {mode === 'restaurants' && <RestaurantsView onShowOnMap={(lat, lon, name) => handleShowOnMap(lat, lon, name, 'restaurant')} />}

      {/* ══ ACTIVITIES ══ */}
      {mode === 'activities' && <ActivitiesView onShowOnMap={(lat, lon, name) => handleShowOnMap(lat, lon, name, 'activity')} />}

      {/* ── MOBILE NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/6"
        style={{ background: 'rgba(8,8,12,0.97)', backdropFilter: 'blur(20px)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-6">
          {([
            { tab: 'discover' as const,     emoji: '✦',  labelKey: 'nav.home'        },
            { tab: 'idea' as const,          emoji: '🎲', labelKey: 'nav.idea'        },
            { tab: 'restaurants' as const,   emoji: '🍽', labelKey: 'nav.restaurants' },
            { tab: 'activities' as const,    emoji: '🧖', labelKey: 'nav.activities'  },
            { tab: 'map' as const,           emoji: '🗺', labelKey: 'nav.map'         },
            { tab: 'favorites' as const,     emoji: '♥',  labelKey: 'nav.favorites'   },
          ] as const).map(({ tab, emoji, labelKey }) => (
            <button key={tab} onClick={() => handleMobileTab(tab)}
              className={`relative flex flex-col items-center gap-0.5 py-3 transition-all ${mobileTab === tab ? 'text-purple-400' : 'text-white/25 hover:text-white/50'}`}>
              <span className="text-lg leading-none">{emoji}</span>
              <span className="text-[10px] font-bold">{t(labelKey)}</span>
              {tab === 'favorites' && favCount > 0 && (
                <span className="absolute top-2 right-[calc(50%-18px)] w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center bg-pink-500 text-white">{favCount}</span>
              )}
            </button>
          ))}
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
