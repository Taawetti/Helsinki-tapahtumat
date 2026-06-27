'use client'

import { useState, useEffect, useMemo } from 'react'
import { MapPin, Globe, Phone, Navigation, Clock, Ticket, Timer, Map as MapIcon, X } from 'lucide-react'
import type { Activity, ActivityCategory } from '@/lib/types'
import { getHighlight } from '@/lib/activity-highlights'
import { useLanguage } from '@/contexts/LanguageContext'

// ── Constants ─────────────────────────────────────────────

const CATEGORY_META: Record<ActivityCategory, { label: string; emoji: string }> = {
  sauna:      { label: 'Saunat',         emoji: '🧖' },
  museo:      { label: 'Museot',         emoji: '🏛' },
  nahtavyys:  { label: 'Nähtävyydet',    emoji: '🌄' },
  galleria:   { label: 'Galleriat',      emoji: '🖼' },
  nakopaikka: { label: 'Näköpaikat',     emoji: '🔭' },
  uimaranta:  { label: 'Uimarannat',     emoji: '🏖' },
  puisto:     { label: 'Puistot',        emoji: '🌳' },
  markkina:   { label: 'Markkinat',      emoji: '🛍' },
  urheilu:    { label: 'Urheilu',        emoji: '⚽' },
  muu:        { label: 'Muut',           emoji: '✨' },
}

const SUB_TABS: { id: ActivityCategory | 'all'; label: string; emoji: string }[] = [
  { id: 'all',       label: 'Kaikki',      emoji: '' },
  { id: 'sauna',     label: 'Saunat',      emoji: '🧖' },
  { id: 'nakopaikka',label: 'Näköpaikat',  emoji: '🌄' },
  { id: 'museo',     label: 'Museot',      emoji: '🏛' },
  { id: 'uimaranta', label: 'Uimarannat',  emoji: '🏖' },
  { id: 'puisto',    label: 'Puistot',     emoji: '🌳' },
  { id: 'markkina',  label: 'Markkinat',   emoji: '🛍' },
  { id: 'galleria',  label: 'Galleriat',   emoji: '🖼' },
  { id: 'muu',       label: 'Muut',        emoji: '🛠' },
]

// Helsinki's must-see attractions — used for "Helsingin helmet" row
const HELMET_NAMES = [
  'Suomenlinna', 'Temppeliaukion kirkko', 'Helsingin tuomiokirkko',
  'Amos Rex', 'Löyly', 'Allas Sea Pool', 'Kansallismuseo', 'Ateneum',
  'Kiasma', 'HAM Helsinki', 'Linnanmäki', 'Korkeasaari', 'Oodi',
]

const QUICK_SORTS = [
  { id: 'default',  label: 'Kaikki' },
  { id: 'open',     label: '🟢 Avoinna nyt' },
  { id: 'yllatys',  label: '✨ Ylläty' },
]
type QuickSort = 'default' | 'open' | 'yllatys'

// Indoor categories (for "Sateen sattuessa")
const INDOOR_CATS: ActivityCategory[] = ['museo', 'galleria', 'muu']

// ── Helpers ───────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function fmtReviews(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

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
        if (a >= 0 && b >= 0) return keys.slice(a, b + 1).map(k => D[k][0])
      }
      return []
    }
    for (const part of hours.split(';')) {
      const m = part.trim().match(/^([\w-]+(?:,[\w-]+)*)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/)
      if (!m) continue
      const days = m[1].split(',').flatMap(expandRange)
      if (!days.includes(dayIdx)) continue
      const [fh, fm] = m[2].split(':').map(Number)
      const [th, tm] = m[3].split(':').map(Number)
      const from = fh * 60 + fm, to = th * 60 + tm
      if (cur >= from && cur <= (to < from ? to + 1440 : to)) return true
    }
    return false
  } catch { return undefined }
}

function ctaLabel(a: Activity): string {
  if (a.category === 'sauna') return 'Varaa vuoro →'
  if (a.category === 'museo' || a.category === 'galleria') return 'Osta liput →'
  return 'Lisätietoja →'
}

// ── Hero card ─────────────────────────────────────────────

function ActivityHero({ a, distance, rating, onShowOnMap }: {
  a: Activity
  distance?: number
  rating?: { rating: number; reviewCount: number }
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const open = isOpenNow(a.openingHours)
  const highlight = getHighlight(a.name)
  const meta = CATEGORY_META[a.category]

  return (
    <div className="relative w-full rounded-[22px] overflow-hidden" style={{ aspectRatio: '16/9', boxShadow: '0 22px 50px -20px rgba(10,10,12,.8)' }}>
      {a.image ? (
        <img src={a.image} alt={a.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-6xl" style={{ background: 'linear-gradient(135deg,#042f2e,#0f4c35,#065f46)' }}>
          {meta.emoji}
        </div>
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.97) 0%,rgba(10,10,12,.15) 55%,transparent 100%)' }} />

      {open !== undefined && (
        <div className="absolute top-4 right-4">
          <span className={`text-[11px] font-black px-3 py-1 rounded-full ${open ? 'bg-emerald-500 text-white' : 'bg-white/20 text-white/60'}`}>
            {open ? 'Avoinna' : 'Suljettu'}
          </span>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="text-[11px] font-black uppercase tracking-[.1em] mb-1" style={{ color: 'rgba(255,255,255,.5)' }}>
          {meta.emoji} {meta.label.toUpperCase()}{a.address ? ` · ${a.address.split(',')[0].toUpperCase()}` : ''}
        </p>
        <h2 className="font-black text-white text-2xl leading-tight mb-3" style={{ letterSpacing: '-0.02em' }}>{a.name}</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {a.www ? (
            <a href={/^https?:\/\//i.test(a.www) ? a.www : '#'} target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 rounded-full text-white text-[13px] font-black"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 10px 24px -8px rgba(91,101,230,.85)' }}>
              {ctaLabel(a)}
            </a>
          ) : (
            <span className="px-4 py-2 rounded-full text-white text-[13px] font-black" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
              {ctaLabel(a)}
            </span>
          )}
          <div className="flex items-center gap-2">
            {rating && (
              <span className="text-[13px] font-bold" style={{ color: '#e8c06a' }}>
                ★ {rating.rating.toFixed(1)}
              </span>
            )}
            {distance !== undefined && (
              <span className="text-white/50 text-[13px] font-bold">· {fmtDist(distance)}</span>
            )}
          </div>
          {onShowOnMap && a.lat && a.lon && (
            <button onClick={() => onShowOnMap(a.lat!, a.lon!, a.name)}
              className="text-[12px] font-bold text-white/40 hover:text-white/70 transition-colors">
              🗺 Kartalla
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Row card (horizontal carousels) ──────────────────────

function ActivityRowCard({ a, distance, rating, onClick }: {
  a: Activity
  distance?: number
  rating?: { rating: number; reviewCount: number }
  onClick: (a: Activity) => void
}) {
  const open = isOpenNow(a.openingHours)
  const meta = CATEGORY_META[a.category]
  return (
    <button onClick={() => onClick(a)}
      className="group shrink-0 w-40 text-left rounded-[18px] overflow-hidden"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4/3' }}>
        {a.image ? (
          <img src={a.image} alt={a.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl" style={{ background: 'linear-gradient(135deg,#042f2e,#0f4c35)' }}>
            {meta.emoji}
          </div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.8) 0%,transparent 60%)' }} />
        {open !== undefined && (
          <div className="absolute top-2 right-2">
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${open ? 'bg-emerald-500 text-white' : 'bg-black/50 text-white/50'}`}>
              {open ? '● Auki' : '○ Kiinni'}
            </span>
          </div>
        )}
        {a.fee === false && (
          <div className="absolute top-2 left-2">
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">ILMAINEN</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-white font-black text-[13px] leading-tight line-clamp-1" style={{ letterSpacing: '-0.01em' }}>{a.name}</p>
        {rating ? (
          <p className="text-[11px] mt-0.5 font-bold" style={{ color: '#e8c06a' }}>★ {rating.rating.toFixed(1)} · {fmtReviews(rating.reviewCount)}</p>
        ) : (
          <p className="text-white/40 text-[11px] mt-0.5">{meta.label}{distance !== undefined ? ` · ${fmtDist(distance)}` : ''}</p>
        )}
      </div>
    </button>
  )
}

// ── Row section ───────────────────────────────────────────

function ActRow({ title, items, distMap, ratingMap, onCardClick }: {
  title: string
  items: Activity[]
  distMap: Map<string, number>
  ratingMap: Map<string, { rating: number; reviewCount: number }>
  onCardClick: (a: Activity) => void
}) {
  if (items.length === 0) return null
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-white text-[17px] tracking-tight" style={{ letterSpacing: '-0.02em' }}>{title}</h2>
        <button className="text-[13px] font-bold" style={{ color: '#6b76ff' }}>Kaikki ›</button>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {items.slice(0, 10).map(a => (
          <ActivityRowCard key={a.id} a={a} distance={distMap.get(a.id)} rating={ratingMap.get(a.name.toLowerCase())} onClick={onCardClick} />
        ))}
      </div>
    </section>
  )
}

// ── Underline tabs ─────────────────────────────────────────

function UnderlineTabs<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string; emoji?: string }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex overflow-x-auto scrollbar-none -mx-4 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className="shrink-0 flex items-center gap-1.5 px-4 py-3 text-[13px] font-black transition-all relative"
          style={{ color: active === tab.id ? '#6b76ff' : 'rgba(255,255,255,.4)' }}>
          {tab.emoji && <span>{tab.emoji}</span>}
          {tab.label}
          {active === tab.id && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }} />
          )}
        </button>
      ))}
    </div>
  )
}

// ── List card (vertical, for category view) ───────────────

function ActivityListCard({ a, distance, rating, onShowOnMap }: {
  a: Activity
  distance?: number
  rating?: { rating: number; reviewCount: number }
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()
  const open = isOpenNow(a.openingHours)
  const highlight = getHighlight(a.name)
  const meta = CATEGORY_META[a.category]

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.7)' }}>
      {a.image && (
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/7' }}>
          <img src={a.image} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.5) 0%,transparent 60%)' }} />
        </div>
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0">{meta.emoji}</span>
            <h3 className="font-black text-white text-sm leading-tight">{a.name}</h3>
          </div>
          <div className="flex gap-1 shrink-0 flex-wrap justify-end">
            {open !== undefined && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${open ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/10 text-red-400/60'}`}>
                {open ? '● Avoinna' : '○ Suljettu'}
              </span>
            )}
            {a.fee === false && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">ILMAINEN</span>
            )}
            {distance !== undefined && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-[#a3abff]" style={{ background: 'rgba(107,118,255,.12)' }}>
                {fmtDist(distance)}
              </span>
            )}
          </div>
        </div>

        {rating && (
          <p className="text-[12px] font-bold" style={{ color: '#e8c06a' }}>★ {rating.rating.toFixed(1)} · {fmtReviews(rating.reviewCount)} arvostelua</p>
        )}

        {highlight?.hook ? (
          <p className="text-amber-300/70 text-xs leading-snug font-medium">{highlight.hook}</p>
        ) : a.description ? (
          <p className="text-white/40 text-xs">{a.description}</p>
        ) : null}

        {highlight?.duration && (
          <p className="text-white/30 text-xs flex items-center gap-1">
            <Timer size={10} /> {highlight.duration}
          </p>
        )}

        {a.address && (
          <div className="flex items-center gap-1.5 text-white/30 text-xs">
            <MapPin size={10} className="shrink-0" />
            <span>{a.address}{a.city && a.city !== 'Helsinki' ? `, ${a.city}` : ''}</span>
          </div>
        )}

        {a.fee === true && a.charge && (
          <div className="flex items-center gap-1 text-xs text-amber-400/70">
            <Ticket size={10} /> {a.charge}
          </div>
        )}

        <div className="flex items-center gap-3 pt-0.5 flex-wrap">
          {a.www && (
            <a href={/^https?:\/\//i.test(a.www) ? a.www : '#'} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold hover:opacity-80 transition-opacity"
              style={{ color: '#a3abff' }}>
              <Globe size={10} /> {t('common.website')}
            </a>
          )}
          {a.phone && (
            <a href={`tel:${a.phone}`} className="flex items-center gap-1 text-[10px] font-bold text-white/30 hover:text-white/60 transition-colors">
              <Phone size={10} /> {a.phone}
            </a>
          )}
          {onShowOnMap && a.lat && a.lon && (
            <button onClick={() => onShowOnMap(a.lat!, a.lon!, a.name)}
              className="flex items-center gap-1 text-[10px] font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
              <MapIcon size={10} /> Kartalla
            </button>
          )}
          {((a.lat && a.lon) || a.address) && (
            <a href={a.lat && a.lon
              ? `https://maps.google.com/maps?daddr=${a.lat},${a.lon}&travelmode=transit`
              : `https://maps.google.com/maps?daddr=${encodeURIComponent(a.address + ', Helsinki')}&travelmode=transit`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold text-blue-400/70 hover:text-blue-300 transition-colors">
              <Navigation size={10} /> Reittiohjeet
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────

export default function ActivitiesView({ onShowOnMap }: {
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState<ActivityCategory | 'all'>('all')
  const [quickSort, setQuickSort] = useState<QuickSort>('default')
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [venueRatings, setVenueRatings] = useState<Record<string, { rating: number; reviewCount: number; priceLevel: string | null }>>({})
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)

  useEffect(() => {
    fetch('/api/activities')
      .then(r => r.json())
      .then(data => setActivities(data.activities ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/venue-ratings')
      .then(r => r.json())
      .then(data => setVenueRatings(data.ratings ?? {}))
      .catch(() => {})
  }, [])

  useEffect(() => { setQuickSort('default') }, [catFilter])

  const distMap = useMemo(() => {
    if (!userPos) return new Map<string, number>()
    const m = new Map<string, number>()
    activities.forEach(a => { if (a.lat && a.lon) m.set(a.id, haversine(userPos[0], userPos[1], a.lat, a.lon)) })
    return m
  }, [userPos, activities])

  const ratingMap = useMemo(() => {
    const m = new Map<string, { rating: number; reviewCount: number }>()
    Object.entries(venueRatings).forEach(([key, val]) => { if (val) m.set(key.toLowerCase(), val) })
    return m
  }, [venueRatings])

  // Pool for current category
  const catPool = useMemo(() => {
    if (catFilter === 'all') return activities
    return activities.filter(a => a.category === catFilter)
  }, [activities, catFilter])

  // Apply quick sort
  const sortedPool = useMemo(() => {
    let result = [...catPool]
    if (quickSort === 'open') {
      result = result.filter(a => isOpenNow(a.openingHours) === true)
    } else if (quickSort === 'yllatys') {
      // Shuffle for "surprise" effect (stable across renders via id hash)
      result = result.sort((a, b) => {
        const ha = a.id.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0) % 997
        const hb = b.id.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0) % 997
        return ha - hb
      })
    } else if (userPos && distMap.size > 0) {
      // No sort change unless nearby was selected via RestaurantsView pattern
    }
    return result
  }, [catPool, quickSort, userPos, distMap])

  // Hero: preferred sauna or first with image
  const heroActivity = useMemo(() => {
    if (catFilter !== 'all') return null
    const pool = catFilter === 'all' ? activities : catPool
    return pool.find(a => a.category === 'sauna' && a.image && isOpenNow(a.openingHours))
      ?? pool.find(a => a.image && isOpenNow(a.openingHours))
      ?? pool.find(a => a.image)
      ?? pool[0]
      ?? null
  }, [activities, catPool, catFilter])

  // Curated rows
  const rows = useMemo(() => {
    if (catFilter !== 'all') return []
    const helmetSet = new Set(HELMET_NAMES.map(n => n.toLowerCase()))
    return [
      { title: '❤️ Helsingin helmet',     items: activities.filter(a => helmetSet.has(a.name.toLowerCase())) },
      { title: '☔ Sateen sattuessa',      items: activities.filter(a => INDOOR_CATS.includes(a.category)) },
      { title: '🆓 Ilmaiseksi',            items: activities.filter(a => a.fee === false) },
      { title: '🧖 Saunat',               items: activities.filter(a => a.category === 'sauna') },
      { title: '🌄 Näköpaikat',           items: activities.filter(a => a.category === 'nakopaikka') },
      { title: '📅 Tänään auki',           items: activities.filter(a => isOpenNow(a.openingHours) === true) },
    ]
  }, [activities, catFilter])

  const isHomepageView = catFilter === 'all' && quickSort === 'default'

  return (
    <main className="max-w-6xl mx-auto px-4 pt-4 pb-24 space-y-4">

      {/* ── Heading ── */}
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">HELSINKI</p>
        <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.8rem,6vw,3rem)', letterSpacing: '-0.03em' }}>
          Aktiviteetit
        </h1>
      </div>

      {/* ── Category tabs ── */}
      <UnderlineTabs
        tabs={SUB_TABS}
        active={catFilter}
        onChange={(id) => setCatFilter(id as ActivityCategory | 'all')}
      />

      {/* ── Loading ── */}
      {loading && (
        <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shrink-0 w-40 rounded-[18px] overflow-hidden bg-white/4 animate-pulse" style={{ aspectRatio: '4/3' }} />
          ))}
        </div>
      )}

      {/* ── Homepage view ── */}
      {!loading && isHomepageView && (
        <>
          {/* Hero */}
          {heroActivity && (
            <ActivityHero
              a={heroActivity}
              distance={distMap.get(heroActivity.id)}
              rating={ratingMap.get(heroActivity.name.toLowerCase())}
              onShowOnMap={onShowOnMap}
            />
          )}

          {/* Quick sort pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
            {QUICK_SORTS.map(s => {
              const isActive = quickSort === s.id
              return (
                <button key={s.id} onClick={() => setQuickSort(s.id as QuickSort)}
                  className="shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all"
                  style={isActive
                    ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', color: '#fff' }
                    : { background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)' }
                  }>
                  {s.label}
                </button>
              )
            })}
          </div>

          {/* Curated rows */}
          {rows.filter(r => r.items.length > 0).map(row => (
            <ActRow key={row.title} title={row.title} items={row.items} distMap={distMap} ratingMap={ratingMap} onCardClick={setSelectedActivity} />
          ))}
        </>
      )}

      {/* ── List view (category selected or quick sort active) ── */}
      {!loading && !isHomepageView && (
        <>
          {/* Quick sort pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
            {QUICK_SORTS.map(s => {
              const isActive = quickSort === s.id
              return (
                <button key={s.id} onClick={() => setQuickSort(s.id as QuickSort)}
                  className="shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all"
                  style={isActive
                    ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', color: '#fff' }
                    : { background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)' }
                  }>
                  {s.label}
                </button>
              )
            })}
            {catFilter !== 'all' && (
              <button onClick={() => { setCatFilter('all'); setQuickSort('default') }}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-full text-sm font-bold text-white/30"
                style={{ background: 'rgba(255,255,255,.04)' }}>
                <X size={12} /> Tyhjennä
              </button>
            )}
          </div>

          <p className="text-white/20 text-xs font-bold">{sortedPool.length} kohdetta</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedPool.slice(0, 48).map(a => (
              <ActivityListCard
                key={a.id}
                a={a}
                distance={distMap.get(a.id)}
                rating={ratingMap.get(a.name.toLowerCase())}
                onShowOnMap={onShowOnMap}
              />
            ))}
          </div>

          {sortedPool.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center gap-3">
              <span className="text-5xl">🔭</span>
              <p className="text-white/40 font-bold">Ei kohteita tällä suodatuksella</p>
              <button onClick={() => { setCatFilter('all'); setQuickSort('default') }}
                className="text-sm font-bold px-4 py-2 rounded-xl border text-[#6b76ff]"
                style={{ borderColor: 'rgba(107,118,255,.3)' }}>
                Näytä kaikki
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Detail panel ── */}
      {selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSelectedActivity(null)}>
          <div className="w-full max-w-2xl mx-auto rounded-t-[28px] overflow-hidden animate-sheet-up"
            style={{ background: '#0f0f13', border: '1px solid rgba(255,255,255,.1)' }}
            onClick={e => e.stopPropagation()}>
            {selectedActivity.image && (
              <div className="relative w-full" style={{ aspectRatio: '16/7' }}>
                <img src={selectedActivity.image} alt={selectedActivity.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(15,15,19,.9) 0%,transparent 60%)' }} />
              </div>
            )}
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <h2 className="font-black text-white text-xl leading-tight">{selectedActivity.name}</h2>
                <button onClick={() => setSelectedActivity(null)} className="p-2 rounded-full text-white/40 hover:text-white"
                  style={{ background: 'rgba(255,255,255,.08)' }}>
                  <X size={16} />
                </button>
              </div>
              {selectedActivity.description && <p className="text-white/50 text-sm">{selectedActivity.description}</p>}
              {selectedActivity.address && (
                <div className="flex items-center gap-2 text-white/30 text-sm">
                  <MapPin size={13} /> {selectedActivity.address}
                </div>
              )}
              {selectedActivity.openingHours && (
                <div className="flex items-center gap-2 text-white/30 text-sm">
                  <Clock size={13} /> {selectedActivity.openingHours}
                </div>
              )}
              <div className="flex gap-3 pt-1 flex-wrap">
                {selectedActivity.www && (
                  <a href={/^https?:\/\//i.test(selectedActivity.www) ? selectedActivity.www : '#'} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-black"
                    style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                    <Globe size={13} /> {ctaLabel(selectedActivity)}
                  </a>
                )}
                {onShowOnMap && selectedActivity.lat && selectedActivity.lon && (
                  <button onClick={() => { onShowOnMap(selectedActivity.lat!, selectedActivity.lon!, selectedActivity.name); setSelectedActivity(null) }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white/70 text-sm font-bold"
                    style={{ background: 'rgba(255,255,255,.08)' }}>
                    <MapIcon size={13} /> Kartalla
                  </button>
                )}
                {((selectedActivity.lat && selectedActivity.lon) || selectedActivity.address) && (
                  <a href={selectedActivity.lat && selectedActivity.lon
                    ? `https://maps.google.com/maps?daddr=${selectedActivity.lat},${selectedActivity.lon}&travelmode=transit`
                    : `https://maps.google.com/maps?daddr=${encodeURIComponent(selectedActivity.address + ', Helsinki')}&travelmode=transit`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white/70 text-sm font-bold"
                    style={{ background: 'rgba(255,255,255,.08)' }}>
                    <Navigation size={13} /> Reittiohjeet
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
