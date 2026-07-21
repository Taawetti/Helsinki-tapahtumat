'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { MapPin, Globe, Phone, Navigation, Clock, Ticket, Timer, Map as MapIcon, X } from 'lucide-react'
import type { Activity, ActivityCategory } from '@/lib/types'
import { getHighlight } from '@/lib/activity-highlights'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { isOpenNow } from '@/lib/opening-hours'

// ── Constants ─────────────────────────────────────────────

const CATEGORY_META: Record<ActivityCategory, { label: string; emoji: string; gradient: string }> = {
  sauna:      { label: 'Saunat',      emoji: '🧖', gradient: 'linear-gradient(135deg,#7c2d12,#9a3412)' },
  museo:      { label: 'Museot',      emoji: '🏛', gradient: 'linear-gradient(135deg,#0f172a,#1e3a5f)' },
  nahtavyys:  { label: 'Nähtävyydet', emoji: '🌄', gradient: 'linear-gradient(135deg,#1e1b4b,#312e81)' },
  galleria:   { label: 'Galleriat',   emoji: '🖼', gradient: 'linear-gradient(135deg,#2e1065,#4c1d95)' },
  nakopaikka: { label: 'Näköpaikat',  emoji: '🔭', gradient: 'linear-gradient(135deg,#0c4a6e,#075985)' },
  uimaranta:  { label: 'Uimarannat', emoji: '🏖', gradient: 'linear-gradient(135deg,#0c4a6e,#0369a1)' },
  puisto:     { label: 'Puistot',     emoji: '🌳', gradient: 'linear-gradient(135deg,#042f2e,#065f46)' },
  markkina:   { label: 'Markkinat',   emoji: '🛍', gradient: 'linear-gradient(135deg,#451a03,#78350f)' },
  urheilu:    { label: 'Urheilu',     emoji: '⚽', gradient: 'linear-gradient(135deg,#172554,#1e3a8a)' },
  muu:        { label: 'Muut',        emoji: '✨', gradient: 'linear-gradient(135deg,#1a1a2e,#16213e)' },
}

// Categories shown in the icon grid (ordered by summer relevance)
const GRID_CATS: ActivityCategory[] = [
  'sauna', 'nakopaikka', 'nahtavyys', 'uimaranta', 'puisto',
  'museo', 'galleria', 'markkina', 'urheilu', 'muu',
]

// Hero rotates category by day of week
const HERO_ROTATION: ActivityCategory[] = [
  'sauna', 'nakopaikka', 'museo', 'uimaranta', 'galleria', 'puisto', 'markkina',
]

// Helsinki's must-see attractions — used for "Helsingin helmet" row
const HELMET_IDS_OR_NAMES = new Set([
  'suomenlinna', 'temppeliaukion kirkko', 'helsingin tuomiokirkko',
  'amos rex', 'löyly', 'allas sea pool', 'kansallismuseo', 'ateneum',
  'kiasma', 'ham helsinki', 'linnanmäki', 'korkeasaari', 'oodi',
])

// Categories always accessible outdoors — shown even without opening_hours tag
const OUTDOOR_ALWAYS_OPEN: string[] = ['uimaranta', 'puisto', 'nakopaikka', 'nahtavyys']

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

function ctaLabel(a: Activity, t: (k: TranslationKey) => string): string {
  if (a.category === 'sauna') return `${t('common.website')} →`
  if (a.category === 'museo' || a.category === 'galleria') return `${t('detail.buy_tickets')} →`
  return `${t('common.more_info')} →`
}

// ── Hero card ─────────────────────────────────────────────

function ActivityHero({ a, distance, rating, onShowOnMap }: {
  a: Activity
  distance?: number
  rating?: { rating: number; reviewCount: number }
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()
  const open = isOpenNow(a.openingHours)
  const meta = CATEGORY_META[a.category]

  return (
    <div className="relative w-full rounded-[22px] overflow-hidden" style={{ aspectRatio: '16/9', boxShadow: '0 22px 50px -20px rgba(10,10,12,.8)' }}>
      {a.image ? (
        <img src={a.image} alt={a.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-6xl" style={{ background: meta.gradient }}>
          {meta.emoji}
        </div>
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.97) 0%,rgba(10,10,12,.15) 55%,transparent 100%)' }} />

      {open !== undefined && (
        <div className="absolute top-4 right-4">
          <span className={`text-[11px] font-black px-3 py-1 rounded-full ${open ? 'bg-emerald-500 text-white' : 'bg-white/20 text-white/60'}`}>
            {open ? t('common.open') : t('common.closed')}
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
              {ctaLabel(a, t)}
            </a>
          ) : (
            <span className="px-4 py-2 rounded-full text-white text-[13px] font-black" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
              {ctaLabel(a, t)}
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
              🗺 {t('idea.on_map')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Carousel row card ─────────────────────────────────────

function ActivityRowCard({ a, distance, rating, onClick }: {
  a: Activity
  distance?: number
  rating?: { rating: number; reviewCount: number }
  onClick: (a: Activity) => void
}) {
  const { t } = useLanguage()
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
          <div className="absolute inset-0 flex items-center justify-center text-4xl" style={{ background: meta.gradient }}>
            {meta.emoji}
          </div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.8) 0%,transparent 60%)' }} />
        {open !== undefined && (
          <div className="absolute top-2 right-2">
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${open ? 'bg-emerald-500 text-white' : 'bg-black/50 text-white/50'}`}>
              {open ? `● ${t('common.open')}` : `○ ${t('common.closed')}`}
            </span>
          </div>
        )}
        {a.fee === false && (
          <div className="absolute top-2 left-2">
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">{t('common.free_badge')}</span>
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

// ── Carousel row — expand in place ────────────────────────

function ActRow({ title, items, distMap, ratingMap, onCardClick, onShowOnMap }: {
  title: string
  items: Activity[]
  distMap: Map<string, number>
  ratingMap: Map<string, { rating: number; reviewCount: number }>
  onCardClick: (a: Activity) => void
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
          {items.slice(0, 10).map(a => (
            <ActivityRowCard key={a.id} a={a} distance={distMap.get(a.id)} rating={ratingMap.get(a.name.toLowerCase())} onClick={onCardClick} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(a => (
            <ActivityListCard key={a.id} a={a} distance={distMap.get(a.id)} rating={ratingMap.get(a.name.toLowerCase())} onShowOnMap={onShowOnMap} />
          ))}
        </div>
      )}
    </section>
  )
}

// ── List card ─────────────────────────────────────────────

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
                {open ? `● ${t('common.open')}` : `○ ${t('common.closed')}`}
              </span>
            )}
            {a.fee === false && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">{t('common.free_badge')}</span>
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

// ── Category icon grid ────────────────────────────────────

// tint-hehkut per kategoria (design 5-aktiviteetit.png) — sävyt vaihtelevat
const ACT_TINTS: Partial<Record<ActivityCategory, string>> = {
  sauna: '95,217,166', nakopaikka: '232,150,106', nahtavyys: '175,130,255', museo: '95,150,255',
  uimaranta: '95,196,255', puisto: '120,220,120', markkina: '232,120,180', galleria: '175,130,255',
  urheilu: '95,150,255', muu: '200,200,220',
}

function CategoryGrid({ onSelect }: {
  onSelect: (id: ActivityCategory) => void
}) {
  return (
    <section>
      <h2 className="font-black text-white text-[18px] mb-3" style={{ letterSpacing: '-0.02em' }}>
        Selaa kategorioittain
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {GRID_CATS.map(cat => {
          const meta = CATEGORY_META[cat]
          return (
            <button key={cat} onClick={() => onSelect(cat)}
              className="flex flex-col items-start gap-2 rounded-[16px] px-3.5 py-4 text-left transition-all active:scale-[.97]"
              style={{
                background: `radial-gradient(130% 110% at 30% 0%, rgba(${ACT_TINTS[cat] ?? '120,130,200'},.15), rgba(255,255,255,.03) 70%)`,
                border: '1px solid rgba(255,255,255,.07)',
              }}>
              <span className="text-[24px] leading-none">{meta.emoji}</span>
              <span className="font-black text-[12.5px] leading-tight text-white/90" style={{ letterSpacing: '-0.01em' }}>
                {meta.label}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── Alakategorian alleviivatabit — näkyvät vain pystylistassa ─────────────
function ActSubTabs({ active, onSelect }: {
  active: ActivityCategory | 'all'
  onSelect: (id: ActivityCategory | 'all') => void
}) {
  const items: { id: ActivityCategory | 'all'; emoji: string; label: string }[] = [
    { id: 'all', emoji: '', label: 'Kaikki' },
    ...GRID_CATS.map(c => ({ id: c, emoji: CATEGORY_META[c].emoji, label: CATEGORY_META[c].label })),
  ]
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

// ── 🎯 Auta valitsemaan (design 5-aktiviteetit.png): 🚶-etäisyys + 🟢 Auki ──
function ActDecidePanel({ pool, pick, tried, dist, auki, distMap, ratingMap, onDist, onAuki, onDecide, onAgain, onOpen }: {
  pool: Activity[]
  pick: Activity | null
  tried: boolean
  dist: 0 | 1 | 2 | null
  auki: boolean
  distMap: Map<string, number>
  ratingMap: Map<string, { rating: number; reviewCount: number }>
  onDist: (d: 0 | 1 | 2 | null) => void
  onAuki: () => void
  onDecide: () => void
  onAgain: () => void
  onOpen: (a: Activity) => void
}) {
  const segBtn = (isActive: boolean): React.CSSProperties => ({
    color: isActive ? '#fff' : 'rgba(255,255,255,.45)',
    background: isActive ? 'rgba(107,118,255,.35)' : 'transparent',
    fontWeight: 800,
  })
  const pickOpen = pick
    ? (!pick.openingHours && OUTDOOR_ALWAYS_OPEN.includes(pick.category) ? true : isOpenNow(pick.openingHours))
    : undefined
  const pickDist = pick ? distMap.get(pick.id) : undefined
  const pickRating = pick ? ratingMap.get(pick.name.toLowerCase()) : undefined

  return (
    <section className="rounded-[20px] p-4 space-y-3"
      style={{ background: 'rgba(107,118,255,.06)', border: '1px solid rgba(107,118,255,.3)' }}>
      <h2 className="font-black text-white text-[16px]" style={{ letterSpacing: '-0.02em' }}>🎯 Auta valitsemaan</h2>

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
          <span className="pl-2.5 pr-1 text-[13px]">🚶</span>
          {(['0–1', '1–3', '3+ km'] as const).map((label, i) => (
            <button key={label} onClick={() => onDist(dist === (i as 0 | 1 | 2) ? null : (i as 0 | 1 | 2))}
              className={`px-2.5 py-2 text-[12px] transition-all ${i > 0 ? 'border-l border-white/8' : ''}`}
              style={segBtn(dist === i)}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={onAuki}
          className="px-3.5 py-2 rounded-xl text-[12px] font-black transition-all"
          style={{
            background: auki ? 'rgba(107,118,255,.35)' : 'rgba(255,255,255,.05)',
            border: auki ? '1px solid rgba(107,118,255,.5)' : '1px solid rgba(255,255,255,.09)',
            color: auki ? '#fff' : 'rgba(255,255,255,.45)',
          }}>
          🟢 Auki
        </button>
      </div>

      {pick ? (
        <div className="rounded-[16px] p-3.5 space-y-3" style={{ background: 'rgba(10,10,14,.55)', border: '1px solid rgba(255,255,255,.08)' }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[12px] flex items-center justify-center text-[22px] shrink-0"
              style={{ background: 'rgba(107,118,255,.12)', border: '1px solid rgba(255,255,255,.08)' }}>
              {CATEGORY_META[pick.category]?.emoji ?? '✨'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-black text-white text-[15px] truncate" style={{ letterSpacing: '-0.01em' }}>{pick.name}</p>
              <div className="flex items-center gap-2 flex-wrap text-[11.5px] font-bold mt-0.5">
                <span className="text-white/40">{CATEGORY_META[pick.category]?.label}</span>
                {pickOpen !== undefined && (
                  <span style={{ color: pickOpen ? '#5fd9a6' : '#e8c06a' }}>● {pickOpen ? 'Avoinna' : 'Suljettu'}</span>
                )}
                {pick.fee === false && <span style={{ color: '#5fd9a6' }}>Ilmainen</span>}
                {pickRating && <span className="text-white/40">⭐ {pickRating.rating.toFixed(1)}</span>}
                {pickDist !== undefined && <span className="text-white/40">{fmtDist(pickDist)}</span>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onAgain}
              className="py-2.5 rounded-full text-[13px] font-black text-white/70 transition-all active:scale-[.97]"
              style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
              🔄 Anna toinen
            </button>
            <button onClick={() => onOpen(pick)}
              className="py-2.5 rounded-full text-[13px] font-black text-white transition-all active:scale-[.97]"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 8px 20px -8px rgba(91,101,230,.85)' }}>
              Avaa →
            </button>
          </div>
        </div>
      ) : tried && pool.length === 0 ? (
        <p className="text-[13px] font-bold text-white/45 text-center py-2">
          Ei osumia näillä rajauksilla — löysää suodattimia.
        </p>
      ) : (
        <button onClick={onDecide}
          className="w-full py-3.5 rounded-2xl text-[14.5px] font-black text-white flex items-center justify-center gap-2 transition-all active:scale-[.98]"
          style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 10px 24px -8px rgba(91,101,230,.85)' }}>
          🎲 Päätä puolestani
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
        📍 {t('activities.sort_nearby')}
      </button>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────

export default function ActivitiesView({ onShowOnMap }: {
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t } = useLanguage()
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState<ActivityCategory | 'all'>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterNearby, setFilterNearby] = useState(false)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [venueRatings, setVenueRatings] = useState<Record<string, { rating: number; reviewCount: number; priceLevel: string | null }>>({})
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [visibleCount, setVisibleCount] = useState(48)
  // 🎯 Auta valitsemaan — etäisyys + auki-suodatin + arvottu ehdotus
  const [acDist, setAcDist] = useState<0 | 1 | 2 | null>(null)
  const [acAuki, setAcAuki] = useState(false)
  const [acPick, setAcPick] = useState<Activity | null>(null)
  const [acTried, setAcTried] = useState(false)

  // Stable shuffle seed per session — makes Ylläty actually different each visit
  const shuffleSeed = useRef(Math.floor(Math.random() * 9973))

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

  useEffect(() => { setFilterOpen(false); setFilterNearby(false); setVisibleCount(48) }, [catFilter])
  useEffect(() => { setVisibleCount(48) }, [filterOpen, filterNearby])

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
    activities.forEach(a => { if (a.lat && a.lon) m.set(a.id, haversine(userPos[0], userPos[1], a.lat, a.lon)) })
    return m
  }, [userPos, activities])

  const ratingMap = useMemo(() => {
    const m = new Map<string, { rating: number; reviewCount: number }>()
    Object.entries(venueRatings).forEach(([key, val]) => { if (val) m.set(key.toLowerCase(), val) })
    return m
  }, [venueRatings])

  const catPool = useMemo(() => {
    if (catFilter === 'all') return activities
    return activities.filter(a => a.category === catFilter)
  }, [activities, catFilter])

  // ── 🎯 Auta valitsemaan: suodatettu arvontapooli ────────────────────────
  const acPool = useMemo(() => {
    return activities.filter(a => {
      if (acAuki) {
        const open = !a.openingHours && OUTDOOR_ALWAYS_OPEN.includes(a.category) ? true : isOpenNow(a.openingHours)
        if (open !== true) return false
      }
      if (acDist !== null && userPos) {
        const d = distMap.get(a.id)
        if (d === undefined) return false
        if (acDist === 0 && d > 1) return false
        if (acDist === 1 && (d <= 1 || d > 3)) return false
        if (acDist === 2 && d <= 3) return false
      }
      return true
    })
  }, [activities, acAuki, acDist, userPos, distMap])

  const acRoll = useCallback((avoidId?: string) => {
    const candidates = acPool.length > 1 && avoidId ? acPool.filter(a => a.id !== avoidId) : acPool
    if (candidates.length === 0) { setAcPick(null); return }
    setAcPick(candidates[Math.floor(Math.random() * candidates.length)])
  }, [acPool])

  const handleAcDecide = useCallback(() => { setAcTried(true); acRoll() }, [acRoll])
  const handleAcAgain = useCallback(() => acRoll(acPick?.id), [acRoll, acPick])
  const handleAcDist = useCallback((d: 0 | 1 | 2 | null) => {
    setAcDist(d)
    if (d !== null && !userPos) locateMe()
  }, [userPos, locateMe])
  // Suodattimen vaihto arpoo heti uuden osuman — vain kun arvonta käynnissä
  useEffect(() => {
    if (!acTried) return
    setAcPick(acPool.length === 0 ? null : acPool[Math.floor(Math.random() * acPool.length)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acDist, acAuki, userPos])

  const sortedPool = useMemo(() => {
    let result = [...catPool]
    if (filterOpen) {
      result = result.filter(a => {
        // Outdoor spots without opening_hours are always accessible
        if (!a.openingHours && OUTDOOR_ALWAYS_OPEN.includes(a.category)) return true
        return isOpenNow(a.openingHours) === true
      })
    }
    if (filterNearby && userPos && distMap.size > 0) {
      result = result.sort((a, b) => (distMap.get(a.id) ?? Infinity) - (distMap.get(b.id) ?? Infinity))
    }
    return result
  }, [catPool, filterOpen, filterNearby, userPos, distMap])

  const surpriseItems = useMemo(() => {
    const seed = shuffleSeed.current

    // Commercial gym chains — not "surprising" to recommend
    const GYM_PATTERN = /fressi|forever\s*sport|elixia|fitness first|kuntokeskus/i
    // Generic park sub-types that are just infrastructure, not destinations
    const DULL_PARK_PATTERN = /puistikko|leikkipuisto|liikuntapuisto|urheilupuisto|pallokenttä|ulkoilualue/i
    // Well-known tourist staples — not surprising to recommend
    const OBVIOUS_NAMES = /kauppahalli|hakaniemi.*halli|hietalahden.*halli|vanha kauppatori/i

    function hashId(id: string): number {
      return id.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0)
    }

    function score(a: Activity): number {
      let s = 0
      if (a.image) s += 3
      if (a.category === 'sauna') s += 2
      if (a.category === 'nakopaikka') s += 2
      // galleria and muu tend to be genuinely off-the-beaten-path
      if (a.category === 'galleria') s += 2
      if (a.category === 'muu') s += 2
      return s
    }

    const curated = activities.filter(a => {
      // Already shown in "Helsingin helmet" row
      if (HELMET_IDS_OR_NAMES.has(a.name.toLowerCase())) return false
      // Commercial gym chains
      if (GYM_PATTERN.test(a.name)) return false
      // Generic park sub-types without an image (parks with photos can still be interesting)
      if (a.category === 'puisto' && DULL_PARK_PATTERN.test(a.name) && !a.image) return false
      // Well-known tourist staples that aren't "surprising"
      if (OBVIOUS_NAMES.test(a.name)) return false
      return true
    })

    return curated.sort((a, b) => {
      const sd = score(b) - score(a)
      if (sd !== 0) return sd
      // Same score tier: seeded shuffle for variety
      const ha = (hashId(a.id) + seed) % 9973
      const hb = (hashId(b.id) + seed) % 9973
      return ha - hb
    })
  }, [activities])

  // Hero rotates by day of week across different categories
  const heroActivity = useMemo(() => {
    if (catFilter !== 'all') return null
    const preferredCat = HERO_ROTATION[new Date().getDay() % HERO_ROTATION.length]
    return activities.find(a => a.category === preferredCat && a.image && isOpenNow(a.openingHours))
      ?? activities.find(a => a.image && isOpenNow(a.openingHours))
      ?? activities.find(a => a.image)
      ?? activities[0]
      ?? null
  }, [activities, catFilter])

  const rows = useMemo(() => {
    if (catFilter !== 'all') return []
    return [
      { title: '✨ Ylläty — kokeile jotain uutta',          items: surpriseItems },
      { title: '❤️ Tänne kannattaa mennä kerran elämässä', items: activities.filter(a => HELMET_IDS_OR_NAMES.has(a.name.toLowerCase())) },
      { title: '🆓 Ilmaiseksi — ei maksa mitään',          items: activities.filter(a => a.fee === false) },
      {
        title: '🏛 Sadepäivän pelastajat',
        items: activities.filter(a => {
          if (!INDOOR_CATS.includes(a.category)) return false
          // muu is a catch-all — require an image as minimum quality signal
          if (a.category === 'muu') return !!a.image
          return true
        }),
      },
      {
        title: '🟢 Ovet auki juuri nyt',
        items: activities.filter(a => {
          // Outdoor spots without opening_hours are always accessible
          if (!a.openingHours && OUTDOOR_ALWAYS_OPEN.includes(a.category)) return true
          return isOpenNow(a.openingHours) === true
        }),
      },
    ]
  }, [activities, catFilter, surpriseItems])

  const clearFilter = useCallback(() => { setCatFilter('all'); setFilterOpen(false); setFilterNearby(false) }, [])

  return (
    <main className="max-w-6xl mx-auto px-4 pt-4 pb-24 space-y-4">

      {/* Heading */}
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">HELSINKI</p>
        <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.8rem,6vw,3rem)', letterSpacing: '-0.03em' }}>
          Aktiviteetit
        </h1>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-40 rounded-[18px] overflow-hidden skeleton-shimmer" style={{ aspectRatio: '4/3' }} />
            ))}
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-40 rounded-[18px] overflow-hidden skeleton-shimmer" style={{ aspectRatio: '4/3' }} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: '-0.01em' }}>Haetaan aktiviteetteja</span>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* ═══ ETUSIVU (catFilter 'all'): Auta valitsemaan → ruudukko → hero → rivit ═══ */}
          {catFilter === 'all' && (
            <>
              <ActDecidePanel
                pool={acPool}
                pick={acPick}
                tried={acTried}
                dist={acDist}
                auki={acAuki}
                distMap={distMap}
                ratingMap={ratingMap}
                onDist={handleAcDist}
                onAuki={() => setAcAuki(v => !v)}
                onDecide={handleAcDecide}
                onAgain={handleAcAgain}
                onOpen={setSelectedActivity}
              />

              <CategoryGrid onSelect={setCatFilter} />

              {heroActivity && (
                <ActivityHero
                  a={heroActivity}
                  distance={distMap.get(heroActivity.id)}
                  rating={ratingMap.get(heroActivity.name.toLowerCase())}
                  onShowOnMap={onShowOnMap}
                />
              )}

              <QuickSortPills filterOpen={filterOpen} filterNearby={filterNearby} onToggleOpen={handleToggleOpen} onToggleNearby={handleToggleNearby} />

              {(filterOpen || filterNearby) ? (
                sortedPool.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sortedPool.slice(0, visibleCount).map(a => (
                        <ActivityListCard key={a.id} a={a} distance={distMap.get(a.id)}
                          rating={ratingMap.get(a.name.toLowerCase())} onShowOnMap={onShowOnMap} />
                      ))}
                    </div>
                    {visibleCount < sortedPool.length && (
                      <button onClick={() => setVisibleCount(v => v + 24)}
                        className="w-full py-3 rounded-2xl text-sm font-black text-white/50 hover:text-white/80 transition-all"
                        style={{ background: 'rgba(255,255,255,.05)' }}>
                        Näytä lisää ({sortedPool.length - visibleCount} kohdetta)
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center py-16 text-center gap-3">
                    <span className="text-5xl">🔭</span>
                    <p className="text-white/40 font-bold">Ei kohteita tällä suodatuksella</p>
                    <button onClick={clearFilter}
                      className="text-sm font-bold px-4 py-2 rounded-xl border text-[#6b76ff]"
                      style={{ borderColor: 'rgba(107,118,255,.3)' }}>
                      Näytä kaikki
                    </button>
                  </div>
                )
              ) : (
                rows.filter(r => r.items.length > 0).map(row => (
                  <ActRow
                    key={row.title}
                    title={row.title}
                    items={row.items}
                    distMap={distMap}
                    ratingMap={ratingMap}
                    onCardClick={setSelectedActivity}
                    onShowOnMap={onShowOnMap}
                  />
                ))
              )}
            </>
          )}

          {/* ═══ KATEGORIAN PYSTYLISTA — alleviivatabit + yksipalstainen lista ═══ */}
          {catFilter !== 'all' && (
            <>
              <ActSubTabs active={catFilter} onSelect={setCatFilter} />

              <h2 className="font-black text-white text-[19px]" style={{ letterSpacing: '-0.02em' }}>
                {CATEGORY_META[catFilter].emoji} {CATEGORY_META[catFilter].label}
                <span className="text-white/30 text-[14px] font-bold"> · {sortedPool.length} kohdetta</span>
              </h2>

              {sortedPool.length > 0 ? (
                <>
                  <div className="max-w-2xl space-y-3">
                    {sortedPool.slice(0, visibleCount).map(a => (
                      <ActivityListCard key={a.id} a={a} distance={distMap.get(a.id)}
                        rating={ratingMap.get(a.name.toLowerCase())} onShowOnMap={onShowOnMap} />
                    ))}
                  </div>
                  {visibleCount < sortedPool.length && (
                    <button onClick={() => setVisibleCount(v => v + 24)}
                      className="w-full max-w-2xl py-3 rounded-2xl text-sm font-black text-white/50 hover:text-white/80 transition-all"
                      style={{ background: 'rgba(255,255,255,.05)' }}>
                      Näytä lisää ({sortedPool.length - visibleCount} kohdetta)
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center py-16 text-center gap-3">
                  <span className="text-5xl">🔭</span>
                  <p className="text-white/40 font-bold">Ei kohteita tällä suodatuksella</p>
                  <button onClick={clearFilter}
                    className="text-sm font-bold px-4 py-2 rounded-xl border text-[#6b76ff]"
                    style={{ borderColor: 'rgba(107,118,255,.3)' }}>
                    Näytä kaikki
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Detail panel */}
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
                <div className="min-w-0">
                  <h2 className="font-black text-white text-xl leading-tight">{selectedActivity.name}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {(() => {
                      const open = isOpenNow(selectedActivity.openingHours)
                      return open !== undefined ? (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${open ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/10 text-red-400/60'}`}>
                          {open ? `● ${t('common.open')}` : `○ ${t('common.closed')}`}
                        </span>
                      ) : null
                    })()}
                    {selectedActivity.fee === false && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">{t('common.free_badge')}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedActivity(null)} className="p-2 rounded-full text-white/40 hover:text-white shrink-0 ml-2"
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
              {selectedActivity.fee === true && selectedActivity.charge && (
                <div className="flex items-center gap-2 text-amber-400/70 text-sm">
                  <Ticket size={13} /> {selectedActivity.charge}
                </div>
              )}
              <div className="flex gap-3 pt-1 flex-wrap">
                {selectedActivity.www && (
                  <a href={/^https?:\/\//i.test(selectedActivity.www) ? selectedActivity.www : '#'} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-black"
                    style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                    <Globe size={13} /> {ctaLabel(selectedActivity, t)}
                  </a>
                )}
                {onShowOnMap && selectedActivity.lat && selectedActivity.lon && (
                  <button onClick={() => { onShowOnMap(selectedActivity.lat!, selectedActivity.lon!, selectedActivity.name); setSelectedActivity(null) }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white/70 text-sm font-bold"
                    style={{ background: 'rgba(255,255,255,.08)' }}>
                    <MapIcon size={13} /> {t('idea.on_map')}
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
