'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Globe, MapPin, Ticket, Map as MapIcon, Heart, X, Clock } from 'lucide-react'
import type { Event, Activity, Restaurant } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { useFavorites } from '@/contexts/FavoritesContext'
import { FEATURED_PICKS } from '@/lib/restaurant-awards'
import { ATTRACTION_HIGHLIGHTS, getHighlight } from '@/lib/activity-highlights'

// ── Curated activity names ───────────────────────────────

const CURATED_NAMES = [
  { name: 'Löyly',                  emoji: '🔥' },
  { name: 'Allas Sea Pool',         emoji: '🌊' },
  { name: 'Kotiharjun sauna',       emoji: '🪵' },
  { name: 'Suomenlinna',            emoji: '⛵' },
  { name: 'Temppeliaukion kirkko',  emoji: '⛪' },
  { name: 'Kansallismuseo',         emoji: '🏛' },
  { name: 'HAM Helsinki',           emoji: '🎨' },
  { name: 'Ateneum',                emoji: '🖼' },
  { name: 'Kiasma',                 emoji: '🌀' },
  { name: 'Amos Rex',               emoji: '🎭' },
  { name: 'Linnanmäki',             emoji: '🎢' },
  { name: 'Korkeasaari',            emoji: '🦁' },
  { name: 'Heureka',                emoji: '🔬' },
  { name: 'Pihlajasaari',           emoji: '🏖' },
  { name: 'Seurasaari',             emoji: '🌲' },
  { name: 'Helsingin tuomiokirkko', emoji: '🕍' },
]

// ── Types ────────────────────────────────────────────────

type SuggestionType = 'event' | 'activity' | 'restaurant'
type IdeaMode = 'nyt' | 'ilta'

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
  minutesUntil?: number
  isFree?: boolean
  price?: string
  isOpen?: boolean
  emoji: string
  eventRef?: Event
}

// ── Helpers ──────────────────────────────────────────────

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

function minutesUntilStart(startTime: string): number {
  return Math.round((new Date(startTime).getTime() - Date.now()) / 60000)
}

function eventEmoji(event: Event): string {
  const text = [event.title, ...event.categories].join(' ').toLowerCase()
  if (/konsertti|keikka|musiikki/.test(text)) return '🎸'
  if (/teatteri|näytelmä|ooppera/.test(text)) return '🎭'
  if (/taide|galleria|näyttely/.test(text)) return '🎨'
  if (/urheilu|ottelu|jalkapallo|jääkiekko/.test(text)) return '⚽'
  if (/stand-up|komedia/.test(text)) return '🎤'
  if (/elokuv/.test(text)) return '🎬'
  if (/ruoka|viini/.test(text)) return '🍷'
  return '📅'
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Type visual meta ─────────────────────────────────────

const TYPE_META: Record<SuggestionType, { label: string; gradient: string; accent: string }> = {
  event:      { label: '📅 Tapahtuma',  gradient: 'linear-gradient(160deg,#1e1b4b,#4c1d95,#7c3aed)', accent: '#a78bfa' },
  activity:   { label: '🧖 Aktiviteetti',gradient: 'linear-gradient(160deg,#042f2e,#065f46,#0f766e)', accent: '#2dd4bf' },
  restaurant: { label: '🍽 Ravintola',  gradient: 'linear-gradient(160deg,#431407,#9a3412,#c2410c)', accent: '#fb923c' },
}

// ── Props ────────────────────────────────────────────────

interface Props {
  events: Event[]
  onShowOnMap?: (lat: number, lon: number, name: string, type?: 'event' | 'restaurant' | 'activity') => void
  onEventClick?: (event: Event) => void
}

// ── Component ────────────────────────────────────────────

export default function IdeaView({ events, onShowOnMap, onEventClick }: Props) {
  const { lang } = useLanguage()
  const { toggle, isFavorite } = useFavorites()

  const [ideaMode, setIdeaMode] = useState<IdeaMode>('ilta')
  const [idx, setIdx] = useState(0)
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  // Swipe state — use refs for synchronous drag tracking (useState closures would lose updates)
  const [dragX, setDragX] = useState(0)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)

  // Exit animation
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null)

  const [activities, setActivities] = useState<Activity[]>([])
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])

  useEffect(() => {
    fetch('/api/activities').then(r => r.json()).then(d => setActivities(d.activities ?? [])).catch(() => {})
    fetch('/api/restaurants').then(r => r.json()).then(d => setRestaurants(d.restaurants ?? [])).catch(() => {})
  }, [])

  // ── Build pools ──────────────────────────────────────

  const activityPool = useMemo((): Suggestion[] => {
    const byName = new Map(activities.map(a => [a.name.toLowerCase(), a]))
    return CURATED_NAMES.map(({ name, emoji }) => {
      const activity = byName.get(name.toLowerCase())
      const highlight = getHighlight(name)
      const h = ATTRACTION_HIGHLIGHTS.find(h => name.toLowerCase().includes(h.nameKey))
      const fallback = lang === 'en' && h?.hookEn ? h.hookEn : h?.hook
      const why = (lang === 'en' && highlight?.hookEn ? highlight.hookEn : highlight?.hook) || fallback || 'Yksi Helsingin parhaista kohteista'
      return {
        id: `activity-${name}`,
        type: 'activity' as const,
        title: name,
        why,
        subWhy: lang === 'en' && highlight?.tipEn ? highlight.tipEn : highlight?.tip,
        image: activity?.image ?? null,
        address: activity?.address,
        lat: activity?.lat,
        lon: activity?.lon,
        url: activity?.www ?? undefined,
        badge: lang === 'en' && highlight?.badgeEn ? highlight.badgeEn : highlight?.badge,
        isFree: activity?.fee === false,
        isOpen: activity ? isOpenNow(activity.openingHours) : undefined,
        emoji,
      }
    })
  }, [activities, lang])

  const restaurantPool = useMemo((): Suggestion[] => {
    const byName = new Map(restaurants.map(r => [r.name.toLowerCase(), r]))
    return FEATURED_PICKS.flatMap(pick => {
      const r = byName.get(pick.name.toLowerCase())
      if (!r) return []
      const badge = r.michelinStars === 2 ? '⭐⭐ Michelin' : r.michelinStars === 1 ? '⭐ Michelin'
        : r.bibGourmand ? '😊 Bib Gourmand' : (lang === 'en' && pick.badgeEn ? pick.badgeEn : pick.badge)
      return [{
        id: `restaurant-${r.id}`,
        type: 'restaurant' as const,
        title: r.name,
        why: lang === 'en' && pick.noteEn ? pick.noteEn : pick.note,
        image: r.image ?? null,
        address: r.address,
        lat: r.lat,
        lon: r.lon,
        url: r.www ?? undefined,
        badge,
        isFree: false,
        price: r.priceRange ? ['','€','€€','€€€','€€€€'][r.priceRange] : undefined,
        isOpen: r.openingHours ? isOpenNow(r.openingHours) : undefined,
        emoji: '🍽',
      }]
    })
  }, [restaurants, lang])

  const eventPool = useMemo((): Suggestion[] => {
    return events
      .filter(e => (e.shortDescription?.length ?? 0) > 15 || (e.description?.length ?? 0) > 15)
      .slice(0, 40)
      .map(e => {
        const mins = minutesUntilStart(e.startTime)
        return {
          id: `event-${e.id}`,
          type: 'event' as const,
          title: e.title,
          why: e.shortDescription || e.description || '',
          image: e.image,
          address: e.location?.name || e.location?.streetAddress,
          lat: e.location?.lat,
          lon: e.location?.lon,
          url: e.ticketUrl ?? e.infoUrl ?? undefined,
          isFree: e.isFree,
          price: e.price ?? undefined,
          time: new Date(e.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' }),
          minutesUntil: mins,
          emoji: eventEmoji(e),
          eventRef: e,
        }
      })
  }, [events, lang])

  const pool = useMemo(() => {
    let all = shuffle([...activityPool, ...restaurantPool, ...eventPool])
      .filter(s => !skippedIds.has(s.id))
    if (ideaMode === 'nyt') {
      // "Juuri nyt": prefer items starting soon (< 3h) or open now
      all = [
        ...all.filter(s => s.minutesUntil !== undefined && s.minutesUntil >= 0 && s.minutesUntil < 180),
        ...all.filter(s => s.isOpen === true && s.minutesUntil === undefined),
        ...all.filter(s => s.minutesUntil === undefined && s.isOpen !== true),
      ]
    }
    return all
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaMode, activityPool.length, restaurantPool.length, eventPool.length, skippedIds])

  useEffect(() => { setIdx(0) }, [ideaMode])

  const current = pool[idx % Math.max(pool.length, 1)]
  const meta = current ? TYPE_META[current.type] : TYPE_META.event

  // ── Swipe logic ──────────────────────────────────────

  const SWIPE_THRESHOLD = 80

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStartX.current = e.clientX
    isDragging.current = true
    cardRef.current?.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    setDragX(e.clientX - dragStartX.current)
  }, [])

  const commit = useCallback((dir: 'left' | 'right') => {
    if (!current) return
    setExitDir(dir)
    if (dir === 'right') {
      setSavedIds(s => new Set([...s, current.id]))
      if (current.eventRef) toggle(current.eventRef)
    } else {
      setSkippedIds(s => new Set([...s, current.id]))
    }
    setTimeout(() => {
      setIdx(i => (i + 1) % Math.max(pool.length - 1, 1))
      setDragX(0)
      setExitDir(null)
    }, 220)
  }, [current, pool.length, toggle])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    isDragging.current = false
    const dx = e.clientX - dragStartX.current
    if (dx > SWIPE_THRESHOLD) commit('right')
    else if (dx < -SWIPE_THRESHOLD) commit('left')
    else setDragX(0)
  }, [commit])

  const handleSkip = useCallback(() => commit('left'), [commit])
  const handleSave = useCallback(() => commit('right'), [commit])

  // Card transform
  const cardTransform = exitDir === 'right'
    ? 'translateX(110%) rotate(12deg)'
    : exitDir === 'left'
    ? 'translateX(-110%) rotate(-12deg)'
    : `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`

  const swipeOpacity = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1)
  const swipeRight = dragX > 20
  const swipeLeft = dragX < -20

  if (!current) return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] text-white/25 text-sm">
      Ladataan ehdotuksia…
    </main>
  )

  const savedCount = savedIds.size

  return (
    <main className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">HELSINKI</p>
          <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.6rem,6vw,2.6rem)', letterSpacing: '-0.03em' }}>
            Etkö tiedä mitä tehdä?
          </h1>
          <p className="text-white/30 text-xs mt-1">Kaikki ehdotukset tapahtuvat tänä iltana</p>
        </div>
        {savedCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-full shrink-0"
            style={{ background: 'rgba(107,118,255,.12)', border: '1px solid rgba(107,118,255,.2)' }}>
            <Heart size={12} fill="#6b76ff" style={{ color: '#6b76ff' }} />
            <span className="text-[12px] font-black" style={{ color: '#6b76ff' }}>{savedCount} listalla</span>
          </div>
        )}
      </div>

      {/* ── Segmented control ── */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,.06)' }}>
        {([
          { id: 'nyt' as IdeaMode,  label: '⚡ Juuri nyt' },
          { id: 'ilta' as IdeaMode, label: '🌙 Koko ilta' },
        ]).map(opt => (
          <button key={opt.id} onClick={() => setIdeaMode(opt.id)}
            className="flex-1 py-2 rounded-lg text-sm font-black transition-all"
            style={ideaMode === opt.id
              ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', color: '#fff', boxShadow: '0 4px 12px -4px rgba(91,101,230,.5)' }
              : { color: 'rgba(255,255,255,.4)' }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Swipeable card ── */}
      <div className="relative select-none">

        {/* Shadow card behind */}
        {pool.length > 1 && (
          <div className="absolute inset-x-3 bottom-0 top-2 rounded-3xl z-0"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }} />
        )}

        {/* Main card — touch-action:none so browser doesn't steal the horizontal drag */}
        <div ref={cardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative z-10 rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing"
          style={{
            touchAction: 'none',
            border: '1px solid rgba(255,255,255,.1)',
            transform: cardTransform,
            transition: isDragging.current ? 'none' : 'transform 220ms cubic-bezier(.34,1.56,.64,1)',
            boxShadow: '0 24px 60px -20px rgba(0,0,0,.9)',
          }}>

          {/* Image / gradient */}
          <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/13' }}>
            <div className="absolute inset-0" style={{ background: meta.gradient }} />
            {current.image && (
              <>
                <img src={current.image} alt={current.title}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  onError={e => { (e.target as HTMLElement).style.display = 'none' }} />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,.85) 0%,rgba(0,0,0,.1) 55%,transparent 100%)' }} />
              </>
            )}
            {!current.image && (
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ fontSize: '8rem', opacity: 0.18, filter: `drop-shadow(0 0 40px ${meta.accent})` }}>
                {current.emoji}
              </div>
            )}

            {/* Swipe overlays */}
            {swipeRight && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: swipeOpacity }}>
                <div className="flex flex-col items-center gap-2 bg-emerald-500/20 backdrop-blur-sm rounded-3xl px-8 py-6 border-2 border-emerald-400">
                  <Heart size={40} fill="#4ade80" style={{ color: '#4ade80' }} />
                  <span className="text-emerald-300 font-black text-xl">Tallennettu!</span>
                </div>
              </div>
            )}
            {swipeLeft && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: swipeOpacity }}>
                <div className="flex flex-col items-center gap-2 bg-red-500/20 backdrop-blur-sm rounded-3xl px-8 py-6 border-2 border-red-400">
                  <X size={40} style={{ color: '#f87171' }} />
                  <span className="text-red-300 font-black text-xl">Ohitettu</span>
                </div>
              </div>
            )}

            {/* Type badge + progress */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
              <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/90 bg-black/40 backdrop-blur-sm">
                {current.type === 'event' ? '📅 Tapahtuma' : current.type === 'activity' ? '🧖 Aktiviteetti' : '🍽 Ravintola'}
              </span>
              <span className="text-[11px] font-bold text-white/40 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
                {(idx % Math.max(pool.length, 1)) + 1} / {Math.min(pool.length, 12)}
              </span>
            </div>

            {/* Time indicator ("Alkaa X min") */}
            {current.minutesUntil !== undefined && current.minutesUntil >= 0 && current.minutesUntil < 240 && (
              <div className="absolute top-14 left-4">
                <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-500/90 text-white">
                  ⏱ alkaa {current.minutesUntil < 60
                    ? `${current.minutesUntil} min`
                    : `${Math.round(current.minutesUntil / 60)} h`}
                </span>
              </div>
            )}

            {/* Open status */}
            {current.isOpen !== undefined && current.minutesUntil === undefined && (
              <div className="absolute top-14 left-4">
                <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${current.isOpen ? 'bg-emerald-500/90' : 'bg-white/20'} text-white`}>
                  {current.isOpen ? '● Avoinna nyt' : '○ Suljettu'}
                </span>
              </div>
            )}

            {/* Free badge */}
            {current.isFree && (
              <div className="absolute top-4 right-4">
                <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-500 text-white">ILMAINEN</span>
              </div>
            )}

            {/* Bottom info overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-5">
              {current.badge && (
                <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full mb-2"
                  style={{ background: `${meta.accent}22`, color: meta.accent, border: `1px solid ${meta.accent}40` }}>
                  {current.badge}
                </span>
              )}
              <h2 className="font-black text-white text-2xl leading-tight mb-1" style={{ letterSpacing: '-0.02em' }}>
                {current.title}
              </h2>
              {current.time && (
                <p className="text-white/60 text-sm font-bold">
                  Tänään {current.time}{current.price ? ` · alk. ${current.price}` : ''}
                </p>
              )}
              {current.address && (
                <p className="text-white/40 text-xs mt-0.5 flex items-center gap-1">
                  <MapPin size={10} className="shrink-0" /> {current.address}
                </p>
              )}
            </div>
          </div>

          {/* Card body */}
          <div className="bg-[#0d0d12] p-5 space-y-3">
            {/* Why */}
            <div className="rounded-xl p-3.5 space-y-1" style={{ background: `${meta.accent}0d`, border: `1px solid ${meta.accent}22` }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: `${meta.accent}88` }}>Miksi juuri tämä?</p>
              <p className="text-sm leading-relaxed font-medium line-clamp-3" style={{ color: meta.accent }}>{current.why}</p>
              {current.subWhy && (
                <p className="text-xs text-white/30 italic">{current.subWhy}</p>
              )}
            </div>

            {/* Links */}
            <div className="flex items-center gap-4 flex-wrap">
              {current.url && (
                <a href={/^https?:\/\//i.test(current.url) ? current.url : '#'} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-bold hover:opacity-80 transition-opacity"
                  style={{ color: '#a3abff' }}>
                  <Globe size={12} />
                  {current.type === 'event' ? 'Osta liput →' : 'Nettisivu →'}
                </a>
              )}
              {onShowOnMap && current.lat && current.lon && (
                <button onClick={() => onShowOnMap(current.lat!, current.lon!, current.title, current.type)}
                  className="flex items-center gap-1.5 text-xs font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
                  <MapIcon size={12} /> Kartalla
                </button>
              )}
              {onEventClick && current.eventRef && (
                <button onClick={() => onEventClick(current.eventRef!)}
                  className="flex items-center gap-1.5 text-xs font-bold text-white/30 hover:text-white/60 transition-colors">
                  Lisätietoja →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div className="flex items-center justify-center gap-5">
        {/* Skip */}
        <button onClick={handleSkip}
          className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105"
          style={{ background: 'rgba(248,113,113,.12)', border: '2px solid rgba(248,113,113,.3)' }}>
          <X size={24} style={{ color: '#f87171' }} />
        </button>

        {/* Save */}
        <button onClick={handleSave}
          className="w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105 shadow-lg"
          style={{
            background: savedIds.has(current.id)
              ? 'linear-gradient(150deg,#6b76ff,#5059e6)'
              : 'rgba(107,118,255,.12)',
            border: '2px solid rgba(107,118,255,.4)',
            boxShadow: savedIds.has(current.id) ? '0 8px 24px -8px rgba(91,101,230,.8)' : 'none',
          }}>
          <Heart size={28} fill={savedIds.has(current.id) ? '#fff' : 'none'} style={{ color: savedIds.has(current.id) ? '#fff' : '#6b76ff' }} />
        </button>

        {/* Link / tickets */}
        {current.url ? (
          <a href={/^https?:\/\//i.test(current.url) ? current.url : '#'} target="_blank" rel="noopener noreferrer"
            className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105"
            style={{ background: 'rgba(250,146,60,.12)', border: '2px solid rgba(250,146,60,.3)' }}>
            <Clock size={22} style={{ color: '#fb923c' }} />
          </a>
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center opacity-20"
            style={{ background: 'rgba(255,255,255,.05)', border: '2px solid rgba(255,255,255,.1)' }}>
            <Clock size={22} className="text-white/40" />
          </div>
        )}
      </div>

      {/* Swipe hint */}
      <p className="text-center text-white/20 text-[11px] font-bold">
        Pyyhkäise ♥ oikealle tai ✕ vasemmalle
      </p>

    </main>
  )
}
