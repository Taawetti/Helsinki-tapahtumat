'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Globe, MapPin, Clock, Ticket, ChevronRight, Map as MapIcon } from 'lucide-react'
import type { Event, Activity, Restaurant } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { FEATURED_PICKS } from '@/lib/restaurant-awards'
import { ATTRACTION_HIGHLIGHTS, getHighlight } from '@/lib/activity-highlights'

// Curated activity names to include in the idea pool
const CURATED_NAMES = [
  { name: 'Löyly',                 emoji: '🔥' },
  { name: 'Allas Sea Pool',        emoji: '🌊' },
  { name: 'Kotiharjun sauna',      emoji: '🪵' },
  { name: 'Suomenlinna',           emoji: '⛵' },
  { name: 'Temppeliaukion kirkko', emoji: '⛪' },
  { name: 'Kansallismuseo',        emoji: '🏛' },
  { name: 'HAM Helsinki',          emoji: '🎨' },
  { name: 'Kauppahalli',           emoji: '🧅' },
  { name: 'Ateneum',               emoji: '🖼' },
  { name: 'Kiasma',                emoji: '🌀' },
  { name: 'Amos Rex',              emoji: '🎭' },
  { name: 'Linnanmäki',            emoji: '🎢' },
  { name: 'Korkeasaari',           emoji: '🦁' },
  { name: 'Heureka',               emoji: '🔬' },
  { name: 'Pihlajasaari',          emoji: '🏖' },
  { name: 'Sibelius-monumentti',   emoji: '🎵' },
  { name: 'Seurasaari',            emoji: '🌲' },
  { name: 'Helsingin tuomiokirkko',emoji: '🕍' },
  { name: 'Uspenski-katedraali',   emoji: '🔵' },
]

// ── Suggestion model ──────────────────────────────────────

type SuggestionType = 'event' | 'activity' | 'restaurant'

interface Suggestion {
  id: string
  type: SuggestionType
  title: string
  why: string
  subWhy?: string
  image: string | null
  address?: string
  lat?: number
  lon?: number
  url?: string
  badge?: string
  time?: string
  isFree?: boolean
  price?: string
  isOpen?: boolean
  emoji: string
}

// ── Helpers ───────────────────────────────────────────────

function isOpenNow(hours?: string): boolean | undefined {
  if (!hours) return undefined
  if (hours === '24/7') return true
  try {
    const now = new Date()
    const dayIdx = now.getDay()
    const cur = now.getHours() * 60 + now.getMinutes()
    const D: Record<string, number[]> = { Mo:[1],Tu:[2],We:[3],Th:[4],Fr:[5],Sa:[6],Su:[0] }
    function expandRange(spec: string): number[] {
      if (D[spec]) return D[spec]
      const m = spec.match(/^([A-Z][a-z])-([A-Z][a-z])$/)
      if (m) {
        const keys = ['Mo','Tu','We','Th','Fr','Sa','Su']
        const a = keys.indexOf(m[1]), b = keys.indexOf(m[2])
        if (a >= 0 && b >= 0) return keys.slice(a, b+1).map(k => D[k][0])
      }
      return []
    }
    for (const part of hours.split(';')) {
      const m = part.trim().match(/^([\w-]+(?:,[\w-]+)*)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/)
      if (!m) continue
      const days = m[1].split(',').flatMap(expandRange)
      if (!days.includes(dayIdx)) continue
      const [fh,fm] = m[2].split(':').map(Number)
      const [th,tm] = m[3].split(':').map(Number)
      const from = fh*60+fm, to = th*60+tm
      if (cur >= from && cur <= (to < from ? to+1440 : to)) return true
    }
    return false
  } catch { return undefined }
}

function eventEmoji(event: Event): string {
  const t = [event.title, ...event.categories].join(' ').toLowerCase()
  if (/konsertti|keikka|musiikki/.test(t)) return '🎸'
  if (/teatteri|näytelmä|ooppera/.test(t)) return '🎭'
  if (/taide|galleria|näyttely/.test(t)) return '🎨'
  if (/urheilu|ottelu|jalkapallo|jääkiekko/.test(t)) return '⚽'
  if (/stand-up|komedia/.test(t)) return '🎤'
  if (/elokuv/.test(t)) return '🎬'
  if (/ruoka|viini|ravintola/.test(t)) return '🍷'
  if (/festival/.test(t)) return '🎪'
  return '📅'
}

function eventWhy(event: Event): string {
  const desc = event.shortDescription || event.description || ''
  if (desc.length > 20) return desc.slice(0, 140).replace(/\s\w+$/, '…')
  const cats = event.categories.slice(0, 2).join(' · ')
  return cats || 'Ainutlaatuinen kokemus Helsingissä'
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Type label/colors ─────────────────────────────────────

const TYPE_META: Record<SuggestionType, { label: string; gradient: string; accent: string }> = {
  event: {
    label: '📅 Tapahtuma',
    gradient: 'linear-gradient(160deg,#1e1b4b 0%,#4c1d95 60%,#7c3aed 100%)',
    accent: '#a78bfa',
  },
  activity: {
    label: '🧖 Aktiviteetti',
    gradient: 'linear-gradient(160deg,#042f2e 0%,#065f46 60%,#0f766e 100%)',
    accent: '#2dd4bf',
  },
  restaurant: {
    label: '🍽 Ravintola',
    gradient: 'linear-gradient(160deg,#431407 0%,#9a3412 60%,#c2410c 100%)',
    accent: '#fb923c',
  },
}

// ── Filter options ────────────────────────────────────────

type Filter = 'all' | SuggestionType

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',        label: '🌟 Kaikki'      },
  { id: 'event',      label: '📅 Tapahtumat'  },
  { id: 'restaurant', label: '🍽 Ravintolat'  },
  { id: 'activity',   label: '🧖 Tekemistä'   },
]

// ── Props ─────────────────────────────────────────────────

interface Props {
  events: Event[]
  onShowOnMap?: (lat: number, lon: number, name: string) => void
  onEventClick?: (event: Event) => void
}

// ── Main view ─────────────────────────────────────────────

export default function IdeaView({ events, onShowOnMap, onEventClick }: Props) {
  const { t } = useLanguage()

  const [filter, setFilter] = useState<Filter>('all')
  const [idx, setIdx] = useState(0)
  const [animState, setAnimState] = useState<'idle' | 'out' | 'in'>('idle')
  const [activities, setActivities] = useState<Activity[]>([])
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const cardRef = useRef<HTMLDivElement>(null)

  // Fetch data
  useEffect(() => {
    fetch('/api/activities').then(r => r.json())
      .then(d => setActivities(d.activities ?? [])).catch(() => {})
  }, [])
  useEffect(() => {
    fetch('/api/restaurants').then(r => r.json())
      .then(d => setRestaurants(d.restaurants ?? [])).catch(() => {})
  }, [])

  // Build pools
  const activitySuggestions = useMemo((): Suggestion[] => {
    const byName = new Map(activities.map(a => [a.name.toLowerCase(), a]))
    return CURATED_NAMES.map(({ name, emoji }) => {
      const activity = byName.get(name.toLowerCase())
      const highlight = getHighlight(name)
      const fallbackHook = ATTRACTION_HIGHLIGHTS.find(h => name.toLowerCase().includes(h.nameKey))?.hook
      const open = activity ? isOpenNow(activity.openingHours) : undefined
      return {
        id: `activity-${name}`,
        type: 'activity' as const,
        title: name,
        why: highlight?.hook || fallbackHook || 'Yksi Helsingin parhaista kohteista',
        subWhy: highlight?.tip,
        image: null,
        address: activity?.address,
        lat: activity?.lat,
        lon: activity?.lon,
        url: activity?.www ?? undefined,
        badge: highlight?.badge,
        isFree: activity?.fee === false,
        isOpen: open,
        emoji,
      }
    })
  }, [activities])

  const restaurantSuggestions = useMemo((): Suggestion[] => {
    const byName = new Map(restaurants.map(r => [r.name.toLowerCase(), r]))
    const results: Suggestion[] = []
    for (const pick of FEATURED_PICKS) {
      const r = byName.get(pick.name.toLowerCase())
      if (!r) continue
      const open = r.openingHours ? isOpenNow(r.openingHours) : undefined
      const badge = r.michelinStars === 2 ? '⭐⭐ Michelin'
        : r.michelinStars === 1 ? '⭐ Michelin'
        : r.bibGourmand ? '😊 Bib Gourmand'
        : pick.badge
      results.push({
        id: `restaurant-${r.id}`,
        type: 'restaurant',
        title: r.name,
        why: pick.note,
        image: r.image ?? null,
        address: r.address,
        lat: r.lat,
        lon: r.lon,
        url: r.www ?? undefined,
        badge,
        isFree: false,
        price: r.priceRange ? ['','€','€€','€€€','€€€€'][r.priceRange] : undefined,
        isOpen: open,
        emoji: '🍽',
      })
    }
    return results
  }, [restaurants])

  const eventSuggestions = useMemo((): Suggestion[] => {
    return events
      .filter(e => (e.shortDescription?.length ?? 0) > 15 || (e.description?.length ?? 0) > 15)
      .slice(0, 40)
      .map(e => ({
        id: `event-${e.id}`,
        type: 'event' as const,
        title: e.title,
        why: eventWhy(e),
        image: e.image,
        address: e.location?.name || e.location?.streetAddress,
        lat: e.location?.lat,
        lon: e.location?.lon,
        url: e.ticketUrl ?? e.infoUrl ?? undefined,
        isFree: e.isFree,
        price: e.price ?? undefined,
        time: new Date(e.startTime).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }),
        emoji: eventEmoji(e),
      }))
  }, [events])

  // Combined & shuffled pool (memoized, shuffled once per filter change)
  const pool = useMemo(() => {
    let all: Suggestion[] = []
    if (filter === 'all' || filter === 'activity')   all = [...all, ...activitySuggestions]
    if (filter === 'all' || filter === 'restaurant') all = [...all, ...restaurantSuggestions]
    if (filter === 'all' || filter === 'event')      all = [...all, ...eventSuggestions]
    return shuffle(all)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, activitySuggestions.length, restaurantSuggestions.length, eventSuggestions.length])

  const current = pool[idx % Math.max(pool.length, 1)]

  const next = useCallback(() => {
    if (animState !== 'idle' || pool.length < 2) return
    setAnimState('out')
    setTimeout(() => {
      setIdx(i => (i + 1) % pool.length)
      setAnimState('in')
      setTimeout(() => setAnimState('idle'), 280)
    }, 220)
  }, [animState, pool.length])

  // Reset idx when filter changes
  useEffect(() => { setIdx(0) }, [filter])

  if (!current) return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] text-white/25 text-sm">
      {t('idea.loading')}
    </main>
  )

  const meta = TYPE_META[current.type]

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-28 space-y-4">

      {/* ── Title ── */}
      <div>
        <h1 className="font-black text-white leading-none select-none"
          style={{ fontSize: 'clamp(2rem,8vw,3.5rem)', letterSpacing: '-0.03em' }}>
          {t('idea.heading')}
        </h1>
        <p className="text-white/25 text-sm mt-1">{t('idea.subtitle')}</p>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all whitespace-nowrap ${
              filter === f.id
                ? 'bg-white/15 text-white'
                : 'bg-white/5 text-white/35 hover:text-white/60'
            }`}>
            {f.id === 'all' ? t('idea.filter_all') : f.id === 'event' ? t('idea.filter_event') : f.id === 'restaurant' ? t('idea.filter_rest') : t('idea.filter_act')}
          </button>
        ))}
      </div>

      {/* ── Main idea card ── */}
      <div
        ref={cardRef}
        className="relative rounded-3xl overflow-hidden border border-white/8 shadow-2xl"
        style={{
          transition: 'opacity 220ms ease, transform 220ms ease',
          opacity: animState === 'out' ? 0 : 1,
          transform: animState === 'out' ? 'translateY(-16px)' : animState === 'in' ? 'translateY(8px)' : 'translateY(0)',
        }}>

        {/* Image / gradient hero */}
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4/3', maxHeight: 340 }}>
          <div className="absolute inset-0" style={{ background: meta.gradient }} />
          {current.image && (
            <>
              <img src={current.image} alt={current.title}
                className="absolute inset-0 w-full h-full object-cover"
                onError={e => { (e.target as HTMLElement).style.display = 'none' }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.75) 0%,rgba(0,0,0,0.15) 60%,transparent 100%)' }} />
            </>
          )}

          {/* Faded big emoji when no image */}
          {!current.image && (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ fontSize: '8rem', opacity: 0.18, filter: `drop-shadow(0 0 40px ${meta.accent})` }}>
              {current.emoji}
            </div>
          )}

          {/* Type badge */}
          <div className="absolute top-3 left-3">
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/90 bg-black/40 backdrop-blur-sm">
              {current.type === 'event' ? t('idea.type_event') : current.type === 'activity' ? t('idea.type_activity') : t('idea.type_rest')}
            </span>
          </div>

          {/* Free badge */}
          {current.isFree && (
            <div className="absolute top-3 right-3">
              <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-500/90 text-white">
                {t('common.free_badge')}
              </span>
            </div>
          )}

          {/* Counter */}
          <div className="absolute bottom-3 right-3 text-[10px] text-white/35 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full font-bold">
            {(idx % Math.max(pool.length, 1)) + 1} / {pool.length}
          </div>
        </div>

        {/* Card body */}
        <div className="bg-[#0d0d12] p-5 space-y-3">

          {/* Title + badge */}
          <div className="space-y-1">
            {current.badge && (
              <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full mb-1"
                style={{ background: `${meta.accent}22`, color: meta.accent, border: `1px solid ${meta.accent}40` }}>
                {current.badge}
              </span>
            )}
            <h2 className="font-black text-white text-2xl leading-tight" style={{ letterSpacing: '-0.02em' }}>
              {current.title}
            </h2>
          </div>

          {/* Why go */}
          <div className="rounded-xl p-3.5 space-y-1.5" style={{ background: `${meta.accent}0d`, border: `1px solid ${meta.accent}22` }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: `${meta.accent}99` }}>
              {t('idea.why')}
            </p>
            <p className="text-sm leading-relaxed font-medium" style={{ color: meta.accent }}>
              {current.why}
            </p>
            {current.subWhy && (
              <p className="text-xs text-white/35 italic leading-relaxed pt-0.5">{current.subWhy}</p>
            )}
          </div>

          {/* Practical info */}
          <div className="space-y-1.5">
            {current.time && (
              <div className="flex items-center gap-2 text-white/45 text-xs">
                <Clock size={12} className="shrink-0" />
                <span>{t('idea.today_at')} {current.time}</span>
              </div>
            )}
            {current.isOpen !== undefined && (
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${current.isOpen ? 'bg-emerald-400' : 'bg-red-400/60'}`} />
                <span className={current.isOpen ? 'text-emerald-400/80' : 'text-red-400/50'}>
                  {current.isOpen ? t('idea.open_now') : t('common.closed')}
                </span>
              </div>
            )}
            {current.address && (
              <div className="flex items-center gap-2 text-white/35 text-xs">
                <MapPin size={12} className="shrink-0" />
                <span>{current.address}</span>
              </div>
            )}
            {!current.isFree && current.price && (
              <div className="flex items-center gap-2 text-white/35 text-xs">
                <Ticket size={12} className="shrink-0" />
                <span>{current.price}</span>
              </div>
            )}
          </div>

          {/* Action links */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            {current.url && (
              <a href={current.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-bold text-purple-400/70 hover:text-purple-300 transition-colors">
                <Globe size={12} /> {t('common.new_tab')}
              </a>
            )}
            {onShowOnMap && current.lat && current.lon && (
              <button
                onClick={() => onShowOnMap(current.lat!, current.lon!, current.title)}
                className="flex items-center gap-1.5 text-xs font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
                <MapIcon size={12} /> {t('common.show_on_map')}
              </button>
            )}
            {onEventClick && current.type === 'event' && (
              <button
                onClick={() => {
                  const ev = events.find(e => `event-${e.id}` === current.id)
                  if (ev) onEventClick(ev)
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-white/30 hover:text-white/60 transition-colors">
                {t('common.more_info')} →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Next idea button ── */}
      <button onClick={next} disabled={pool.length < 2}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all active:scale-[0.97] disabled:opacity-30"
        style={{
          background: meta.gradient,
          boxShadow: `0 4px 24px ${meta.accent}33`,
          color: '#fff',
          letterSpacing: '-0.01em',
        }}>
        {t('idea.next')}
        <ChevronRight size={18} />
      </button>

    </main>
  )
}
