'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Search, MapPin, Globe, Phone, X, ChevronDown, Navigation,
  Star, ChevronRight, ChevronLeft, Map as MapIcon,
} from 'lucide-react'
import type { Restaurant } from '@/lib/types'
import { FEATURED_PICKS, CRITIC_PICKS } from '@/lib/restaurant-awards'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

// ── Constants ─────────────────────────────────────────────

const PAGE_SIZE = 48

const PRICE_LABELS = ['', '€', '€€', '€€€', '€€€€']

const TYPE_OPTIONS = [
  { id: 'all',       tKey: 'restaurants.type_all'        },
  { id: 'ravintola', tKey: 'restaurants.type_restaurant' },
  { id: 'kahvila',   tKey: 'restaurants.type_cafe'       },
  { id: 'baari',     tKey: 'restaurants.type_bar'        },
  { id: 'pikaruoka', tKey: 'restaurants.type_fastfood'   },
] as const
type TypeFilter = (typeof TYPE_OPTIONS)[number]['id']

type SortMode = 'default' | 'nearby' | 'price_asc' | 'price_desc'

// Cuisine category chips (Wolt-style)
const CUISINE_CATEGORIES = [
  { id: 'all',           label: 'Kaikki',          emoji: '🌍', tKey: 'cuisine.all' },
  { id: 'awarded',       label: 'Palkitut',         emoji: '🏆', tKey: 'cuisine.awarded' },
  { id: 'nordisk',       label: 'Pohjoismainen',    emoji: '🇫🇮', tKey: 'cuisine.nordisk' },
  { id: 'japanese',      label: 'Japanilainen',     emoji: '🍣', tKey: 'cuisine.japanese' },
  { id: 'pizza',         label: 'Pizza',            emoji: '🍕', tKey: 'cuisine.pizza' },
  { id: 'italian',       label: 'Italialainen',     emoji: '🍝', tKey: 'cuisine.italian' },
  { id: 'asian',         label: 'Aasialainen',      emoji: '🍜', tKey: 'cuisine.asian' },
  { id: 'burger',        label: 'Hampurilaiset',    emoji: '🍔', tKey: 'cuisine.burger' },
  { id: 'veggie',        label: 'Kasvis',           emoji: '🌱', tKey: 'cuisine.veggie' },
  { id: 'kebab',         label: 'Kebab',            emoji: '🌯', tKey: 'cuisine.kebab' },
  { id: 'mediterranean', label: 'Välimeri',         emoji: '🫒', tKey: 'cuisine.mediterranean' },
  { id: 'indian',        label: 'Intialainen',      emoji: '🍛', tKey: 'cuisine.indian' },
  { id: 'seafood',       label: 'Kala & meri',      emoji: '🐟', tKey: 'cuisine.seafood' },
  { id: 'steak',         label: 'Pihvi & grilli',   emoji: '🥩', tKey: 'cuisine.steak' },
  { id: 'mexican',       label: 'Meksikolainen',    emoji: '🌮', tKey: 'cuisine.mexican' },
  { id: 'cafe',          label: 'Kahvila & dessert', emoji: '☕', tKey: 'cuisine.cafe_dessert' },
] as const
type CuisineFilter = (typeof CUISINE_CATEGORIES)[number]['id']

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

function typeStyle(type: Restaurant['type']): { cls: string; tKey: TranslationKey } {
  switch (type) {
    case 'ravintola': return { cls: 'bg-amber-500/15 text-amber-300/80', tKey: 'rest.type.ravintola' }
    case 'kahvila':   return { cls: 'bg-emerald-500/15 text-emerald-300/80', tKey: 'rest.type.kahvila' }
    case 'baari':     return { cls: 'bg-fuchsia-500/15 text-fuchsia-300/80', tKey: 'rest.type.baari' }
    case 'pikaruoka': return { cls: 'bg-orange-500/15 text-orange-300/80', tKey: 'rest.type.pikaruoka' }
    default:          return { cls: 'bg-white/8 text-white/35', tKey: 'rest.type.place' }
  }
}

function isOpenNow(hours: string): boolean | undefined {
  if (!hours) return undefined
  if (hours === '24/7') return true
  try {
    const now = new Date()
    const dayIdx = now.getDay()
    const cur = now.getHours() * 60 + now.getMinutes()
    const D: Record<string, number[]> = {
      Mo: [1], Tu: [2], We: [3], Th: [4], Fr: [5], Sa: [6], Su: [0],
    }
    function expandRange(spec: string): number[] {
      if (D[spec]) return D[spec]
      const m = spec.match(/^([A-Z][a-z])-([A-Z][a-z])$/)
      if (m) {
        const keys = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
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
  } catch {
    return undefined
  }
}

// ── Award badges ──────────────────────────────────────────

function AwardBadges({ r }: { r: Restaurant }) {
  const { t } = useLanguage()
  if (!r.michelinStars && !r.bibGourmand && !r.greenMichelin && !r.awards?.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {r.michelinStars === 2 && (
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/20">
          ⭐⭐ {t('rest.award.stars2')}
        </span>
      )}
      {r.michelinStars === 1 && (
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/15">
          ⭐ Michelin
        </span>
      )}
      {r.bibGourmand && !r.michelinStars && (
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/15">
          😊 Bib Gourmand
        </span>
      )}
      {r.greenMichelin && (
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-500/15 text-green-300 border border-green-500/15">
          🌿 Green Star
        </span>
      )}
      {r.awards?.filter(a => a.includes('Vuoden ravintola')).map(a => (
        <span key={a} className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/15">
          🏆 {a.replace('🏆 ', '')}
        </span>
      ))}
    </div>
  )
}

// ── Restaurant card ───────────────────────────────────────

function RestaurantCard({ r, distance, onShowOnMap }: {
  r: Restaurant
  distance?: number
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()
  const { cls, tKey } = typeStyle(r.type)
  const open = r.openingHours ? isOpenNow(r.openingHours) : undefined

  return (
    <div className="rounded-2xl border border-white/6 overflow-hidden bg-white/3 hover:bg-white/[0.055] transition-colors group">
      {r.image && (
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/8' }}>
          <img src={r.image} alt={r.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(8,8,12,0.55) 0%,transparent 60%)' }} />
        </div>
      )}
      <div className="p-4 space-y-2">
        {/* Name + badges row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-white text-sm leading-tight">{r.name}</h3>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {distance !== undefined && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300/80">
                {fmtDist(distance)}
              </span>
            )}
            {r.priceRange && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/6 text-white/45">
                {PRICE_LABELS[r.priceRange]}
              </span>
            )}
            {open !== undefined && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${open ? 'bg-green-500/15 text-green-400' : 'bg-red-500/10 text-red-400/60'}`}>
                {open ? t('common.open') : t('common.closed')}
              </span>
            )}
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${cls}`}>{t(tKey)}</span>
          </div>
        </div>

        {/* Award badges */}
        <AwardBadges r={r} />

        {/* Cuisine */}
        {r.description && (
          <p className="text-white/40 text-xs capitalize">{r.description}</p>
        )}

        {/* Address */}
        {r.address && (
          <div className="flex items-center gap-1.5 text-white/30 text-xs">
            <MapPin size={10} className="shrink-0" />
            <span>{r.address}{r.city && r.city !== 'Helsinki' ? `, ${r.city}` : ''}</span>
          </div>
        )}

        {/* Links */}
        <div className="flex items-center gap-3 pt-0.5 flex-wrap">
          {r.www && (
            <a href={/^https?:\/\//i.test(r.www ?? '') ? r.www! : '#'} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold text-purple-400/70 hover:text-purple-300 transition-colors">
              <Globe size={10} /> {t('common.website')}
            </a>
          )}
          {r.phone && (
            <a href={`tel:${r.phone}`}
              className="flex items-center gap-1 text-[10px] font-bold text-white/30 hover:text-white/60 transition-colors">
              <Phone size={10} /> {r.phone}
            </a>
          )}
          {r.outdoorSeating && (
            <span className="text-[10px] text-white/20">{t('common.terrace')}</span>
          )}
          {onShowOnMap && r.lat && r.lon && (
            <button
              onClick={() => onShowOnMap(r.lat!, r.lon!, r.name)}
              className="flex items-center gap-1 text-[10px] font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
              <MapIcon size={10} /> {t('common.show_on_map')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Featured card (big, for Michelin/awarded) ─────────────

function FeaturedCard({ r, pick, distance, onShowOnMap }: {
  r?: Restaurant
  pick: (typeof FEATURED_PICKS)[number]
  distance?: number
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t, lang } = useLanguage()
  if (!r) return null
  const open = r.openingHours ? isOpenNow(r.openingHours) : undefined

  return (
    <div className="shrink-0 w-72 rounded-2xl border border-white/8 overflow-hidden bg-gradient-to-b from-white/6 to-white/2 hover:from-white/8 hover:to-white/4 transition-all group">
      {/* Top badge */}
      <div className="px-4 pt-3 pb-2">
        <span className="text-[11px] font-black text-red-300/90 leading-none">{lang === 'en' && pick.badgeEn ? pick.badgeEn : pick.badge}</span>
      </div>

      <div className="px-4 pb-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-black text-white text-base leading-tight">{r.name}</h3>
          <div className="flex gap-1">
            {open !== undefined && (
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${open ? 'bg-green-500/15 text-green-400' : 'bg-red-500/10 text-red-400/60'}`}>
                {open ? t('common.open') : t('common.closed')}
              </span>
            )}
          </div>
        </div>

        <p className="text-white/50 text-xs leading-relaxed">{lang === 'en' && pick.noteEn ? pick.noteEn : pick.note}</p>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-white/35 bg-white/5 px-2 py-0.5 rounded-full">{lang === 'en' && pick.cuisineHintEn ? pick.cuisineHintEn : pick.cuisineHint}</span>
          {r.priceRange && (
            <span className="text-[10px] text-white/35 bg-white/5 px-2 py-0.5 rounded-full">{PRICE_LABELS[r.priceRange]}</span>
          )}
          {distance !== undefined && (
            <span className="text-[10px] text-blue-300/70 bg-blue-500/10 px-2 py-0.5 rounded-full">{fmtDist(distance)}</span>
          )}
        </div>

        {r.address && (
          <div className="flex items-center gap-1.5 text-white/25 text-xs">
            <MapPin size={10} className="shrink-0" />
            <span>{r.address}</span>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1 flex-wrap">
          {r.www && (
            <a href={/^https?:\/\//i.test(r.www ?? '') ? r.www! : '#'} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold text-purple-400/80 hover:text-purple-300 transition-colors">
              <Globe size={10} /> {t('common.website')}
            </a>
          )}
          {r.phone && (
            <a href={`tel:${r.phone}`}
              className="flex items-center gap-1 text-[10px] font-bold text-white/30 hover:text-white/60 transition-colors">
              <Phone size={10} /> {r.phone}
            </a>
          )}
          {onShowOnMap && r.lat && r.lon && (
            <button
              onClick={() => onShowOnMap(r.lat!, r.lon!, r.name)}
              className="flex items-center gap-1 text-[10px] font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
              <MapIcon size={10} /> {t('common.show_on_map')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Critic review card ────────────────────────────────────

function CriticCard({ pick }: { pick: (typeof CRITIC_PICKS)[number] }) {
  const { lang } = useLanguage()
  return (
    <div className="shrink-0 w-64 rounded-2xl border border-white/6 bg-white/[0.025] p-4 space-y-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: pick.stars ?? 4 }).map((_, i) => (
          <Star key={i} size={10} className="fill-yellow-400 text-yellow-400" />
        ))}
        <span className="text-white/30 text-[10px] ml-1">{pick.source}</span>
      </div>
      <p className="text-white/55 text-xs leading-relaxed italic">&ldquo;{lang === 'en' && pick.snippetEn ? pick.snippetEn : pick.snippet}&rdquo;</p>
      <p className="text-white/80 text-sm font-bold">{pick.name}</p>
      <p className="text-white/20 text-[10px]">{pick.year}</p>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────

export default function RestaurantsView({ onShowOnMap }: {
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()

  function typeLabel(id: TypeFilter): string {
    switch (id) {
      case 'all':       return t('restaurants.type_all')
      case 'ravintola': return t('restaurants.type_restaurant')
      case 'kahvila':   return t('restaurants.type_cafe')
      case 'baari':     return t('restaurants.type_bar')
      case 'pikaruoka': return t('restaurants.type_fastfood')
    }
  }

  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [total, setTotal] = useState(0)
  const [categoryCount, setCategoryCount] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [cuisineFilter, setCuisineFilter] = useState<CuisineFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState(false)
  const cuisineRowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/restaurants')
      .then(r => r.json())
      .then(data => {
        setRestaurants(data.restaurants ?? [])
        setTotal(data.total ?? 0)
        setCategoryCount(data.categoryCount ?? {})
        setError('')
      })
      .catch(() => setError(t('restaurants.error')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { setShown(PAGE_SIZE) }, [search, typeFilter, cuisineFilter, sortMode])

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) { setLocError(true); return }
    setLocating(true); setLocError(false)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserPos([pos.coords.latitude, pos.coords.longitude])
        setSortMode('nearby')
        setLocating(false)
      },
      () => { setLocating(false); setLocError(true) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  const distMap = useMemo(() => {
    if (!userPos) return new Map<string, number>()
    const m = new Map<string, number>()
    restaurants.forEach(r => {
      if (r.lat && r.lon) m.set(r.id, haversine(userPos[0], userPos[1], r.lat, r.lon))
    })
    return m
  }, [userPos, restaurants])

  // Featured restaurants with matched data
  const featuredWithData = useMemo(() => {
    const byName = new Map(restaurants.map(r => [r.name.toLowerCase(), r]))
    return FEATURED_PICKS
      .map(pick => ({ pick, r: byName.get(pick.name.toLowerCase()) }))
      .filter(x => x.r)
  }, [restaurants])

  const filtered = useMemo(() => {
    let result = restaurants

    if (cuisineFilter !== 'all') {
      if (cuisineFilter === 'awarded') {
        result = result.filter(r => r.featured)
      } else {
        result = result.filter(r => r.cuisineCategories.includes(cuisineFilter))
      }
    }
    if (typeFilter !== 'all') result = result.filter(r => r.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      )
    }

    if (sortMode === 'nearby' && userPos) {
      result = [...result].sort((a, b) => (distMap.get(a.id) ?? Infinity) - (distMap.get(b.id) ?? Infinity))
    } else if (sortMode === 'price_asc') {
      result = [...result].sort((a, b) => (a.priceRange ?? 2) - (b.priceRange ?? 2))
    } else if (sortMode === 'price_desc') {
      result = [...result].sort((a, b) => (b.priceRange ?? 2) - (a.priceRange ?? 2))
    }

    return result
  }, [restaurants, cuisineFilter, typeFilter, search, sortMode, userPos, distMap])

  const visible = filtered.slice(0, shown)
  const hasMore = shown < filtered.length

  const scrollCuisine = (dir: 'left' | 'right') => {
    cuisineRowRef.current?.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' })
  }

  return (
    <main className="max-w-6xl mx-auto px-4 pt-5 pb-24 space-y-6">

      {/* ── Heading ── */}
      <div>
        <h1 className="font-black text-white leading-none select-none"
          style={{ fontSize: 'clamp(2rem,8vw,4rem)', letterSpacing: '-0.03em' }}>
          {t('restaurants.heading')}
        </h1>
        <p className="text-white/25 text-sm mt-1">{t('restaurants.subtitle')}</p>
      </div>

      {/* ── Featured/Palkitut section ── */}
      {!loading && featuredWithData.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white/80 font-black text-sm tracking-wide uppercase">
              {t('restaurants.michelin')}
            </h2>
            <div className="flex gap-1">
              <button onClick={() => scrollCuisine('left')} className="p-1.5 rounded-lg bg-white/5 text-white/30 hover:text-white/70 hover:bg-white/10 transition-all">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => scrollCuisine('right')} className="p-1.5 rounded-lg bg-white/5 text-white/30 hover:text-white/70 hover:bg-white/10 transition-all">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto scrollbar-none -mx-4 px-4 pb-2" ref={cuisineRowRef}>
            {featuredWithData.map(({ pick, r }) => (
              <FeaturedCard key={pick.name} pick={pick} r={r} distance={r?.id ? distMap.get(r.id) : undefined} onShowOnMap={onShowOnMap} />
            ))}
          </div>
        </section>
      )}

      {/* ── Critics picks ── */}
      {!loading && (
        <section>
          <h2 className="text-white/80 font-black text-sm tracking-wide uppercase mb-3">
            {t('restaurants.critics')}
          </h2>
          <div className="flex gap-4 overflow-x-auto scrollbar-none -mx-4 px-4 pb-2">
            {CRITIC_PICKS.map(pick => <CriticCard key={`${pick.name}-${pick.source}`} pick={pick} />)}
          </div>
        </section>
      )}

      {/* ── Search ── */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('restaurants.search_ph')}
          className="w-full pl-9 pr-9 py-3 bg-white/5 border border-white/8 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/40 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Cuisine category chips (Wolt-style) ── */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {CUISINE_CATEGORIES.map(cat => {
          const count = cat.id === 'all' ? total
            : cat.id === 'awarded' ? restaurants.filter(r => r.featured).length
            : (categoryCount[cat.id] ?? 0)
          if (cat.id !== 'all' && cat.id !== 'awarded' && count === 0) return null
          return (
            <button key={cat.id}
              onClick={() => setCuisineFilter(cat.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-black transition-all whitespace-nowrap ${
                cuisineFilter === cat.id
                  ? 'text-white shadow-lg'
                  : 'text-white/40 bg-white/5 hover:bg-white/8 hover:text-white/70'
              }`}
              style={cuisineFilter === cat.id ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)' } : {}}>
              <span>{cat.emoji}</span>
              <span>{t(cat.tKey as TranslationKey)}</span>
              {count > 0 && cuisineFilter !== cat.id && (
                <span className="text-white/20 text-[10px] font-normal">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Type + sort row ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Type filter */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {TYPE_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => setTypeFilter(opt.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
                typeFilter === opt.id
                  ? 'bg-white/15 text-white'
                  : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/60'
              }`}>
              {typeLabel(opt.id)}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-white/8 hidden sm:block" />

        {/* Sort */}
        <div className="flex gap-1.5">
          <button onClick={sortMode === 'nearby' ? () => setSortMode('default') : locateMe}
            disabled={locating}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
              sortMode === 'nearby'
                ? 'text-white shadow-lg shadow-blue-500/20'
                : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/60'
            }`}
            style={sortMode === 'nearby' ? { background: 'linear-gradient(135deg,#3b82f6,#06b6d4)' } : {}}>
            {locating
              ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              : <Navigation size={11} />}
            {t('restaurants.nearby')}
          </button>
          <button onClick={() => setSortMode(m => m === 'price_asc' ? 'default' : 'price_asc')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
              sortMode === 'price_asc'
                ? 'bg-white/15 text-white'
                : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/60'
            }`}>
            {t('restaurants.price_asc')}
          </button>
          <button onClick={() => setSortMode(m => m === 'price_desc' ? 'default' : 'price_desc')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
              sortMode === 'price_desc'
                ? 'bg-white/15 text-white'
                : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/60'
            }`}>
            {t('restaurants.price_desc')}
          </button>
        </div>
      </div>

      {/* Location error */}
      {locError && <p className="text-orange-400/70 text-xs">{t('common.location_error')}</p>}

      {/* Active filters */}
      {(search || typeFilter !== 'all' || cuisineFilter !== 'all' || sortMode !== 'default') && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-white/25 text-xs">{t('common.filters')}</span>
          {cuisineFilter !== 'all' && (
            <button onClick={() => setCuisineFilter('all')}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-300/80 hover:bg-purple-500/25 transition-colors">
              {CUISINE_CATEGORIES.find(c => c.id === cuisineFilter)?.emoji}{' '}
              {t((CUISINE_CATEGORIES.find(c => c.id === cuisineFilter)?.tKey ?? 'cuisine.all') as TranslationKey)}
              <X size={10} />
            </button>
          )}
          {typeFilter !== 'all' && (
            <button onClick={() => setTypeFilter('all')}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/8 text-white/50 hover:bg-white/12 transition-colors">
              {typeLabel(typeFilter)}
              <X size={10} />
            </button>
          )}
          {search && (
            <button onClick={() => setSearch('')}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/8 text-white/50 hover:bg-white/12 transition-colors">
              &ldquo;{search}&rdquo; <X size={10} />
            </button>
          )}
          <button onClick={() => { setSearch(''); setTypeFilter('all'); setCuisineFilter('all'); setSortMode('default') }}
            className="text-xs text-white/25 hover:text-white/50 transition-colors underline underline-offset-2">
            {t('common.clear_all')}
          </button>
        </div>
      )}

      {/* Count */}
      {!loading && !error && (
        <p className="text-white/20 text-xs font-bold">
          {filtered.length.toLocaleString()} {t('restaurants.places')}
          {!search && cuisineFilter === 'all' && typeFilter === 'all' && total > 0 && (
            <span className="text-white/12"> ({total.toLocaleString()} {t('restaurants.total_count')})</span>
          )}
        </p>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-white/30 text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin shrink-0" />
            <span>{t('restaurants.loading')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-white/3">
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-white/4 rounded animate-pulse w-4/5" />
                  <div className="h-3 bg-white/4 rounded animate-pulse w-1/2" />
                  <div className="h-3 bg-white/3 rounded animate-pulse w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="rounded-xl p-4 bg-red-950/30 border border-red-800/30 text-red-300 text-sm">{error}</div>}

      {/* Grid */}
      {!loading && visible.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(r => <RestaurantCard key={r.id} r={r} distance={distMap.get(r.id)} onShowOnMap={onShowOnMap} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button onClick={() => setShown(s => s + PAGE_SIZE)}
                className="flex items-center gap-2 text-sm font-bold px-8 py-3 rounded-xl border border-white/10 text-white/45 hover:text-white hover:border-white/20 bg-white/3 transition-all">
                <ChevronDown size={15} />
                {t('restaurants.load_more')} ({filtered.length - shown} {t('common.remaining')})
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center py-24 text-center gap-4">
          <span className="text-5xl">🍽</span>
          <div>
            <p className="text-white/50 font-bold">{t('common.no_results')}</p>
            <p className="text-white/25 text-sm mt-1">{t('common.try_search')}</p>
          </div>
          <button onClick={() => { setSearch(''); setTypeFilter('all'); setCuisineFilter('all') }}
            className="text-sm font-bold px-4 py-2 rounded-xl border border-purple-500/30 text-purple-400/70 hover:text-purple-300 hover:border-purple-500/50 transition-all">
            {t('common.clear_filters')}
          </button>
        </div>
      )}
    </main>
  )
}
