'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { MapPin, Globe, Phone, Navigation, Map as MapIcon, X, Clock } from 'lucide-react'
import type { Restaurant } from '@/lib/types'
import type { NewsItem } from '@/app/api/restaurant-news/route'
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
    { id: 'indian',   label: 'Intialainen',   emoji: '🍛' },
    { id: 'mexican',  label: 'Meksikolainen', emoji: '🌮' },
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
  seafood:       { cp: '1f99e', color: '#1a5f7a' },
  steak:         { cp: '1f969', color: '#922b21' },
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
  const h = new Date().getHours()
  return h >= 10 && h < 15
}

function isDinnerTime(): boolean {
  const h = new Date().getHours()
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
      const [fh, fm] = m[2].split(':').map(Number)
      const [th, tm] = m[3].split(':').map(Number)
      const from = fh * 60 + fm, to = th * 60 + tm
      if (to < from) {
        const yesterday = (dayIdx + 6) % 7
        if (days.includes(dayIdx) && cur >= from) return true
        if (days.includes(yesterday) && cur <= to) return true
      } else {
        if (days.includes(dayIdx) && cur >= from && cur <= to) return true
      }
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
    if (sub === 'klubi') return /klubi|nightclub|yökerho|disco/.test(text)
    if (sub === 'karaoke') return /karaoke/.test(text)
    if (sub === 'tekno') return /tekno|techno|industrial|electronic/.test(text)
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
      <div className="absolute inset-0" style={{ background: '#0f0f14' }} />
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 38%, ${heroStyle.color}40 0%, transparent 62%)` }} />
      <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '70px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={twemojiUrl(heroStyle.cp)} alt="" width={88} height={88} style={{ objectFit: 'contain', filter: 'drop-shadow(0 4px 24px rgba(0,0,0,.7))' }} />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: heroStyle.color, opacity: 0.5 }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.97) 0%,rgba(10,10,12,.1) 50%,transparent 100%)' }} />

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
        {/* B2: dark bg + cuisine-colored radial glow + Twemoji illustrated emoji */}
        <div className="absolute inset-0" style={{ background: '#141418' }} />
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 55%, ${cuisineStyle.color}30 0%, transparent 68%)` }} />
        <div className="absolute inset-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={twemojiUrl(cuisineStyle.cp)} alt="" width={50} height={50} style={{ objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.5))' }} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: cuisineStyle.color, opacity: 0.6 }} />
        {open !== undefined && (
          <div className="absolute top-2 right-2">
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${open ? 'bg-emerald-500 text-white' : 'bg-black/50 text-white/50'}`}>
              {open ? `● ${t('common.open')}` : `○ ${t('common.closed')}`}
            </span>
          </div>
        )}
        {(r.michelinStars || r.bibGourmand) && (
          <div className="absolute top-2 left-2">
            {r.michelinStars ? (
              <span className="text-[11px] font-black px-2 py-1 rounded-full text-white leading-none" style={{ background: 'rgba(185,28,28,.95)', boxShadow: '0 2px 8px rgba(0,0,0,.5)' }}>
                {'⭐'.repeat(r.michelinStars)} Michelin
              </span>
            ) : (
              <span className="text-[11px] font-black px-2 py-1 rounded-full text-white leading-none" style={{ background: 'rgba(194,65,12,.95)', boxShadow: '0 2px 8px rgba(0,0,0,.5)' }}>
                😊 Bib Gourmand
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
      {/* B2-style mini-header */}
      <div className="relative flex items-center justify-center overflow-hidden" style={{ height: 72, background: '#141418' }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 60%, ${cuisineStyle.color}28 0%, transparent 70%)` }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={twemojiUrl(cuisineStyle.cp)} alt="" width={38} height={38} style={{ objectFit: 'contain', position: 'relative', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))' }} />
        <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: cuisineStyle.color, opacity: 0.5 }} />
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
        {r.openingHours && (
          <div className="flex items-center gap-1.5 text-white/25 text-xs">
            <Clock size={10} className="shrink-0" />
            <span className="truncate">{r.openingHours}</span>
          </div>
        )}
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

// ── Carousel row — expand in place ────────────────────────

function RestRow({ title, items, distMap, onCardClick, onShowOnMap }: {
  title: string
  items: Restaurant[]
  distMap: Map<string, number>
  onCardClick: (r: Restaurant) => void
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null
  const hasMore = items.length > 10
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-white text-[17px] flex items-baseline gap-1.5" style={{ letterSpacing: '-0.02em' }}>
          {title}
          <span className="text-white/25 font-bold text-[13px]">· {items.length}</span>
        </h2>
        {hasMore && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-[12px] font-black shrink-0 transition-colors" style={{ color: '#a3abff' }}>
            {t('discover.see_all')} {items.length} →
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
          {items.slice(0, 10).map(r => (
            <RestRowCard key={r.id} r={r} distance={distMap.get(r.id)} onClick={onCardClick} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(r => (
            <RestListCard key={r.id} r={r} distance={distMap.get(r.id)} onShowOnMap={onShowOnMap} />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Sub-cat icon grid ─────────────────────────────────────

function SubCatGrid({ restType, active, onSelect }: {
  restType: RestType
  active: string
  onSelect: (id: string) => void
}) {
  return (
    <section>
      <h2 className="font-black text-white text-[17px] mb-4" style={{ letterSpacing: '-0.02em' }}>
        Selaa tyypeittäin
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        {SUB_CATS[restType].map(cat => {
          const isActive = active === cat.id
          return (
            <button key={cat.id} onClick={() => onSelect(isActive ? 'all' : cat.id)}
              className="flex items-center gap-3 rounded-2xl px-4 py-4 text-left transition-all active:scale-[.97]"
              style={isActive
                ? { background: 'rgba(107,118,255,.12)', border: '1px solid rgba(107,118,255,.4)' }
                : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }
              }>
              <span className="text-[22px] leading-none flex-shrink-0">{cat.emoji}</span>
              <span className="font-black text-[13px] leading-tight"
                style={{ letterSpacing: '-0.01em', color: isActive ? '#a3abff' : 'rgba(255,255,255,.6)' }}>
                {cat.label}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── Type tab grid — 2×2 large cards ──────────────────────

function TypeTabs({ active, onChange }: { active: RestType; onChange: (id: RestType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {TYPE_TABS.map(tab => {
        const isActive = active === tab.id
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)}
            className="flex items-center gap-3 rounded-2xl px-4 py-4 text-left transition-all active:scale-[.97]"
            style={isActive
              ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', border: '1px solid transparent', boxShadow: '0 8px 24px -8px rgba(91,101,230,.5)' }
              : { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }
            }>
            <span className="text-[26px] leading-none flex-shrink-0">{tab.emoji}</span>
            <span className="font-black text-[14px] leading-tight"
              style={{ letterSpacing: '-0.01em', color: isActive ? '#fff' : 'rgba(255,255,255,.7)' }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
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

export default function RestaurantsView({ onShowOnMap }: {
  onShowOnMap?: (lat: number, lon: number, name: string) => void
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
  const [visibleCount, setVisibleCount] = useState(48)
  const [news, setNews] = useState<NewsItem[]>([])

  useEffect(() => {
    fetch('/api/restaurants')
      .then(r => r.json())
      .then(data => setRestaurants(data.restaurants ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/restaurant-news')
      .then(r => r.json())
      .then(data => setNews(data.items ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => { setSubCat('all'); setFilterOpen(false); setFilterNearby(false); setVisibleCount(48) }, [restType])
  useEffect(() => { setVisibleCount(48) }, [subCat, filterOpen, filterNearby])

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {},
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

  const typePool = useMemo(() => {
    const tab = TYPE_TABS.find(t => t.id === restType)!
    if (restType === 'yokerhot') {
      return restaurants.filter(r => {
        const text = `${r.name} ${r.description}`.toLowerCase()
        return /yökerho|nightclub|klubi|disco|dj/.test(text)
      })
    }
    return tab.dbType ? restaurants.filter(r => r.type === tab.dbType) : restaurants
  }, [restaurants, restType])

  const subPool = useMemo(() => {
    if (subCat === 'all') return typePool
    return typePool.filter(r => matchesSubCat(r, restType, subCat))
  }, [typePool, subCat, restType])

  const sortedPool = useMemo(() => {
    let result = [...subPool]
    if (filterOpen) result = result.filter(r => r.openingHours && isOpenNow(r.openingHours) === true)
    if (filterNearby && userPos) result = result.sort((a, b) => (distMap.get(a.id) ?? Infinity) - (distMap.get(b.id) ?? Infinity))
    return result
  }, [subPool, filterOpen, filterNearby, userPos, distMap])

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
          : { title: '☀️ Lounaalle mars', items: base.filter(r => /lounas|lunch|buffet/.test(`${r.name} ${r.description}`.toLowerCase()) || (r.priceRange !== undefined && r.priceRange <= 2)) }
      return [
        lunchRow,
        { title: '⭐ Michelin & palkitut',        items: base.filter(r => !!(r.michelinStars || r.bibGourmand || r.greenMichelin)) },
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

  const isFilterActive = subCat !== 'all' || filterOpen || filterNearby

  const activeFilterLabel = useMemo(() => {
    const parts: string[] = []
    if (filterOpen) parts.push(`🟢 ${t('idea.open_now')}`)
    if (filterNearby) parts.push(`📍 ${t('restaurants.sort_nearby')}`)
    if (subCat !== 'all') {
      const cat = SUB_CATS[restType].find(c => c.id === subCat)
      if (cat) parts.push(`${cat.emoji} ${cat.label}`)
    }
    return parts.join(' · ') || t('common.filters')
  }, [subCat, filterOpen, filterNearby, restType])

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
        <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shrink-0 w-44 rounded-[18px] overflow-hidden skeleton-shimmer" style={{ aspectRatio: '4/3' }} />
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* Active filter bar */}
          {isFilterActive && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl"
              style={{ background: 'rgba(107,118,255,.08)', border: '1px solid rgba(107,118,255,.2)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-black text-[13px]" style={{ color: '#a3abff' }}>{activeFilterLabel}</span>
                <span className="text-[12px]" style={{ color: 'rgba(255,255,255,.3)' }}>· {sortedPool.length} {t('restaurants.places')}</span>
              </div>
              <button onClick={clearFilter}
                className="text-[12px] font-black flex-shrink-0 ml-3 px-3 py-1 rounded-full transition-all"
                style={{ color: 'rgba(255,255,255,.4)', border: '1px solid rgba(255,255,255,.1)' }}>
                {t('discover.exit_search')}
              </button>
            </div>
          )}

          {/* Homepage view: hero + quick sorts + carousels + icon grid */}
          {!isFilterActive && (
            <>
              {heroRest && (
                <HeroCard r={heroRest} distance={distMap.get(heroRest.id)} onShowOnMap={onShowOnMap} />
              )}

              <QuickSortPills filterOpen={filterOpen} filterNearby={filterNearby} onToggleOpen={handleToggleOpen} onToggleNearby={handleToggleNearby} />

              {rows.filter(r => r.items.length > 0).map(row => (
                <RestRow
                  key={row.title}
                  title={row.title}
                  items={row.items}
                  distMap={distMap}
                  onCardClick={setSelectedRest}
                  onShowOnMap={onShowOnMap}
                />
              ))}

              <NewsSection items={news} />

              <SubCatGrid
                restType={restType}
                active={subCat}
                onSelect={setSubCat}
              />
            </>
          )}

          {/* Filter active: list view */}
          {isFilterActive && (
            <>
              <QuickSortPills filterOpen={filterOpen} filterNearby={filterNearby} onToggleOpen={handleToggleOpen} onToggleNearby={handleToggleNearby} />

              {sortedPool.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedPool.slice(0, visibleCount).map(r => (
                      <RestListCard key={r.id} r={r} distance={distMap.get(r.id)} onShowOnMap={onShowOnMap} />
                    ))}
                  </div>
                  {visibleCount < sortedPool.length && (
                    <button
                      onClick={() => setVisibleCount(v => v + 24)}
                      className="w-full py-3 rounded-2xl text-sm font-black text-white/50 hover:text-white/80 transition-all"
                      style={{ background: 'rgba(255,255,255,.05)' }}>
                      {t('restaurants.load_more')} ({sortedPool.length - visibleCount} {t('restaurants.places')})
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
              {selectedRest.openingHours && (
                <div className="flex items-center gap-2 text-white/30 text-sm">
                  <Clock size={13} /> {selectedRest.openingHours}
                </div>
              )}
              <div className="flex gap-3 pt-1 flex-wrap">
                {selectedRest.www && (
                  <a href={/^https?:\/\//i.test(selectedRest.www) ? selectedRest.www : 'https://' + selectedRest.www} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-black"
                    style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                    <Globe size={13} /> {t('common.website')}
                  </a>
                )}
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
