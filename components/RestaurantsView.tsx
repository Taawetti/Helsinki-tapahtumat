'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { MapPin, Globe, Phone, Navigation, Map as MapIcon, X, Clock } from 'lucide-react'
import type { Restaurant } from '@/lib/types'
import type { NewsItem } from '@/app/api/restaurant-news/route'
import { useLanguage } from '@/contexts/LanguageContext'
import { isOpenNow, getTodayHours, helsinkiNow } from '@/lib/opening-hours'

// ── Chain grouping types ──────────────────────────────────

interface ChainGroup {
  _isChain: true
  key: string
  displayName: string
  representative: Restaurant
  locations: Restaurant[]
}

type RestItem = Restaurant | ChainGroup

// ── Constants ─────────────────────────────────────────────

const PRICE_LABELS = ['', '€', '€€', '€€€', '€€€€']

type RestType = 'ruokapaikat' | 'kahvilat' | 'baarit' | 'yokerhot'

const TYPE_TABS: { id: RestType; label: string; emoji: string; dbType: Restaurant['type'] | null }[] = [
  { id: 'ruokapaikat', label: 'Ruokapaikat', emoji: '🍽', dbType: 'ravintola' },
  { id: 'kahvilat',    label: 'Kahvilat',    emoji: '☕', dbType: 'kahvila'   },
  { id: 'baarit',      label: 'Baarit',      emoji: '🍸', dbType: 'baari'     },
  { id: 'yokerhot',    label: 'Yökerhot',    emoji: '🌃', dbType: 'yokerho'   },
]

const SUB_CATS: Record<RestType, { id: string; label: string; emoji: string }[]> = {
  ruokapaikat: [
    { id: 'awarded',  label: 'Palkitut',      emoji: '🏆' },
    { id: 'japanese', label: 'Japanilainen',  emoji: '🍣' },
    { id: 'nordisk',  label: 'Pohjoismainen', emoji: '🇫🇮' },
    { id: 'italian',  label: 'Italialainen',  emoji: '🍝' },
    { id: 'pizza',    label: 'Pizza',         emoji: '🍕' },
    { id: 'asian',    label: 'Aasialainen',   emoji: '🍜' },
    { id: 'veggie',   label: 'Kasvis',        emoji: '🌱' },
    { id: 'burger',   label: 'Hampurilaiset', emoji: '🍔' },
    { id: 'seafood',  label: 'Kala & meri',   emoji: '🐟' },
    { id: 'steak',    label: 'Pihvi & grilli',emoji: '🥩' },
    { id: 'indian',         label: 'Intialainen',   emoji: '🍛' },
    { id: 'mexican',        label: 'Meksikolainen', emoji: '🌮' },
    { id: 'middle_eastern', label: 'Lähi-itä',      emoji: '🧆' },
    { id: 'african',        label: 'Afrikkalainen',  emoji: '🌍' },
  ],
  kahvilat: [
    { id: 'klassikot',    label: 'Klassikot',       emoji: '🎩' },
    { id: 'ranskalaiset', label: 'Ranskalaiset',    emoji: '🥖' },
    { id: 'boheemit',     label: 'Boheemit',        emoji: '📖' },
    { id: 'erikois',      label: 'Erikoiskahvilat', emoji: '☕' },
    { id: 'paahtimo',     label: 'Paahtimot',       emoji: '🔥' },
    { id: 'brunssi',      label: 'Brunssi',         emoji: '🥐' },
  ],
  baarit: [
    { id: 'cocktail', label: 'Cocktail',      emoji: '🍸' },
    { id: 'olut',     label: 'Olutbaarit',    emoji: '🍺' },
    { id: 'viini',    label: 'Viinibaarit',   emoji: '🍷' },
    { id: 'urheilu',  label: 'Sporttibaarit', emoji: '🏟' },
  ],
  yokerhot: [
    { id: 'klubi',   label: 'Clubit',      emoji: '🎉' },
    { id: 'karaoke', label: 'Karaoke',     emoji: '🎤' },
    { id: 'tekno',   label: 'Tekno',       emoji: '🎧' },
    { id: 'katto',   label: 'Kattoklubit', emoji: '🌃' },
  ],
}

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

function normalizeChainName(name: string): string {
  let n = name.toLowerCase().trim()
  n = n.replace(/^(ravintola|café|cafe|bistro|restaurant|bar|pub|kahvila|pizzeria)\s+/i, '')
  n = n.replace(/\s+(ravintola|café|cafe|bistro|restaurant|bar|pub|kahvila|pizzeria)$/i, '')
  return n.replace(/\s+/g, ' ').trim()
}

function groupByChain(items: Restaurant[], distMap: Map<string, number>): RestItem[] {
  const groups = new Map<string, Restaurant[]>()
  for (const r of items) {
    const key = normalizeChainName(r.name)
    const existing = groups.get(key)
    if (existing) existing.push(r)
    else groups.set(key, [r])
  }

  const originalOrder = new Map(items.map((r, i) => [r.id, i]))
  const result: RestItem[] = []

  for (const [key, members] of groups) {
    if (members.length < 2) {
      result.push(members[0])
    } else {
      const sorted = [...members].sort((a, b) => {
        const da = distMap.get(a.id) ?? Infinity
        const db = distMap.get(b.id) ?? Infinity
        if (da !== db && da !== Infinity && db !== Infinity) return da - db
        const scoreA = (a.image ? 2 : 0) + (a.openingHours ? 1 : 0)
        const scoreB = (b.image ? 2 : 0) + (b.openingHours ? 1 : 0)
        return scoreB - scoreA
      })
      result.push({
        _isChain: true,
        key,
        displayName: sorted[0].name,
        representative: sorted[0],
        locations: sorted,
      })
    }
  }

  result.sort((a, b) => {
    const aId = '_isChain' in a ? a.representative.id : a.id
    const bId = '_isChain' in b ? b.representative.id : b.id
    return (originalOrder.get(aId) ?? 0) - (originalOrder.get(bId) ?? 0)
  })

  return result
}

// ── Cuisine Twemoji (B2 style: dark bg + radial glow + illustrated emoji) ─────

const CUISINE_STYLE: Record<string, { cp: string; color: string }> = {
  pizza:         { cp: '1f355', color: '#c0392b' },
  japanese:      { cp: '1f363', color: '#1a4a7a' },
  burger:        { cp: '1f354', color: '#c97d10' },
  italian:       { cp: '1f35d', color: '#1d6a39' },
  nordisk:       { cp: '1f41f', color: '#1a4f7a' },
  asian:         { cp: '1f962', color: '#6c3483' },
  indian:        { cp: '1fad5', color: '#d35400' },
  kebab:         { cp: '1f959', color: '#7a4419' },
  mexican:       { cp: '1f32e', color: '#1e8449' },
  mediterranean: { cp: '1fad2', color: '#1a6b8a' },
  veggie:        { cp: '1f966', color: '#239b56' },
  french:        { cp: '1f950', color: '#9a7d0a' },
  seafood:        { cp: '1f99e', color: '#1a5f7a' },
  steak:          { cp: '1f969', color: '#922b21' },
  middle_eastern: { cp: '1f9c6', color: '#a07830' },
  african:        { cp: '1f30d', color: '#8b4a2a' },
}

const TYPE_FALLBACK: Record<string, { cp: string; color: string }> = {
  kahvila:   { cp: '2615',  color: '#6f4e37' },
  baari:     { cp: '1f378', color: '#4a1942' },
  pikaruoka: { cp: '1f354', color: '#c97d10' },
}

const DEFAULT_CUISINE_STYLE = { cp: '1f374', color: '#2a2a30' }

function getCuisineStyle(r: Restaurant): { cp: string; color: string } {
  for (const cat of r.cuisineCategories ?? []) {
    if (CUISINE_STYLE[cat]) return CUISINE_STYLE[cat]
  }
  return TYPE_FALLBACK[r.type] ?? DEFAULT_CUISINE_STYLE
}

function twemojiUrl(cp: string): string {
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@v14.0.2/assets/svg/${cp}.svg`
}

function relativeDate(pubDate: string): string {
  try {
    const diffH = Math.floor((Date.now() - new Date(pubDate).getTime()) / 3_600_000)
    if (diffH < 1)  return 'juuri nyt'
    if (diffH < 24) return `${diffH} t sitten`
    const d = Math.floor(diffH / 24)
    if (d === 1)  return 'eilen'
    if (d < 7)   return `${d} pv sitten`
    return `${Math.floor(d / 7)} vk sitten`
  } catch { return '' }
}

function NewsSection({ items }: { items: NewsItem[] }) {
  if (!items.length) return null
  return (
    <div className="space-y-3">
      {/* Header — same style as RestRow */}
      <div className="flex items-baseline gap-2">
        <h2 className="font-black text-white text-[17px] leading-none" style={{ letterSpacing: '-0.02em' }}>
          📰 Tuoreita artikkeleita valinnan tueksi
        </h2>
        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,.3)' }}>· {items.length}</span>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {items.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 w-[230px] rounded-2xl p-4 flex flex-col gap-2.5 transition-all active:scale-[.97]"
            style={{
              background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.1)',
              borderTop: '2px solid rgba(107,118,255,.5)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wide truncate" style={{ color: 'rgba(163,171,255,.8)' }}>
                {item.source || 'Uutinen'}
              </span>
              <span className="text-[10px] shrink-0" style={{ color: 'rgba(255,255,255,.25)' }}>
                {relativeDate(item.pubDate)}
              </span>
            </div>
            <p className="text-[13px] font-semibold leading-snug line-clamp-4" style={{ color: 'rgba(255,255,255,.9)' }}>
              {item.title}
            </p>
            <span className="text-[11px] font-black mt-auto" style={{ color: 'rgba(163,171,255,.9)' }}>Lue lisää ↗</span>
          </a>
        ))}
      </div>
    </div>
  )
}

function isLunchTime(): boolean {
  const h = helsinkiNow().getHours()
  return h >= 10 && h < 15
}

function isDinnerTime(): boolean {
  const h = helsinkiNow().getHours()
  return h >= 17 && h <= 22
}

function isLateNight(hours: string): boolean {
  if (!hours) return false
  if (hours === '24/7') return true
  for (const part of hours.split(';')) {
    const m = part.trim().match(/^[\w,\-]+\s+\d{1,2}:\d{2}-(\d{1,2}):\d{2}$/)
    if (m) {
      const h = parseInt(m[1])
      if (h < 6) return true
    }
  }
  return false
}

function formatOpeningHoursHuman(raw: string): string {
  if (!raw) return ''
  if (raw === '24/7') return 'Auki 24/7'
  const FI: Record<string, string> = { Mo: 'Ma', Tu: 'Ti', We: 'Ke', Th: 'To', Fr: 'Pe', Sa: 'La', Su: 'Su' }
  return raw
    .split(';')
    .map(p => {
      let s = p.trim().replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, k => FI[k] ?? k)
      s = s.replace(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g, '$1–$2')
      return s
    })
    .join(', ')
}

function reservationUrl(r: Restaurant): string {
  const www = r.www ?? ''
  if (/thefork|tableonline|opentable|quandoo|resy\.com/i.test(www)) {
    return /^https?:\/\//i.test(www) ? www : 'https://' + www
  }
  if (r.type === 'ravintola') {
    return `https://www.thefork.fi/haku/?searchText=${encodeURIComponent(r.name)}`
  }
  return ''
}

// Sub-category IDs differ between UI and Supabase for some baarit keys
const SUB_TO_DB: Record<string, string> = {
  olut: 'craft_beer',
  viini: 'wine',
  urheilu: 'sports',
}

// Name-based overrides that are always definitive regardless of subCategories
const NAME_OVERRIDES: Record<string, RegExp> = {
  karaoke: /karaoke/i,
  tekno:   /tekno|techno/i,
  klubi:   /klubi|nightclub/i,
}

function matchesSubCat(r: Restaurant, restType: RestType, sub: string): boolean {
  if (sub === 'all') return true

  // ruokapaikat uses cuisine categories — no change needed
  if (restType === 'ruokapaikat') {
    if (sub === 'awarded') return !!r.featured
    return r.cuisineCategories.includes(sub)
  }

  const name = r.name.toLowerCase()

  // Name-based overrides always win — "Karaoke Bar X" is always karaoke
  if (NAME_OVERRIDES[sub]?.test(name)) return true

  // Supabase sub_categories is authoritative when present
  const dbKey = SUB_TO_DB[sub] ?? sub
  if (r.subCategories && r.subCategories.length > 0) {
    return r.subCategories.includes(dbKey)
  }

  // Fallback text matching for venues not yet enriched
  const text = `${name} ${r.description}`.toLowerCase()
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
    if (sub === 'katto') return /katto|roof|sky/.test(text)
  }
  return false
}

// ── Hero card ─────────────────────────────────────────────

function HeroCard({ r, distance, onShowOnMap }: {
  r: Restaurant
  distance?: number
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()
  const open = r.openingHours ? isOpenNow(r.openingHours) : undefined
  const ctaLabel = r.type === 'ravintola' ? `${t('common.website')} →` : r.type === 'kahvila' ? `${t('common.more_info')} →` : `${t('common.more_info')} →`
  const heroStyle = getCuisineStyle(r)

  return (
    <div className="relative w-full rounded-[22px] overflow-hidden" style={{ aspectRatio: '16/9', boxShadow: '0 22px 50px -20px rgba(10,10,12,.8)' }}>
      {r.image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.image} alt={r.name} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.97) 0%,rgba(10,10,12,.4) 50%,rgba(0,0,0,.15) 100%)' }} />
        </>
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: '#0f0f14' }} />
          <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 38%, ${heroStyle.color}40 0%, transparent 62%)` }} />
          <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '70px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={twemojiUrl(heroStyle.cp)} alt="" width={88} height={88} style={{ objectFit: 'contain', filter: 'drop-shadow(0 4px 24px rgba(0,0,0,.7))' }} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: heroStyle.color, opacity: 0.5 }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.97) 0%,rgba(10,10,12,.1) 50%,transparent 100%)' }} />
        </>
      )}

      {open !== undefined && (
        <div className="absolute top-4 right-4">
          <span className={`text-[11px] font-black px-3 py-1 rounded-full ${open ? 'bg-emerald-500 text-white' : 'bg-white/20 text-white/60'}`}>
            {open ? t('common.open') : t('common.closed')}
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
            <a href={/^https?:\/\//i.test(r.www) ? r.www : 'https://' + r.www} target="_blank" rel="noopener noreferrer"
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
              🗺 {t('idea.on_map')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Carousel row card ────────────────────────────────────

function RestRowCard({ r, distance, onClick }: {
  r: Restaurant
  distance?: number
  onClick: (r: Restaurant) => void
}) {
  const { t } = useLanguage()
  const open = r.openingHours ? isOpenNow(r.openingHours) : undefined
  const cuisineStyle = getCuisineStyle(r)
  return (
    <button onClick={() => onClick(r)}
      className="group shrink-0 w-44 text-left rounded-[18px] overflow-hidden"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4/3' }}>
        {r.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image} alt={r.name} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,.55) 0%,transparent 60%)' }} />
          </>
        ) : (
          <>
            {/* B2: dark bg + cuisine-colored radial glow + Twemoji illustrated emoji */}
            <div className="absolute inset-0" style={{ background: '#141418' }} />
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 55%, ${cuisineStyle.color}30 0%, transparent 68%)` }} />
            <div className="absolute inset-0 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={twemojiUrl(cuisineStyle.cp)} alt="" width={50} height={50} style={{ objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.5))' }} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: cuisineStyle.color, opacity: 0.6 }} />
          </>
        )}
        {open !== undefined && (
          <div className="absolute top-2 right-2">
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${open ? 'bg-emerald-500 text-white' : 'bg-black/50 text-white/50'}`}>
              {open ? `● ${t('common.open')}` : `○ ${t('common.closed')}`}
            </span>
          </div>
        )}
        {(r.michelinStars || r.bibGourmand || r.michelinRecommended) && (
          <div className="absolute top-2 left-2">
            {r.michelinStars ? (
              <span className="text-[11px] font-black px-2 py-1 rounded-full text-white leading-none" style={{ background: 'rgba(185,28,28,.95)', boxShadow: '0 2px 8px rgba(0,0,0,.5)' }}>
                {'⭐'.repeat(r.michelinStars)} Michelin
              </span>
            ) : r.bibGourmand ? (
              <span className="text-[11px] font-black px-2 py-1 rounded-full text-white leading-none" style={{ background: 'rgba(194,65,12,.95)', boxShadow: '0 2px 8px rgba(0,0,0,.5)' }}>
                😊 Bib Gourmand
              </span>
            ) : (
              <span className="text-[11px] font-black px-2 py-1 rounded-full text-white leading-none" style={{ background: 'rgba(30,30,30,.92)', boxShadow: '0 2px 8px rgba(0,0,0,.5)' }}>
                🍽 Michelin
              </span>
            )}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-white font-black text-[13px] leading-tight line-clamp-1" style={{ letterSpacing: '-0.01em' }}>{r.name}</p>
        <p className="text-white/40 text-[11px] mt-0.5 truncate">{r.description || r.address}</p>
        <div className="flex items-center gap-2 mt-1">
          {r.googleRating && (
            <span className="text-[11px] font-black" style={{ color: '#fbbf24' }}>
              ⭐ {r.googleRating.toFixed(1)}
              {r.reviewCount ? <span className="font-normal opacity-60"> ({r.reviewCount > 999 ? `${(r.reviewCount/1000).toFixed(1)}t` : r.reviewCount})</span> : null}
            </span>
          )}
          {distance !== undefined && (
            <span className="text-[11px] font-bold" style={{ color: '#a3abff' }}>{fmtDist(distance)}</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Chain carousel card ──────────────────────────────────

function ChainRowCard({ chain, distMap, onClick }: {
  chain: ChainGroup
  distMap: Map<string, number>
  onClick: (chain: ChainGroup) => void
}) {
  const r = chain.representative
  const cuisineStyle = getCuisineStyle(r)
  return (
    <button onClick={() => onClick(chain)}
      className="group shrink-0 w-44 text-left rounded-[18px] overflow-hidden"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4/3' }}>
        {r.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image} alt={r.name} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,.55) 0%,transparent 60%)' }} />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: '#141418' }} />
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 55%, ${cuisineStyle.color}30 0%, transparent 68%)` }} />
            <div className="absolute inset-0 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={twemojiUrl(cuisineStyle.cp)} alt="" width={50} height={50} style={{ objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.5))' }} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: cuisineStyle.color, opacity: 0.6 }} />
          </>
        )}
        <div className="absolute top-2 right-2">
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
            style={{ background: 'rgba(107,118,255,.88)', boxShadow: '0 2px 6px rgba(0,0,0,.4)' }}>
            📍 {chain.locations.length}
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-white font-black text-[13px] leading-tight line-clamp-1" style={{ letterSpacing: '-0.01em' }}>{r.name}</p>
        <p className="text-[11px] mt-0.5 font-bold" style={{ color: '#a3abff' }}>{chain.locations.length} sijaintia</p>
      </div>
    </button>
  )
}

// ── List card ─────────────────────────────────────────────

function RestListCard({ r, distance, onShowOnMap }: {
  r: Restaurant
  distance?: number
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()
  const open = r.openingHours ? isOpenNow(r.openingHours) : undefined
  const cuisineStyle = getCuisineStyle(r)
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.7)' }}>
      {/* Mini-header: real photo if available, else B2 emoji */}
      <div className="relative flex items-center justify-center overflow-hidden" style={{ aspectRatio: '16/10', background: '#141418' }}>
        {r.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image} alt={r.name} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,.4) 0%,transparent 60%)' }} />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 60%, ${cuisineStyle.color}28 0%, transparent 70%)` }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={twemojiUrl(cuisineStyle.cp)} alt="" width={58} height={58} style={{ objectFit: 'contain', position: 'relative', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))' }} />
            <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: cuisineStyle.color, opacity: 0.5 }} />
          </>
        )}
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-black text-white text-sm leading-tight">{r.name}</h3>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {open !== undefined && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${open ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/10 text-red-400/60'}`}>
                {open ? `● ${t('common.open')}` : `○ ${t('common.closed')}`}
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
        {r.googleRating && (
          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,.12)', color: '#fbbf24' }}>
            ⭐ {r.googleRating.toFixed(1)}
            {r.reviewCount ? <span className="font-normal opacity-70">({r.reviewCount > 999 ? `${(r.reviewCount/1000).toFixed(1)}t` : r.reviewCount})</span> : null}
          </span>
        )}
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
        {r.openingHours && (() => {
          const today = getTodayHours(r.openingHours)
          const open = isOpenNow(r.openingHours)
          return (
            <div className="flex items-center gap-1.5 text-white/25 text-xs">
              <Clock size={10} className="shrink-0" />
              <span className="truncate">
                {today
                  ? <><span className={open ? 'text-emerald-400/70' : ''}>Tänään {today}</span></>
                  : formatOpeningHoursHuman(r.openingHours)}
              </span>
            </div>
          )
        })()}
        <div className="flex items-center gap-3 pt-0.5 flex-wrap">
          {r.www && (
            <a href={/^https?:\/\//i.test(r.www) ? r.www : 'https://' + r.www} target="_blank" rel="noopener noreferrer"
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

// ── Chain list card (filter view) ────────────────────────

function ChainListCard({ chain, onClick }: {
  chain: ChainGroup
  onClick: (chain: ChainGroup) => void
}) {
  const r = chain.representative
  const cuisineStyle = getCuisineStyle(r)
  return (
    <button onClick={() => onClick(chain)} className="rounded-2xl overflow-hidden text-left w-full transition-all active:scale-[.98]"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.7)' }}>
      <div className="relative flex items-center justify-center overflow-hidden" style={{ aspectRatio: '16/10', background: '#141418' }}>
        {r.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image} alt={r.name} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,.4) 0%,transparent 60%)' }} />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 60%, ${cuisineStyle.color}28 0%, transparent 70%)` }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={twemojiUrl(cuisineStyle.cp)} alt="" width={58} height={58} style={{ objectFit: 'contain', position: 'relative', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))' }} />
            <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: cuisineStyle.color, opacity: 0.5 }} />
          </>
        )}
        <div className="absolute top-2 right-2">
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
            style={{ background: 'rgba(107,118,255,.88)' }}>
            📍 {chain.locations.length}
          </span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-black text-white text-sm leading-tight">{r.name}</h3>
        <p className="text-[11px] font-bold mt-0.5" style={{ color: '#a3abff' }}>{chain.locations.length} sijaintia · näytä kaikki</p>
      </div>
    </button>
  )
}

// ── Chain detail sheet ────────────────────────────────────

function ChainDetailSheet({ chain, distMap, onClose, onShowOnMap }: {
  chain: ChainGroup
  distMap: Map<string, number>
  onClose: () => void
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-2xl mx-auto rounded-t-[28px] overflow-hidden animate-sheet-up flex flex-col"
        style={{ background: '#0f0f13', border: '1px solid rgba(255,255,255,.1)', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 flex items-start justify-between shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
          <div>
            <h2 className="font-black text-white text-xl leading-tight">{chain.displayName}</h2>
            <p className="text-[13px] mt-1 font-bold" style={{ color: '#a3abff' }}>📍 {chain.locations.length} sijaintia Helsingissä</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-white/40 hover:text-white shrink-0 ml-2"
            style={{ background: 'rgba(255,255,255,.08)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Locations list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {chain.locations.map((r, i) => {
            const open = r.openingHours ? isOpenNow(r.openingHours) : undefined
            const todayH = r.openingHours ? getTodayHours(r.openingHours) : null
            const dist = distMap.get(r.id)
            return (
              <div key={r.id} className="rounded-2xl p-4 space-y-2"
                style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-[11px] font-black text-white/20 pt-0.5 shrink-0">{i + 1}</span>
                    <span className="text-sm font-bold text-white/85 leading-snug">{r.address || r.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {open !== undefined && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${open ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/10 text-red-400/60'}`}>
                        {open ? `● ${t('common.open')}` : `○ ${t('common.closed')}`}
                      </span>
                    )}
                    {dist !== undefined && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-[#a3abff]"
                        style={{ background: 'rgba(107,118,255,.12)' }}>
                        {fmtDist(dist)}
                      </span>
                    )}
                  </div>
                </div>
                {todayH && (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: open ? '#6ee7b7' : 'rgba(255,255,255,.25)' }}>
                    <Clock size={10} className="shrink-0" />
                    <span>Tänään {todayH}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 pt-0.5 flex-wrap">
                  {onShowOnMap && r.lat && r.lon && (
                    <button onClick={() => { onShowOnMap(r.lat!, r.lon!, r.name); onClose() }}
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
                  {r.googleRating && (
                    <span className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>
                      ⭐ {r.googleRating.toFixed(1)}
                    </span>
                  )}
                  {r.www && (
                    <a href={/^https?:\/\//i.test(r.www) ? r.www : 'https://' + r.www} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] font-bold hover:opacity-80 transition-opacity"
                      style={{ color: '#a3abff' }}>
                      <Globe size={10} /> Nettisivu
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Carousel row — expand in place ────────────────────────

function RestRow({ title, items, distMap, onCardClick, onChainClick, onShowOnMap }: {
  title: string
  items: Restaurant[]
  distMap: Map<string, number>
  onCardClick: (r: Restaurant) => void
  onChainClick: (chain: ChainGroup) => void
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  const grouped = useMemo(() => groupByChain(items, distMap), [items, distMap])
  if (grouped.length === 0) return null
  const hasMore = grouped.length > 10
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-white text-[17px] flex items-baseline gap-1.5" style={{ letterSpacing: '-0.02em' }}>
          {title}
          <span className="text-white/25 font-bold text-[13px]">· {items.length}</span>
        </h2>
        {hasMore && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-[12px] font-black shrink-0 transition-colors" style={{ color: '#a3abff' }}>
            {t('discover.see_all')} {grouped.length} →
          </button>
        )}
        {expanded && (
          <button onClick={() => setExpanded(false)} className="text-[12px] font-black text-white/30 hover:text-white/60 shrink-0 transition-colors">
            {t('discover.see_fewer')}
          </button>
        )}
      </div>
      {!expanded ? (
        <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
          {grouped.slice(0, 10).map(item =>
            '_isChain' in item
              ? <ChainRowCard key={item.key} chain={item} distMap={distMap} onClick={onChainClick} />
              : <RestRowCard key={item.id} r={item} distance={distMap.get(item.id)} onClick={onCardClick} />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {grouped.map(item =>
            '_isChain' in item
              ? <ChainListCard key={item.key} chain={item} onClick={onChainClick} />
              : <RestListCard key={item.id} r={item} distance={distMap.get(item.id)} onShowOnMap={onShowOnMap} />
          )}
        </div>
      )}
    </section>
  )
}

// ── "Selaa kategorioittain" — 3-sarakkeinen fiilisruudukko (design 3-ravintolat.png) ──

// tint-hehkut per kategoria — sävyt vaihtelevat tarkoituksella
const GRID_TINTS: Record<string, string> = {
  awarded: '232,192,106', nordisk: '95,150,255', japanese: '95,217,166', pizza: '255,107,107',
  italian: '175,130,255', asian: '95,217,166', burger: '232,192,106', veggie: '95,217,166',
  seafood: '95,150,255', steak: '255,107,107', indian: '232,150,106', mexican: '232,192,106',
  middle_eastern: '175,130,255', african: '232,150,106',
  klassikot: '232,192,106', ranskalaiset: '175,130,255', boheemit: '95,217,166', erikois: '95,150,255', paahtimo: '255,107,107', brunssi: '232,192,106',
  cocktail: '175,130,255', olut: '232,192,106', viini: '255,107,107', urheilu: '95,150,255',
  klubi: '175,130,255', karaoke: '255,107,107', tekno: '95,150,255', katto: '95,217,166',
}

function SubCatGrid({ restType, onSelect }: {
  restType: RestType
  onSelect: (id: string) => void
}) {
  return (
    <section>
      <h2 className="font-black text-white text-[18px] mb-3" style={{ letterSpacing: '-0.02em' }}>
        Selaa kategorioittain
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {SUB_CATS[restType].map(cat => (
          <button key={cat.id} onClick={() => onSelect(cat.id)}
            className="flex flex-col items-start gap-2 rounded-[16px] px-3.5 py-4 text-left transition-all active:scale-[.97]"
            style={{
              background: `radial-gradient(130% 110% at 30% 0%, rgba(${GRID_TINTS[cat.id] ?? '120,130,200'},.15), rgba(255,255,255,.03) 70%)`,
              border: '1px solid rgba(255,255,255,.07)',
            }}>
            <span className="text-[24px] leading-none">{cat.emoji}</span>
            <span className="font-black text-[12.5px] leading-tight text-white/90" style={{ letterSpacing: '-0.01em' }}>
              {cat.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── Tyyppisegmentit — pillerit (design 3-ravintolat.png) ──────────────────

function TypeTabs({ active, onChange }: { active: RestType; onChange: (id: RestType) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
      {TYPE_TABS.map(tab => {
        const isActive = active === tab.id
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)}
            className="shrink-0 flex items-center gap-2 rounded-full px-4 py-2.5 transition-all active:scale-[.97]"
            style={isActive
              ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', border: '1px solid transparent', boxShadow: '0 6px 16px -6px rgba(91,101,230,.5)' }
              : { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }
            }>
            <span className="text-[16px] leading-none">{tab.emoji}</span>
            <span className="font-black text-[13.5px]" style={{ letterSpacing: '-0.01em', color: isActive ? '#fff' : 'rgba(255,255,255,.55)' }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Alakategorian alleviivatabit — näkyvät vain pystylistassa ─────────────

function RestSubTabs({ restType, active, onSelect }: {
  restType: RestType
  active: string
  onSelect: (id: string) => void
}) {
  const items = [{ id: 'all', emoji: '', label: 'Kaikki' }, ...SUB_CATS[restType]]
  return (
    <div className="flex gap-5 overflow-x-auto scrollbar-none -mx-4 px-4 border-b border-white/6">
      {items.map(cat => {
        const isActive = active === cat.id
        return (
          <button key={cat.id} onClick={() => onSelect(cat.id)}
            className="shrink-0 pb-2.5 text-[13.5px] font-black transition-colors"
            style={{
              color: isActive ? '#fff' : 'rgba(255,255,255,.4)',
              borderBottom: isActive ? '2px solid #6b76ff' : '2px solid transparent',
              letterSpacing: '-0.01em',
            }}>
            {cat.emoji ? `${cat.emoji} ` : ''}{cat.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Painotettu laatupisteytys listojen OLETUSJÄRJESTYKSELLE ──────────────────
// Bayes-kutistus (IMDB-tyyli): harvoilla arvosteluilla arvosana vedetään kohti
// globaalia keskiarvoa, jottei "5,0 (7 arvostelua)" ohita "4,6 (2000)".
// Michelin/Bib nostaa; arvostelematon painuu listan loppuun (kuva ratkaisee
// tasapelin erikseen). Vain lajitteluun — ei piilota mitään.
const RATING_PRIOR_M = 50   // "näennäisarvostelujen" paino
const RATING_PRIOR_C = 4.2  // globaali keskiarvo, johon harvat vedetään
function restaurantQualityScore(r: Restaurant): number {
  const award = r.michelinStars ? 0.6 : (r.bibGourmand || r.michelinRecommended) ? 0.35 : 0
  if (r.googleRating !== undefined && r.googleRating !== null) {
    const v = r.reviewCount ?? 0
    return (v * r.googleRating + RATING_PRIOR_M * RATING_PRIOR_C) / (v + RATING_PRIOR_M) + award
  }
  return award > 0 ? RATING_PRIOR_C + award : 0
}

// ── "⭐ 4+ / 4.5+" — arvosana ≥ kynnys; Michelin/Bib-tunnustus korvaa
//    arvostelumäärävaatimuksen ja puuttuvan arvosanan, mutta EI koskaan
//    kynnyksen alittavaa näkyvää arvosanaa (kortti ei saa riidellä
//    aktiivisen suodattimen kanssa) ─────────────────────────────────────────
function isRatedAtLeast(r: Restaurant, min: number): boolean {
  const award = !!(r.michelinStars || r.bibGourmand || r.michelinRecommended)
  if (r.googleRating === undefined || r.googleRating === null) return award
  if (r.googleRating < min) return false
  return (r.reviewCount ?? 0) >= 50 || award
}

// ── 🎯 Auta valitsemaan -paneeli (design 3-ravintolat.png) ────────────────

type DistSeg = 1 | 3 | null       // ≤1 km | ≤3 km — kumulatiivinen säde
type PriceSeg = 1 | 2 | 3 | null  // € | €€ | €€€
type StarSeg = 4 | 4.5 | null     // ⭐ 4+ | ⭐ 4.5+

function DecidePanel({ pool, pick, tried, dist, price, stars, showPrice, geoNote, locPending, distMap, onDist, onPrice, onStars, onClear, onDecide, onAgain, onOpen }: {
  pool: Restaurant[]
  pick: Restaurant | null
  tried: boolean
  dist: DistSeg
  price: PriceSeg
  stars: StarSeg
  showPrice: boolean
  geoNote: string | null
  locPending: boolean
  distMap: Map<string, number>
  onDist: (d: DistSeg) => void
  onPrice: (p: PriceSeg) => void
  onStars: (s: StarSeg) => void
  onClear: () => void
  onDecide: () => void
  onAgain: () => void
  onOpen: (r: Restaurant) => void
}) {
  const hasFilters = dist !== null || price !== null || stars !== null
  const segBtn = (isActive: boolean): React.CSSProperties => ({
    color: isActive ? '#fff' : 'rgba(255,255,255,.45)',
    background: isActive ? 'rgba(107,118,255,.35)' : 'transparent',
    fontWeight: 800,
  })
  const open = pick?.openingHours ? isOpenNow(pick.openingHours) : undefined
  const todayHrs = pick?.openingHours ? getTodayHours(pick.openingHours) : null
  const pickDist = pick ? distMap.get(pick.id) : undefined
  const pickEmoji = pick
    ? (SUB_CATS.ruokapaikat.concat(SUB_CATS.kahvilat, SUB_CATS.baarit, SUB_CATS.yokerhot)
        .find(c => matchesSubCat(pick, 'ruokapaikat', c.id) || (pick.subCategories ?? []).includes(c.id))?.emoji
      ?? (pick.type === 'kahvila' ? '☕' : pick.type === 'baari' ? '🍸' : pick.type === 'yokerho' ? '🌃' : '🍽'))
    : '🍽'

  return (
    <section className="rounded-[20px] p-4 space-y-3"
      style={{ background: 'rgba(107,118,255,.06)', border: '1px solid rgba(107,118,255,.3)' }}>
      <h2 className="font-black text-white text-[16px]" style={{ letterSpacing: '-0.02em' }}>🎯 Auta valitsemaan</h2>

      {/* Kompaktit suodattimet — aina näkyvissä yhdellä rivillä */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
          <span className="pl-2.5 pr-1 text-[13px]">🚶</span>
          {([1, 3] as const).map((km, i) => (
            <button key={km} onClick={() => onDist(dist === km ? null : km)}
              className={`px-2.5 py-2 text-[12px] transition-all ${i > 0 ? 'border-l border-white/8' : ''}`}
              style={segBtn(dist === km)}>
              ≤{km} km
            </button>
          ))}
        </div>
        {showPrice && (
          <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
            {([1, 2, 3] as const).map((p, i) => (
              <button key={p} onClick={() => onPrice(price === p ? null : p)}
                className={`px-3 py-2 text-[12px] transition-all ${i > 0 ? 'border-l border-white/8' : ''}`}
                style={segBtn(price === p)}>
                {'€'.repeat(p)}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
          <span className="pl-2.5 pr-1 text-[13px]">⭐</span>
          {([4, 4.5] as const).map((s, i) => (
            <button key={s} onClick={() => onStars(stars === s ? null : s)}
              className={`px-2.5 py-2 text-[12px] transition-all ${i > 0 ? 'border-l border-white/8' : ''}`}
              style={segBtn(stars === s)}>
              {s === 4 ? '4+' : '4.5+'}
            </button>
          ))}
        </div>
      </div>

      {geoNote && (
        <p className="text-[11.5px] font-bold text-white/45">📍 {geoNote}</p>
      )}

      {/* Tulos / CTA / tyhjä */}
      {pick ? (
        <div className="rounded-[16px] p-3.5 space-y-3" style={{ background: 'rgba(10,10,14,.55)', border: '1px solid rgba(255,255,255,.08)' }}>
          <div className={`flex gap-3 ${pick.image ? 'flex-col sm:flex-row sm:items-center' : 'items-center'}`}>
            {pick.image ? (
              <div onClick={() => onOpen(pick)}
                className="relative w-full aspect-[16/9] sm:w-48 sm:h-32 sm:aspect-auto rounded-[12px] overflow-hidden shrink-0 cursor-pointer"
                style={{ border: '1px solid rgba(255,255,255,.1)' }}>
                <img src={pick.image} alt={pick.name} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center' }} />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-[12px] flex items-center justify-center text-[22px] shrink-0"
                style={{ background: 'rgba(107,118,255,.12)', border: '1px solid rgba(255,255,255,.08)' }}>
                {pickEmoji}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-black text-white text-[15px] truncate" style={{ letterSpacing: '-0.01em' }}>{pick.name}</p>
              <div className="flex items-center gap-2 flex-wrap text-[11.5px] font-bold mt-0.5">
                {open !== undefined && (
                  <span style={{ color: open ? '#5fd9a6' : '#e8c06a' }}>● {open ? 'Avoinna' : 'Suljettu'}</span>
                )}
                {todayHrs && <span className="text-white/40">🕐 {todayHrs}</span>}
                {pick.googleRating && (pick.reviewCount ?? 0) > 0 && <span className="text-white/40">⭐ {pick.googleRating.toFixed(1)}</span>}
                {pick.priceRange && <span className="text-white/40">{'€'.repeat(Math.min(pick.priceRange, 4))}</span>}
                {pickDist !== undefined && <span className="text-white/40">{fmtDist(pickDist)}</span>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onAgain} disabled={pool.length <= 1 || locPending}
              className="py-2.5 rounded-full text-[13px] font-black text-white/70 transition-all active:scale-[.97] disabled:active:scale-100"
              style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', opacity: pool.length <= 1 || locPending ? 0.45 : 1 }}>
              {pool.length <= 1 ? 'Ainoa osuma' : '🔄 Anna toinen'}
            </button>
            <button onClick={() => onOpen(pick)}
              className="py-2.5 rounded-full text-[13px] font-black text-white transition-all active:scale-[.97]"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 8px 20px -8px rgba(91,101,230,.85)' }}>
              Avaa →
            </button>
          </div>
        </div>
      ) : tried && pool.length === 0 ? (
        <div className="text-center py-2 space-y-2">
          <p className="text-[13px] font-bold text-white/45">Ei osumia näillä rajauksilla.</p>
          {hasFilters && (
            <button onClick={onClear}
              className="px-4 py-2 rounded-full text-[12.5px] font-black text-white/80 transition-all active:scale-[.97]"
              style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
              Tyhjennä suodattimet
            </button>
          )}
        </div>
      ) : (
        <button onClick={onDecide} disabled={locPending}
          className="w-full py-3.5 rounded-2xl text-[14.5px] font-black text-white flex items-center justify-center gap-2 transition-all active:scale-[.98] disabled:active:scale-100"
          style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 10px 24px -8px rgba(91,101,230,.85)', opacity: locPending ? 0.6 : 1 }}>
          🎲 Päätä puolestani
          {/* Sijaintihaun aikana pooli on vielä rajaamaton — lukema valehtelisi */}
          {!locPending && <span className="opacity-55 text-[12.5px]">· {pool.length}</span>}
        </button>
      )}
    </section>
  )
}

// ── Quick sort pills ──────────────────────────────────────

function QuickSortPills({ filterOpen, filterNearby, onToggleOpen, onToggleNearby }: {
  filterOpen: boolean
  filterNearby: boolean
  onToggleOpen: () => void
  onToggleNearby: () => void
}) {
  const { t } = useLanguage()
  const on  = { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', color: '#fff' }
  const off = { background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)' }
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
      <button onClick={onToggleOpen}
        className="shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all"
        style={filterOpen ? on : off}>
        🟢 {t('idea.open_now')}
      </button>
      <button onClick={onToggleNearby}
        className="shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all"
        style={filterNearby ? on : off}>
        📍 {t('restaurants.sort_nearby')}
      </button>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────

export default function RestaurantsView({ onShowOnMap, jumpToId, jumpToKey }: {
  onShowOnMap?: (lat: number, lon: number, name: string) => void
  jumpToId?: string
  jumpToKey?: object
}) {
  const { t } = useLanguage()
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [restType, setRestType] = useState<RestType>('ruokapaikat')
  const [subCat, setSubCat] = useState<string>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterNearby, setFilterNearby] = useState(false)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [selectedRest, setSelectedRest] = useState<Restaurant | null>(null)
  const [selectedChain, setSelectedChain] = useState<ChainGroup | null>(null)
  const [visibleCount, setVisibleCount] = useState(48)
  const [news, setNews] = useState<NewsItem[]>([])
  // 🎯 Auta valitsemaan — kompaktit suodattimet + arvottu ehdotus
  const [rcDist, setRcDist] = useState<DistSeg>(null)
  const [rcPrice, setRcPrice] = useState<PriceSeg>(null)
  const [rcStars, setRcStars] = useState<StarSeg>(null)
  const [rcPick, setRcPick] = useState<Restaurant | null>(null)
  const [rcTried, setRcTried] = useState(false)
  // Sijainnin tila: pending = haku käynnissä, denied = lupa evätty,
  // failed = tekninen virhe (timeout/ei saatavilla) — eri viesti kuin epäys.
  // Jokainen uusi haku nollaa tilan → yksi ohimennyt timeout ei salpaa
  // etäisyyssuodatinta loppuistunnoksi.
  const [geoStatus, setGeoStatus] = useState<'idle' | 'pending' | 'denied' | 'failed'>('idle')
  const [distTried, setDistTried] = useState(false)
  // Istunnon aikana jo ehdotetut — arvonta kiertää koko poolin ennen toistoa
  const rcSeen = useRef<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/restaurants')
      .then(r => r.json())
      .then(data => setRestaurants(data.restaurants ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Open detail modal when navigated from search.
  // jumpToKey changes on every click (new object ref) so same restaurant can be reopened.
  useEffect(() => {
    if (!jumpToId || !restaurants.length) return
    const r = restaurants.find(r => r.id === jumpToId)
    if (r) setSelectedRest(r)
  }, [jumpToKey, restaurants])

  useEffect(() => {
    fetch('/api/restaurant-news')
      .then(r => r.json())
      .then(data => setNews(data.items ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setSubCat('all'); setFilterOpen(false); setFilterNearby(false); setVisibleCount(48)
    // Uusi välilehti = uusi arvontaistunto. rcPrice nollataan koska
    // €-segmentti näkyy vain ruokapaikoissa — aktiivinen mutta näkymätön
    // suodatin muilla välilehdillä olisi selittämätön.
    setRcPick(null); setRcTried(false); setRcPrice(null); rcSeen.current.clear()
  }, [restType])
  useEffect(() => { setVisibleCount(48) }, [subCat, filterOpen, filterNearby])
  // Etusivun pikasuodattimet eivät saa vuotaa näkymättöminä alakategorian
  // pystylistaan (siellä ei ole pillereitä joilla ne näkisi/poistaisi)
  useEffect(() => { setFilterOpen(false); setFilterNearby(false) }, [subCat])

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) { setGeoStatus('failed'); return }
    setGeoStatus('pending')
    navigator.geolocation.getCurrentPosition(
      pos => { setGeoStatus('idle'); setUserPos([pos.coords.latitude, pos.coords.longitude]) },
      err => setGeoStatus(err.code === 1 ? 'denied' : 'failed'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  const handleToggleOpen = useCallback(() => setFilterOpen(v => !v), [])

  const handleToggleNearby = useCallback(() => {
    setFilterNearby(v => {
      if (!v) locateMe()
      return !v
    })
  }, [locateMe])

  const distMap = useMemo(() => {
    if (!userPos) return new Map<string, number>()
    const m = new Map<string, number>()
    restaurants.forEach(r => {
      if (r.lat && r.lon) m.set(r.id, haversine(userPos[0], userPos[1], r.lat, r.lon))
    })
    return m
  }, [userPos, restaurants])

  const NIGHTCLUB_SUBS = ['klubi', 'tekno', 'karaoke', 'katto']

  const typePool = useMemo(() => {
    const tab = TYPE_TABS.find(t => t.id === restType)!
    if (restType === 'yokerhot') {
      // OSM nightclubs + bars enriched with nightclub subs + venues with obvious nightclub names
      return restaurants.filter(r => {
        if (r.type === 'yokerho') return true
        if (r.subCategories && r.subCategories.some(s => NIGHTCLUB_SUBS.includes(s))) return true
        const n = r.name.toLowerCase()
        return /karaoke|nightclub|klubi\b|yökerho/.test(n)
      })
    }
    return tab.dbType ? restaurants.filter(r => r.type === tab.dbType) : restaurants
  }, [restaurants, restType])

  const subPool = useMemo(() => {
    if (subCat === 'all') return typePool
    return typePool.filter(r => matchesSubCat(r, restType, subCat))
  }, [typePool, subCat, restType])

  const sortedPool = useMemo(() => {
    const result = [...subPool]
    const filtered = filterOpen
      ? result.filter(r => r.openingHours && isOpenNow(r.openingHours) === true)
      : result
    if (filterNearby && userPos) {
      // Käyttäjä pyysi eksplisiittisesti lähimpiä → etäisyys voittaa
      filtered.sort((a, b) => (distMap.get(a.id) ?? Infinity) - (distMap.get(b.id) ?? Infinity))
    } else {
      // Oletus: paras laatu ensin (painotettu), kuvalliset tasapelin kärkeen
      filtered.sort((a, b) => {
        const d = restaurantQualityScore(b) - restaurantQualityScore(a)
        if (d !== 0) return d
        const ia = a.image ? 1 : 0, ib = b.image ? 1 : 0
        if (ia !== ib) return ib - ia
        return (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
      })
    }
    return filtered
  }, [subPool, filterOpen, filterNearby, userPos, distMap])

  const groupedSortedPool = useMemo(() => groupByChain(sortedPool, distMap), [sortedPool, distMap])

  const heroRest = useMemo(() => {
    return typePool.find(r => r.image && r.openingHours && isOpenNow(r.openingHours))
      ?? typePool.find(r => r.image)
      ?? typePool[0]
      ?? null
  }, [typePool])

  const rows = useMemo(() => {
    const base = typePool
    if (restType === 'ruokapaikat') {
      const lunchRow = isLunchTime()
        ? { title: '🍱 Lounas auki juuri nyt', items: base.filter(r => r.openingHours && isOpenNow(r.openingHours) === true && /lounas|lunch|buffet/.test(`${r.name} ${r.description}`.toLowerCase())) }
        : isDinnerTime()
          ? { title: '🌙 Illallispaikat — auki nyt', items: base.filter(r => r.openingHours && isOpenNow(r.openingHours) === true) }
          // Vain lounas-avainsanat — priceRange ≤ 2 kattoi ennen vain kebab/
          // pizza-heuristiikan, mutta Google-hintadatan myötä se osuisi
          // ~1300 paikkaan ja rivi laimenisi "kaikki ravintolat" -listaksi
          : { title: '☀️ Lounaalle mars', items: base.filter(r => /lounas|lunch|buffet/.test(`${r.name} ${r.description}`.toLowerCase())) }
      return [
        lunchRow,
        { title: '⭐ Michelin & palkitut',        items: base.filter(r => !!(r.michelinStars || r.bibGourmand || r.greenMichelin || r.michelinRecommended)) },
        { title: '🌙 Auki vielä myöhään illalla', items: base.filter(r => r.openingHours ? isLateNight(r.openingHours) : false) },
      ]
    }
    if (restType === 'kahvilat') return [
      { title: '🎩 Kaupungin legendat',          items: base.filter(r => matchesSubCat(r, 'kahvilat', 'klassikot')) },
      { title: '☕ Kahviammattilaisten paahtimot', items: base.filter(r => matchesSubCat(r, 'kahvilat', 'paahtimo') || matchesSubCat(r, 'kahvilat', 'erikois')) },
      { title: '🥐 Aamupala & brunssi',          items: base.filter(r => matchesSubCat(r, 'kahvilat', 'brunssi')) },
      { title: '🥖 Pariisitunnelmaa',            items: base.filter(r => matchesSubCat(r, 'kahvilat', 'ranskalaiset')) },
    ]
    if (restType === 'baarit') return [
      { title: '🍸 Illan paras drinkki ✦',       items: base.filter(r => matchesSubCat(r, 'baarit', 'cocktail')) },
      { title: '🍺 Craft & hops',                items: base.filter(r => matchesSubCat(r, 'baarit', 'olut')) },
      { title: '🍷 Viinituntuinen ilta',          items: base.filter(r => matchesSubCat(r, 'baarit', 'viini')) },
      { title: '📺 Pelit & ottelu katsomossa',    items: base.filter(r => matchesSubCat(r, 'baarit', 'urheilu')) },
    ]
    if (restType === 'yokerhot') return [
      { title: '🎉 Clubit',               items: base.filter(r => matchesSubCat(r, 'yokerhot', 'klubi')) },
      { title: '🎤 Karaokebaaret',        items: base.filter(r => matchesSubCat(r, 'yokerhot', 'karaoke')) },
      { title: '🎧 Tekno & underground',  items: base.filter(r => matchesSubCat(r, 'yokerhot', 'tekno')) },
      { title: '🌃 Rooftops ✦',          items: base.filter(r => matchesSubCat(r, 'yokerhot', 'katto')) },
    ]
    return []
  }, [typePool, restType])

  // ── 🎯 Auta valitsemaan: suodatettu arvontapooli ────────────────────────
  const rcPool = useMemo(() => {
    return typePool.filter(r => {
      if (rcStars !== null && !isRatedAtLeast(r, rcStars)) return false
      if (rcPrice !== null) {
        if (!r.priceRange) return false
        if (rcPrice === 3 ? r.priceRange < 3 : r.priceRange !== rcPrice) return false
      }
      if (rcDist !== null && userPos) {
        const d = distMap.get(r.id)
        if (d === undefined || d > rcDist) return false
      }
      return true
    })
  }, [typePool, rcStars, rcPrice, rcDist, userPos, distMap])

  const rollPick = useCallback((avoidId?: string) => {
    if (rcPool.length === 0) { setRcPick(null); return }
    const seen = rcSeen.current
    // Aukiolo-porrastus: auki nyt > tuntematon > kiinni. Kiinni olevaa ei
    // ehdoteta niin kauan kuin yksikin auki tai aukioloiltaan tuntematon
    // osuma on jäljellä — "minne menen NYT" ei ratkea suljetulla paikalla.
    const now = helsinkiNow()
    const tiers: [Restaurant[], Restaurant[], Restaurant[]] = [[], [], []]
    for (const r of rcPool) {
      const o = isOpenNow(r.openingHours, now)
      tiers[o === true ? 0 : o === undefined ? 1 : 2].push(r)
    }
    // Kiinni olevia (tier 3) ehdotetaan vain jos poolissa ei ole yhtään
    // auki olevaa tai aukioloiltaan tuntematonta — kun auki olevat on
    // kierretty, kierto alkaa mieluummin alusta kuin tarjoaa suljettua.
    const sources = tiers[0].length || tiers[1].length ? [tiers[0], tiers[1]] : [tiers[2]]
    const draw = () => {
      for (const t of sources) {
        const c = t.filter(r => r.id !== avoidId && !seen.has(r.id))
        if (c.length) return c
      }
      return null
    }
    let cands = draw()
    if (!cands) {
      // Kierros käyty läpi — aloitetaan alusta, nykyinen kortti pysyy poissa
      seen.clear()
      cands = draw() ?? rcPool.filter(r => r.id !== avoidId)
      if (!cands.length) cands = rcPool
    }
    // Painotettu arvonta: kuva +1, laatu +1 (1–3). Hyvät ja kuvalliset
    // nousevat useammin, mutta jokainen poolin paikka on saavutettavissa —
    // kova kuvasuodatus teki kuvattomista ikuisesti näkymättömiä.
    const weightOf = (r: Restaurant) =>
      1 + (r.image ? 1 : 0)
        + ((((r.googleRating ?? 0) >= 4.2 && (r.reviewCount ?? 0) >= 50)
            || r.michelinStars || r.bibGourmand || r.michelinRecommended) ? 1 : 0)
    const total = cands.reduce((s, r) => s + weightOf(r), 0)
    let roll = Math.random() * total
    let pick = cands[cands.length - 1]
    for (const r of cands) { roll -= weightOf(r); if (roll <= 0) { pick = r; break } }
    seen.add(pick.id)
    setRcPick(pick)
  }, [rcPool])

  const handleDecide = useCallback(() => { setRcTried(true); rollPick() }, [rollPick])
  const handleAgain = useCallback(() => rollPick(rcPick?.id), [rollPick, rcPick])

  // Etäisyysvalinta pyytää sijainnin laiskasti
  const handleRcDist = useCallback((d: DistSeg) => {
    setRcDist(d)
    if (d !== null) {
      setDistTried(true)
      if (!userPos) locateMe()
    }
  }, [userPos, locateMe])
  // Kun paikannus epäonnistuu, etäisyysvalinta ei saa jäädä "päälle"
  // valehtelemaan. Nollaus VAIN tilasiirtymässä (rcDist ei depseissä) —
  // uusi klikkaus käynnistää aina uuden haun (pending), joten se ei
  // pyyhkiydy vanhan virheen takia.
  useEffect(() => {
    if (geoStatus === 'denied' || geoStatus === 'failed') setRcDist(null)
  }, [geoStatus])

  // Suodattimen vaihto: jos nykyinen ehdotus kelpaa yhä, se PIDETÄÄN —
  // uusi arvonta vain kun ehdotus putoaa poolista. Näin suodattimen
  // säätö ei koskaan "arvo samaa korttia uusiksi" eikä alempaa tulevan
  // 📍 Lähellä -pillerin sijaintihaku vaihda ehdotusta salaa.
  useEffect(() => {
    if (!rcTried) return
    if (rcPick && rcPool.some(r => r.id === rcPick.id)) return
    rollPick(rcPick?.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rcDist, rcPrice, rcStars, userPos])

  const handleRcClear = useCallback(() => { setRcDist(null); setRcPrice(null); setRcStars(null) }, [])

  const clearFilter = useCallback(() => { setSubCat('all'); setFilterOpen(false); setFilterNearby(false) }, [])

  return (
    <main className="max-w-6xl mx-auto px-4 pt-4 pb-24 space-y-4">

      {/* Heading */}
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">HELSINKI</p>
        <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.8rem,6vw,3rem)', letterSpacing: '-0.03em' }}>
          Ravintolat
        </h1>
      </div>

      {/* Type tabs — always visible */}
      <TypeTabs active={restType} onChange={setRestType} />

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-44 rounded-[18px] overflow-hidden skeleton-shimmer" style={{ aspectRatio: '4/3' }} />
            ))}
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-44 rounded-[18px] overflow-hidden skeleton-shimmer" style={{ aspectRatio: '4/3' }} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: '-0.01em' }}>Haetaan ravintoloita</span>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* ═══ ETUSIVU (restSub 'kaikki'): Auta valitsemaan → ruudukko → hero → rivit ═══ */}
          {subCat === 'all' && (
            <>
              <DecidePanel
                pool={rcPool}
                pick={rcPick}
                tried={rcTried}
                dist={rcDist}
                price={rcPrice}
                stars={rcStars}
                showPrice={restType === 'ruokapaikat'}
                geoNote={rcDist !== null && !userPos && geoStatus === 'pending'
                  ? 'Haetaan sijaintia…'
                  : distTried && geoStatus === 'denied'
                    ? 'Sijaintia ei saatu — salli sijainti selaimessa'
                    : distTried && geoStatus === 'failed'
                      ? 'Sijaintia ei saatu — kokeile hetken päästä uudelleen'
                      : null}
                locPending={rcDist !== null && !userPos && geoStatus === 'pending'}
                distMap={distMap}
                onDist={handleRcDist}
                onPrice={setRcPrice}
                onStars={setRcStars}
                onClear={handleRcClear}
                onDecide={handleDecide}
                onAgain={handleAgain}
                onOpen={setSelectedRest}
              />

              <SubCatGrid restType={restType} onSelect={setSubCat} />

              {heroRest && (
                <HeroCard r={heroRest} distance={distMap.get(heroRest.id)} onShowOnMap={onShowOnMap} />
              )}

              <QuickSortPills filterOpen={filterOpen} filterNearby={filterNearby} onToggleOpen={handleToggleOpen} onToggleNearby={handleToggleNearby} />

              {/* Pika-suodattimet (auki/lähellä) päällä → grid-lista rivien sijaan */}
              {(filterOpen || filterNearby) ? (
                groupedSortedPool.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {groupedSortedPool.slice(0, visibleCount).map(item =>
                        '_isChain' in item
                          ? <ChainListCard key={item.key} chain={item} onClick={setSelectedChain} />
                          : <RestListCard key={item.id} r={item} distance={distMap.get(item.id)} onShowOnMap={onShowOnMap} />
                      )}
                    </div>
                    {visibleCount < groupedSortedPool.length && (
                      <button
                        onClick={() => setVisibleCount(v => v + 24)}
                        className="w-full py-3 rounded-2xl text-sm font-black text-white/50 hover:text-white/80 transition-all"
                        style={{ background: 'rgba(255,255,255,.05)' }}>
                        {t('restaurants.load_more')} ({groupedSortedPool.length - visibleCount} {t('restaurants.places')})
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center py-16 text-center gap-3">
                    <span className="text-5xl">🍽</span>
                    <p className="text-white/40 font-bold">{t('discover.no_filter_match')}</p>
                    <button onClick={clearFilter}
                      className="text-sm font-bold px-4 py-2 rounded-xl border text-[#6b76ff]"
                      style={{ borderColor: 'rgba(107,118,255,.3)' }}>
                      {t('common.show_all')}
                    </button>
                  </div>
                )
              ) : (
                <>
                  {rows.filter(r => r.items.length > 0).map(row => (
                    <RestRow
                      key={row.title}
                      title={row.title}
                      items={row.items}
                      distMap={distMap}
                      onCardClick={setSelectedRest}
                      onChainClick={setSelectedChain}
                      onShowOnMap={onShowOnMap}
                    />
                  ))}
                  <NewsSection items={news} />
                </>
              )}
            </>
          )}

          {/* ═══ ALAKATEGORIAN PYSTYLISTA — alleviivatabit + yksipalstainen lista ═══ */}
          {subCat !== 'all' && (
            <>
              <RestSubTabs restType={restType} active={subCat} onSelect={setSubCat} />

              <div className="flex items-center justify-between">
                <h2 className="font-black text-white text-[19px]" style={{ letterSpacing: '-0.02em' }}>
                  {SUB_CATS[restType].find(c => c.id === subCat)?.emoji} {SUB_CATS[restType].find(c => c.id === subCat)?.label}
                  <span className="text-white/30 text-[14px] font-bold"> · {groupedSortedPool.length} {t('restaurants.places')}</span>
                </h2>
              </div>

              {groupedSortedPool.length > 0 ? (
                <>
                  {/* Mobiilissa pystylista; leveällä 2-3 vierekkäin kuten ennen */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
                    {groupedSortedPool.slice(0, visibleCount).map(item =>
                      '_isChain' in item
                        ? <ChainListCard key={item.key} chain={item} onClick={setSelectedChain} />
                        : <RestListCard key={item.id} r={item} distance={distMap.get(item.id)} onShowOnMap={onShowOnMap} />
                    )}
                  </div>
                  {visibleCount < groupedSortedPool.length && (
                    <button
                      onClick={() => setVisibleCount(v => v + 24)}
                      className="w-full py-3 rounded-2xl text-sm font-black text-white/50 hover:text-white/80 transition-all"
                      style={{ background: 'rgba(255,255,255,.05)' }}>
                      {t('restaurants.load_more')} ({groupedSortedPool.length - visibleCount} {t('restaurants.places')})
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center py-16 text-center gap-3">
                  <span className="text-5xl">🍽</span>
                  <p className="text-white/40 font-bold">{t('discover.no_filter_match')}</p>
                  <button onClick={clearFilter}
                    className="text-sm font-bold px-4 py-2 rounded-xl border text-[#6b76ff]"
                    style={{ borderColor: 'rgba(107,118,255,.3)' }}>
                    {t('common.show_all')}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Chain detail sheet */}
      {selectedChain && (
        <ChainDetailSheet
          chain={selectedChain}
          distMap={distMap}
          onClose={() => setSelectedChain(null)}
          onShowOnMap={onShowOnMap}
        />
      )}

      {/* Detail modal */}
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
                <div className="min-w-0">
                  <h2 className="font-black text-white text-xl leading-tight">{selectedRest.name}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {(() => {
                      const open = selectedRest.openingHours ? isOpenNow(selectedRest.openingHours) : undefined
                      return open !== undefined ? (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${open ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/10 text-red-400/60'}`}>
                          {open ? `● ${t('common.open')}` : `○ ${t('common.closed')}`}
                        </span>
                      ) : null
                    })()}
                    {selectedRest.priceRange && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/6 text-white/45">
                        {PRICE_LABELS[selectedRest.priceRange]}
                      </span>
                    )}
                    {selectedRest.googleRating && (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,.12)', color: '#fbbf24' }}>
                        ⭐ {selectedRest.googleRating.toFixed(1)}
                        {selectedRest.reviewCount ? ` (${selectedRest.reviewCount > 999 ? `${(selectedRest.reviewCount/1000).toFixed(1)}t` : selectedRest.reviewCount})` : ''}
                      </span>
                    )}
                    {selectedRest.michelinStars && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">
                        {'⭐'.repeat(selectedRest.michelinStars)} Michelin
                      </span>
                    )}
                    {selectedRest.bibGourmand && !selectedRest.michelinStars && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300">
                        😊 Bib Gourmand
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedRest(null)} className="p-2 rounded-full text-white/40 hover:text-white shrink-0 ml-2"
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
              {selectedRest.openingHours && (() => {
                const todayH = getTodayHours(selectedRest.openingHours)
                const open = isOpenNow(selectedRest.openingHours)
                return (
                  <div className="space-y-0.5">
                    {todayH && (
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Clock size={13} className="shrink-0 text-white/30" />
                        <span className={open ? 'text-emerald-400' : 'text-white/50'}>
                          Tänään {todayH}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-white/25 text-xs">
                      <Clock size={11} className="shrink-0 opacity-0" />
                      <span>{formatOpeningHoursHuman(selectedRest.openingHours)}</span>
                    </div>
                  </div>
                )
              })()}
              <div className="flex gap-3 pt-1 flex-wrap">
                {selectedRest.www && (
                  <a href={/^https?:\/\//i.test(selectedRest.www) ? selectedRest.www : 'https://' + selectedRest.www} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-black"
                    style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                    <Globe size={13} /> {t('common.website')}
                  </a>
                )}
                {(() => {
                  const url = reservationUrl(selectedRest)
                  return url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-black"
                      style={{ background: 'linear-gradient(150deg,#10b981,#059669)' }}>
                      🍽 Varaa pöytä
                    </a>
                  ) : null
                })()}
                {onShowOnMap && selectedRest.lat && selectedRest.lon && (
                  <button onClick={() => { onShowOnMap(selectedRest.lat!, selectedRest.lon!, selectedRest.name); setSelectedRest(null) }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white/70 text-sm font-bold"
                    style={{ background: 'rgba(255,255,255,.08)' }}>
                    <MapIcon size={13} /> {t('idea.on_map')}
                  </button>
                )}
                {((selectedRest.lat && selectedRest.lon) || selectedRest.address) && (
                  <a href={selectedRest.lat && selectedRest.lon
                    ? `https://maps.google.com/maps?daddr=${selectedRest.lat},${selectedRest.lon}&travelmode=transit`
                    : `https://maps.google.com/maps?daddr=${encodeURIComponent(selectedRest.address + ', Helsinki')}&travelmode=transit`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white/70 text-sm font-bold"
                    style={{ background: 'rgba(255,255,255,.08)' }}>
                    <Navigation size={13} /> {t('detail.directions')}
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
