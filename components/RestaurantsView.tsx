'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { MapPin, Globe, Phone, Navigation, Star, Map as MapIcon, X } from 'lucide-react'
import type { Restaurant } from '@/lib/types'
import { FEATURED_PICKS } from '@/lib/restaurant-awards'
import { useLanguage } from '@/contexts/LanguageContext'

// ── Constants ─────────────────────────────────────────────

const PRICE_LABELS = ['', '€', '€€', '€€€', '€€€€']

type RestType = 'ruokapaikat' | 'kahvilat' | 'baarit' | 'yokerhot'

const TYPE_TABS: { id: RestType; label: string; emoji: string; dbType: Restaurant['type'] | null }[] = [
  { id: 'ruokapaikat', label: 'Ruokapaikat', emoji: '🍽', dbType: 'ravintola' },
  { id: 'kahvilat',    label: 'Kahvilat',    emoji: '☕', dbType: 'kahvila'   },
  { id: 'baarit',      label: 'Baarit',      emoji: '🍸', dbType: 'baari'     },
  { id: 'yokerhot',    label: 'Yökerhot',    emoji: '🌃', dbType: null        },
]

const SUB_CATS: Record<RestType, { id: string; label: string; emoji: string }[]> = {
  ruokapaikat: [
    { id: 'all', label: 'Kaikki', emoji: '' },
    { id: 'awarded', label: 'Palkitut', emoji: '🏆' },
    { id: 'nordisk', label: 'Pohjoismainen', emoji: '🇫🇮' },
    { id: 'japanese', label: 'Japanilainen', emoji: '🍣' },
    { id: 'pizza', label: 'Pizza', emoji: '🍕' },
    { id: 'italian', label: 'Italialainen', emoji: '🍝' },
    { id: 'asian', label: 'Aasialainen', emoji: '🍜' },
    { id: 'burger', label: 'Hampurilaiset', emoji: '🍔' },
    { id: 'veggie', label: 'Kasvis', emoji: '🌱' },
    { id: 'kebab', label: 'Kebab', emoji: '🌯' },
    { id: 'mediterranean', label: 'Välimeri', emoji: '🫒' },
    { id: 'indian', label: 'Intialainen', emoji: '🍛' },
    { id: 'seafood', label: 'Kala & meri', emoji: '🐟' },
    { id: 'steak', label: 'Pihvi & grilli', emoji: '🥩' },
    { id: 'mexican', label: 'Meksikolainen', emoji: '🌮' },
  ],
  kahvilat: [
    { id: 'all', label: 'Kaikki', emoji: '' },
    { id: 'klassikot', label: 'Klassikot', emoji: '🎩' },
    { id: 'ranskalaiset', label: 'Ranskalaiset', emoji: '🥖' },
    { id: 'boheemit', label: 'Boheemit', emoji: '📖' },
    { id: 'erikois', label: 'Erikoiskahvilat', emoji: '☕' },
    { id: 'paahtimo', label: 'Paahtimot', emoji: '🔥' },
    { id: 'brunssi', label: 'Brunssi', emoji: '🥐' },
  ],
  baarit: [
    { id: 'all', label: 'Kaikki', emoji: '' },
    { id: 'cocktail', label: 'Cocktail', emoji: '🍸' },
    { id: 'olut', label: 'Olutbaarit', emoji: '🍺' },
    { id: 'viini', label: 'Viinibaarit', emoji: '🍷' },
    { id: 'urheilu', label: 'Sporttibaarit', emoji: '🏟' },
  ],
  yokerhot: [
    { id: 'all', label: 'Kaikki', emoji: '' },
    { id: 'tekno', label: 'Tekno', emoji: '🎧' },
    { id: 'pop', label: 'Pop & hitit', emoji: '🪩' },
    { id: 'katto', label: 'Kattoklubit', emoji: '🌃' },
  ],
}

// Quick-sort pills shown below hero
const QUICK_SORTS = [
  { id: 'default', label: 'Kaikki' },
  { id: 'open',    label: '🟢 Avoinna nyt' },
  { id: 'nearby',  label: '📍 Lähimmät' },
]

type QuickSort = 'default' | 'open' | 'nearby'

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

function isOpenNow(hours: string): boolean | undefined {
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

function matchesSubCat(r: Restaurant, restType: RestType, sub: string): boolean {
  if (sub === 'all') return true
  const text = `${r.name} ${r.description}`.toLowerCase()
  if (restType === 'ruokapaikat') {
    if (sub === 'awarded') return !!r.featured
    return r.cuisineCategories.includes(sub)
  }
  if (restType === 'kahvilat') {
    if (sub === 'klassikot') return /klassikko|perintei|1\d{3}|vanha|café fa/.test(text)
    if (sub === 'ranskalaiset') return /ranskala|croque|baguette|patisserie|pâtisserie/.test(text)
    if (sub === 'boheemit') return /boheemi|kirjasto|kirja|luova|indie|alternative/.test(text)
    if (sub === 'erikois') return /specialty|specialt|single.origin|pour.over|v60|aeropress/.test(text)
    if (sub === 'paahtimo') return /paahtim|roastery|paahto/.test(text)
    if (sub === 'brunssi') return /brunssi|brunch/.test(text)
  }
  if (restType === 'baarit') {
    if (sub === 'cocktail') return /cocktail|drinkki|mixolog/.test(text) || r.cuisineCategories.includes('cocktail')
    if (sub === 'olut') return /olut|craft.beer|ipa|lager|ale|pint|taproom/.test(text) || r.cuisineCategories.includes('craft_beer')
    if (sub === 'viini') return /viini|wine|viinikellari|vinoteca/.test(text)
    if (sub === 'urheilu') return /sport|urheilu|hockey|futis|liiga/.test(text)
  }
  if (restType === 'yokerhot') {
    if (sub === 'tekno') return /tekno|techno|industrial|electronic/.test(text)
    if (sub === 'pop') return /pop|hits|karaoke|disco/.test(text)
    if (sub === 'katto') return /katto|roof|sky|terassi/.test(text)
  }
  return false
}

// ── Hero card ─────────────────────────────────────────────

function HeroCard({ r, distance, onShowOnMap }: {
  r: Restaurant
  distance?: number
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const open = r.openingHours ? isOpenNow(r.openingHours) : undefined
  const ctaLabel = r.type === 'ravintola' ? 'Varaa pöytä →' : r.type === 'kahvila' ? 'Lisätietoja →' : 'Avaa →'

  return (
    <div className="relative w-full rounded-[22px] overflow-hidden" style={{ aspectRatio: '16/9', boxShadow: '0 22px 50px -20px rgba(10,10,12,.8)' }}>
      {r.image ? (
        <img src={r.image} alt={r.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81,#1e3a8a)' }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.97) 0%,rgba(10,10,12,.2) 55%,transparent 100%)' }} />

      {/* Open badge */}
      {open !== undefined && (
        <div className="absolute top-4 right-4">
          <span className={`text-[11px] font-black px-3 py-1 rounded-full ${open ? 'bg-emerald-500 text-white' : 'bg-white/20 text-white/60'}`}>
            {open ? 'Avoinna' : 'Suljettu'}
          </span>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="text-[11px] font-black uppercase tracking-[.1em] mb-1" style={{ color: 'rgba(255,255,255,.5)' }}>
          {r.description?.toUpperCase() || r.type.toUpperCase()}{r.address ? ` · ${r.address.split(',')[0].toUpperCase()}` : ''}
        </p>
        <h2 className="font-black text-white text-2xl leading-tight mb-3" style={{ letterSpacing: '-0.02em' }}>{r.name}</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {r.www ? (
            <a href={/^https?:\/\//i.test(r.www) ? r.www : '#'} target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 rounded-full text-white text-[13px] font-black"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 10px 24px -8px rgba(91,101,230,.85)' }}>
              {ctaLabel}
            </a>
          ) : (
            <span className="px-4 py-2 rounded-full text-white text-[13px] font-black"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
              {ctaLabel}
            </span>
          )}
          <span className="text-white/50 text-[13px] font-bold">
            {r.priceRange ? PRICE_LABELS[r.priceRange] : ''}
            {distance !== undefined ? ` · ${fmtDist(distance)}` : ''}
          </span>
          {onShowOnMap && r.lat && r.lon && (
            <button onClick={() => onShowOnMap(r.lat!, r.lon!, r.name)}
              className="text-[12px] font-bold text-white/40 hover:text-white/70 transition-colors">
              🗺 Kartalla
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Restaurant row card (horizontal carousels) ────────────

function RestRowCard({ r, distance, onClick }: {
  r: Restaurant
  distance?: number
  onClick: (r: Restaurant) => void
}) {
  const open = r.openingHours ? isOpenNow(r.openingHours) : undefined
  return (
    <button onClick={() => onClick(r)}
      className="group shrink-0 w-44 text-left rounded-[18px] overflow-hidden"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4/3' }}>
        {r.image ? (
          <img src={r.image} alt={r.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl" style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)' }}>
            {r.type === 'kahvila' ? '☕' : r.type === 'baari' ? '🍸' : '🍽'}
          </div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.8) 0%,transparent 60%)' }} />
        {open !== undefined && (
          <div className="absolute top-2 right-2">
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${open ? 'bg-emerald-500 text-white' : 'bg-black/50 text-white/50'}`}>
              {open ? '● Auki' : '○ Suljettu'}
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-white font-black text-[13px] leading-tight line-clamp-1" style={{ letterSpacing: '-0.01em' }}>{r.name}</p>
        <p className="text-white/40 text-[11px] mt-0.5 truncate">{r.description || r.address}</p>
        {distance !== undefined && (
          <p className="text-[11px] mt-1 font-bold" style={{ color: '#a3abff' }}>{fmtDist(distance)}</p>
        )}
      </div>
    </button>
  )
}

// ── List card (vertical, for sub-category view) ───────────

function RestListCard({ r, distance, onShowOnMap }: {
  r: Restaurant
  distance?: number
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const open = r.openingHours ? isOpenNow(r.openingHours) : undefined
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.7)' }}>
      {r.image && (
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/7' }}>
          <img src={r.image} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.5) 0%,transparent 60%)' }} />
        </div>
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-black text-white text-sm leading-tight">{r.name}</h3>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {open !== undefined && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${open ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/10 text-red-400/60'}`}>
                {open ? '● Avoinna' : '○ Suljettu'}
              </span>
            )}
            {r.priceRange && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/6 text-white/45">
                {PRICE_LABELS[r.priceRange]}
              </span>
            )}
            {distance !== undefined && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-[#a3abff]" style={{ background: 'rgba(107,118,255,.12)' }}>
                {fmtDist(distance)}
              </span>
            )}
          </div>
        </div>
        {r.michelinStars && (
          <span className="inline-flex text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/15">
            {'⭐'.repeat(r.michelinStars)} Michelin
          </span>
        )}
        {r.bibGourmand && !r.michelinStars && (
          <span className="inline-flex text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/15">
            😊 Bib Gourmand
          </span>
        )}
        {r.description && <p className="text-white/40 text-xs">{r.description}</p>}
        {r.address && (
          <div className="flex items-center gap-1.5 text-white/30 text-xs">
            <MapPin size={10} className="shrink-0" />
            <span>{r.address}</span>
          </div>
        )}
        <div className="flex items-center gap-3 pt-0.5 flex-wrap">
          {r.www && (
            <a href={/^https?:\/\//i.test(r.www) ? r.www : '#'} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold hover:opacity-80 transition-opacity"
              style={{ color: '#a3abff' }}>
              <Globe size={10} /> Nettisivu
            </a>
          )}
          {r.phone && (
            <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-[10px] font-bold text-white/30 hover:text-white/60 transition-colors">
              <Phone size={10} /> {r.phone}
            </a>
          )}
          {onShowOnMap && r.lat && r.lon && (
            <button onClick={() => onShowOnMap(r.lat!, r.lon!, r.name)}
              className="flex items-center gap-1 text-[10px] font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
              <MapIcon size={10} /> Kartalla
            </button>
          )}
          {((r.lat && r.lon) || r.address) && (
            <a href={r.lat && r.lon
              ? `https://maps.google.com/maps?daddr=${r.lat},${r.lon}&travelmode=transit`
              : `https://maps.google.com/maps?daddr=${encodeURIComponent(r.address + ', Helsinki')}&travelmode=transit`}
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

// ── Horizontal row section ─────────────────────────────────

function RestRow({ title, items, distMap, onCardClick }: {
  title: string
  items: Restaurant[]
  distMap: Map<string, number>
  onCardClick: (r: Restaurant) => void
}) {
  if (items.length === 0) return null
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-white text-[17px] tracking-tight" style={{ letterSpacing: '-0.02em' }}>{title}</h2>
        <button className="text-[13px] font-bold" style={{ color: '#6b76ff' }}>Kaikki ›</button>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {items.slice(0, 10).map(r => (
          <RestRowCard key={r.id} r={r} distance={distMap.get(r.id)} onClick={onCardClick} />
        ))}
      </div>
    </section>
  )
}

// ── Tab bar (underline style) ─────────────────────────────

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

// ── Main view ─────────────────────────────────────────────

export default function RestaurantsView({ onShowOnMap }: {
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()

  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [restType, setRestType] = useState<RestType>('ruokapaikat')
  const [subCat, setSubCat] = useState<string>('all')
  const [quickSort, setQuickSort] = useState<QuickSort>('default')
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [selectedRest, setSelectedRest] = useState<Restaurant | null>(null)

  useEffect(() => {
    fetch('/api/restaurants')
      .then(r => r.json())
      .then(data => setRestaurants(data.restaurants ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Reset sub-category when type changes
  useEffect(() => { setSubCat('all') }, [restType])

  // Locate user for "Lähimmät"
  const locateMe = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => { setUserPos([pos.coords.latitude, pos.coords.longitude]); setQuickSort('nearby') },
      () => {},
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

  // Base pool: restaurants for current type tab
  const typePool = useMemo(() => {
    const tab = TYPE_TABS.find(t => t.id === restType)!
    if (restType === 'yokerhot') {
      return restaurants.filter(r => {
        const text = `${r.name} ${r.description}`.toLowerCase()
        return /yökerho|nightclub|klubi|disco|dj/.test(text) || r.type === 'baari'
      })
    }
    return tab.dbType ? restaurants.filter(r => r.type === tab.dbType) : restaurants
  }, [restaurants, restType])

  // Sub-category filtered pool
  const subPool = useMemo(() => {
    if (subCat === 'all') return typePool
    return typePool.filter(r => matchesSubCat(r, restType, subCat))
  }, [typePool, subCat, restType])

  // Apply quick sort
  const sortedPool = useMemo(() => {
    let result = [...subPool]
    if (quickSort === 'open') {
      result = result.filter(r => r.openingHours && isOpenNow(r.openingHours) === true)
    } else if (quickSort === 'nearby' && userPos) {
      result = result.sort((a, b) => (distMap.get(a.id) ?? Infinity) - (distMap.get(b.id) ?? Infinity))
    }
    return result
  }, [subPool, quickSort, userPos, distMap])

  // Hero: first open + image, else first with image, else first
  const heroRest = useMemo(() => {
    if (subCat !== 'all') return null
    return typePool.find(r => r.image && r.openingHours && isOpenNow(r.openingHours))
      ?? typePool.find(r => r.image)
      ?? typePool[0]
      ?? null
  }, [typePool, subCat])

  // Curated rows per type (homepage view)
  const rows = useMemo(() => {
    if (subCat !== 'all') return []
    const base = typePool

    if (restType === 'ruokapaikat') {
      const featured = FEATURED_PICKS.map(p => p.name.toLowerCase())
      return [
        { title: '🔥 Suosituimmat juuri nyt',      items: base.filter(r => r.featured || r.michelinStars).slice(0, 10) },
        { title: '🏆 Palkitut & Michelin',          items: base.filter(r => r.michelinStars || r.bibGourmand || r.featured) },
        { title: '🇫🇮 Suomalaiset ravintolat',     items: base.filter(r => r.cuisineCategories.includes('nordisk')) },
        { title: '🍣 Japanilainen',                  items: base.filter(r => r.cuisineCategories.includes('japanese')) },
        { title: '🌱 Kasvisravintolat',              items: base.filter(r => r.cuisineCategories.includes('veggie')) },
      ]
    }
    if (restType === 'kahvilat') {
      return [
        { title: '🎩 Arvostetut klassikot',          items: base.filter(r => matchesSubCat(r, 'kahvilat', 'klassikot')) },
        { title: '🥖 Ranskalaistunnelmaa',            items: base.filter(r => matchesSubCat(r, 'kahvilat', 'ranskalaiset')) },
        { title: '📖 Boheemi & rauhallinen',          items: base.filter(r => matchesSubCat(r, 'kahvilat', 'boheemit')) },
        { title: '🔥 Paahtimot',                     items: base.filter(r => matchesSubCat(r, 'kahvilat', 'paahtimo')) },
        { title: '🥐 Brunssi',                       items: base.filter(r => matchesSubCat(r, 'kahvilat', 'brunssi')) },
      ]
    }
    if (restType === 'baarit') {
      return [
        { title: '🍸 Tyylikkäät cocktailbaarit',     items: base.filter(r => matchesSubCat(r, 'baarit', 'cocktail')) },
        { title: '🍺 Laadukkaat olutravintolat',      items: base.filter(r => matchesSubCat(r, 'baarit', 'olut')) },
        { title: '🍷 Viinibaarit',                   items: base.filter(r => matchesSubCat(r, 'baarit', 'viini')) },
        { title: '🏟 Sporttibaarit',                  items: base.filter(r => matchesSubCat(r, 'baarit', 'urheilu')) },
      ]
    }
    if (restType === 'yokerhot') {
      return [
        { title: '🎧 Tekno & elektroninen',           items: base.filter(r => matchesSubCat(r, 'yokerhot', 'tekno')) },
        { title: '🪩 Pop & hitit',                   items: base.filter(r => matchesSubCat(r, 'yokerhot', 'pop')) },
        { title: '🌃 Kattoklubit & terassit',         items: base.filter(r => matchesSubCat(r, 'yokerhot', 'katto')) },
      ]
    }
    return []
  }, [typePool, restType, subCat])

  const isHomepageView = subCat === 'all' && quickSort === 'default'

  return (
    <main className="max-w-6xl mx-auto px-4 pt-4 pb-24 space-y-4">

      {/* ── Heading ── */}
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">HELSINKI</p>
        <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.8rem,6vw,3rem)', letterSpacing: '-0.03em' }}>
          Ravintolat
        </h1>
      </div>

      {/* ── Type tabs (primary) ── */}
      <UnderlineTabs
        tabs={TYPE_TABS.map(t => ({ id: t.id, label: t.label, emoji: t.emoji }))}
        active={restType}
        onChange={(id) => setRestType(id)}
      />

      {/* ── Sub-category tabs (secondary) ── */}
      <UnderlineTabs
        tabs={SUB_CATS[restType]}
        active={subCat}
        onChange={(id) => { setSubCat(id); setQuickSort('default') }}
      />

      {/* ── Loading ── */}
      {loading && (
        <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shrink-0 w-44 rounded-[18px] overflow-hidden bg-white/4 animate-pulse" style={{ aspectRatio: '4/3' }} />
          ))}
        </div>
      )}

      {/* ── Homepage view (Kaikki + default sort) ── */}
      {!loading && isHomepageView && (
        <>
          {/* Hero */}
          {heroRest && (
            <HeroCard r={heroRest} distance={distMap.get(heroRest.id)} onShowOnMap={onShowOnMap} />
          )}

          {/* Quick sort pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
            {QUICK_SORTS.map(s => {
              const isActive = quickSort === s.id
              return (
                <button key={s.id}
                  onClick={() => { if (s.id === 'nearby') { locateMe() } else { setQuickSort(s.id as QuickSort) } }}
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
            <RestRow key={row.title} title={row.title} items={row.items} distMap={distMap} onCardClick={setSelectedRest} />
          ))}
        </>
      )}

      {/* ── List view (specific sub-cat or quick sort active) ── */}
      {!loading && !isHomepageView && (
        <>
          {/* Quick sort pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
            {QUICK_SORTS.map(s => {
              const isActive = quickSort === s.id
              return (
                <button key={s.id}
                  onClick={() => { if (s.id === 'nearby') { locateMe() } else { setQuickSort(s.id as QuickSort) } }}
                  className="shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all"
                  style={isActive
                    ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', color: '#fff' }
                    : { background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)' }
                  }>
                  {s.label}
                </button>
              )
            })}
            {(subCat !== 'all' || quickSort !== 'default') && (
              <button onClick={() => { setSubCat('all'); setQuickSort('default') }}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-full text-sm font-bold text-white/30"
                style={{ background: 'rgba(255,255,255,.04)' }}>
                <X size={12} /> Tyhjennä
              </button>
            )}
          </div>

          <p className="text-white/20 text-xs font-bold">{sortedPool.length} paikkaa</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedPool.slice(0, 48).map(r => (
              <RestListCard key={r.id} r={r} distance={distMap.get(r.id)} onShowOnMap={onShowOnMap} />
            ))}
          </div>

          {sortedPool.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center gap-3">
              <span className="text-5xl">🍽</span>
              <p className="text-white/40 font-bold">Ei tuloksia tällä suodatuksella</p>
              <button onClick={() => { setSubCat('all'); setQuickSort('default') }}
                className="text-sm font-bold px-4 py-2 rounded-xl border text-[#6b76ff]"
                style={{ borderColor: 'rgba(107,118,255,.3)' }}>
                Näytä kaikki
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Detail panel for restaurant (simple) ── */}
      {selectedRest && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSelectedRest(null)}>
          <div className="w-full max-w-2xl mx-auto rounded-t-[28px] overflow-hidden animate-sheet-up"
            style={{ background: '#0f0f13', border: '1px solid rgba(255,255,255,.1)' }}
            onClick={e => e.stopPropagation()}>
            {selectedRest.image && (
              <div className="relative w-full" style={{ aspectRatio: '16/7' }}>
                <img src={selectedRest.image} alt={selectedRest.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(15,15,19,.9) 0%,transparent 60%)' }} />
              </div>
            )}
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <h2 className="font-black text-white text-xl leading-tight">{selectedRest.name}</h2>
                <button onClick={() => setSelectedRest(null)} className="p-2 rounded-full text-white/40 hover:text-white"
                  style={{ background: 'rgba(255,255,255,.08)' }}>
                  <X size={16} />
                </button>
              </div>
              {selectedRest.description && <p className="text-white/50 text-sm">{selectedRest.description}</p>}
              {selectedRest.address && (
                <div className="flex items-center gap-2 text-white/30 text-sm">
                  <MapPin size={13} /> {selectedRest.address}
                </div>
              )}
              <div className="flex gap-3 pt-1 flex-wrap">
                {selectedRest.www && (
                  <a href={/^https?:\/\//i.test(selectedRest.www) ? selectedRest.www : '#'} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-black"
                    style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                    <Globe size={13} /> Nettisivu
                  </a>
                )}
                {onShowOnMap && selectedRest.lat && selectedRest.lon && (
                  <button onClick={() => { onShowOnMap(selectedRest.lat!, selectedRest.lon!, selectedRest.name); setSelectedRest(null) }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white/70 text-sm font-bold"
                    style={{ background: 'rgba(255,255,255,.08)' }}>
                    <MapIcon size={13} /> Kartalla
                  </button>
                )}
                {((selectedRest.lat && selectedRest.lon) || selectedRest.address) && (
                  <a href={selectedRest.lat && selectedRest.lon
                    ? `https://maps.google.com/maps?daddr=${selectedRest.lat},${selectedRest.lon}&travelmode=transit`
                    : `https://maps.google.com/maps?daddr=${encodeURIComponent(selectedRest.address + ', Helsinki')}&travelmode=transit`}
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
