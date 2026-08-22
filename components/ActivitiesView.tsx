'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { MapPin, Globe, Phone, Navigation, Clock, Ticket, Timer, Map as MapIcon, X } from 'lucide-react'
import type { Activity, ActivityCategory } from '@/lib/types'
import { getHighlight } from '@/lib/activity-highlights'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { isOpenNow, getTodayHours } from '@/lib/opening-hours'
import { pickAttributes } from '@/lib/google-attributes'

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

// Categories always accessible outdoors — shown even without opening_hours tag
const OUTDOOR_ALWAYS_OPEN: string[] = ['uimaranta', 'puisto', 'nakopaikka', 'nahtavyys']

// ── "Helsinkiläisten suosikit" -kärkipoiminnat ────────────────────────────
// Oletusnäkymä näyttää vain ~60 lokaalisti kiinnostavinta kohdetta; loput
// (mm. ~2500 geneeristä lähipuistoa/kenttää) löytyvät kategoria-selauksesta.
const ACT_TOP_PICKS = 60
// Lokaali kiinnostavuuspaino per kategoria — helsinkiläisen makuun: saunat &
// näköpaikat kärkeen, geneeriset puistot/urheilukentät pohjalle.
const ACT_CAT_WEIGHT: Record<string, number> = {
  sauna: 5, nakopaikka: 5, uimaranta: 4, galleria: 4, markkina: 4,
  museo: 3, nahtavyys: 2, muu: 1, puisto: 1, urheilu: 0.5,
}
// Kuratoinnin arvoiset kategoriat ilman kuvaa/arvosanaakin (aidot kohteet, ei
// geneerisiä puistoja/kenttiä). Kuva tai arvosana nostaa lisäksi ikoniset puistot.
const ACT_CURATED_CATS = new Set(['sauna', 'nakopaikka', 'uimaranta', 'galleria', 'museo', 'markkina', 'nahtavyys'])
// Turistiklusteri — lokaali ei tarvitse näitä, demotoidaan kärjestä. Ankkuroitu
// koko nimeen, ettei osu niche-kohteisiin (esim. "Suomenlinna-museo",
// "Suomenlinnan merilinnoitus"), jotka kuratoinnin pitää päinvastoin nostaa.
const ACT_TOURIST_DEMOTE = /^(suomenlinna|(helsingin )?tuomiokirkko|uspenskin katedraali|temppeliaukion kirkko|senaatintori|(vanha )?kauppatori)$/i

// Rikas Google-profiili avattuun korttiin (haetaan on-demand /api/activity-google)
type ActivityGoogleData = {
  rating: number | null
  reviewCount: number | null
  ratingDistribution: Record<string, number> | null
  priceLevel: string | null
  attributes: Record<string, string[]> | null
  phone: string | null
  url: string | null
}

// ATTR_LABELS + pickAttributes jaettu ravintolakorttien kanssa → lib/google-attributes.

const OSM_DAY_FI: Record<string, string> = { Mo: 'Ma', Tu: 'Ti', We: 'Ke', Th: 'To', Fr: 'Pe', Sa: 'La', Su: 'Su' }
// OSM-muotoinen aukiolostringi → luettavat suomenkieliset rivit (yksi/päivä).
// Google-aukiolot yhdistävät päivät ', ':lla ja OSM ';':lla — tuetaan molempia.
// Päiväerotin: ';' TAI ', ' ennen viikonpäiväkoodia (iso kirjain); päivän
// sisäiset useat jaksot ("10-12,13-18") on pilkku ILMAN väliä → ne säilyvät.
function formatHoursFi(osm: string): string[] {
  if (!osm) return []
  if (osm === '24/7') return ['Auki 24/7']
  return osm.split(/;\s*|,\s+(?=[A-Z])/).map((part) => {
    let s = part.trim()
    for (const [en, fi] of Object.entries(OSM_DAY_FI)) s = s.replace(new RegExp(en, 'g'), fi)
    s = s.replace(/\boff\b/gi, 'suljettu')
    return s
  }).filter(Boolean)
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


// ── List card ─────────────────────────────────────────────

function ActivityListCard({ a, distance, rating, onShowOnMap, onOpen }: {
  a: Activity
  distance?: number
  rating?: { rating: number; reviewCount: number }
  onShowOnMap?: (lat: number, lon: number, name: string) => void
  onOpen?: (a: Activity) => void
}) {
  const { t } = useLanguage()
  const open = isOpenNow(a.openingHours)
  const highlight = getHighlight(a.name)
  const meta = CATEGORY_META[a.category]

  return (
    <div className={`rounded-2xl overflow-hidden ${onOpen ? 'cursor-pointer transition-transform active:scale-[.99]' : ''}`}
      role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(a) : undefined}
      onKeyDown={onOpen ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(a) } }) : undefined}
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.7)' }}>
      {a.image && (
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/10' }}>
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
          <p className="text-amber-300/70 text-xs leading-snug font-medium line-clamp-2">{highlight.hook}</p>
        ) : a.description ? (
          <p className="text-white/40 text-xs line-clamp-2">{a.description}</p>
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

        {(() => {
          const today = getTodayHours(a.openingHours)
          if (!today) return null
          return (
            <div className="flex items-center gap-1.5 text-white/25 text-xs">
              <Clock size={10} className="shrink-0" />
              <span className={open ? 'text-emerald-400/70' : ''}>Tänään {today}</span>
            </div>
          )
        })()}

        {a.fee === true && a.charge && (
          <div className="flex items-center gap-1 text-xs text-amber-400/70">
            <Ticket size={10} /> {a.charge}
          </div>
        )}

        <div className="flex items-center gap-3 pt-0.5 flex-wrap" onClick={e => e.stopPropagation()}>
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


// Hoikka suodatinrivi — näkyy KAIKISSA näkymissä. Korvaa entisen
// "Auta valitsemaan" -paneelin: suodattimet suoraan ruudukkoon.
function QuickSortPills({ filterOpen, filterNearby, freeOnly, onToggleOpen, onToggleNearby, onToggleFree }: {
  filterOpen: boolean
  filterNearby: boolean
  freeOnly: boolean
  onToggleOpen: () => void
  onToggleNearby: () => void
  onToggleFree: () => void
}) {
  const { t } = useLanguage()
  const on  = { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', color: '#fff' }
  const off = { background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)' }
  const pill = 'shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all'
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
      <button onClick={onToggleOpen} className={pill} style={filterOpen ? on : off}>
        🟢 {t('idea.open_now')}
      </button>
      <button onClick={onToggleNearby} className={pill} style={filterNearby ? on : off}>
        📍 {t('activities.sort_nearby')}
      </button>
      <button onClick={onToggleFree} className={pill} style={freeOnly ? on : off}>
        🆓 {t('common.free_badge')}
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
  const [venueRatings, setVenueRatings] = useState<Record<string, { rating: number; reviewCount: number; priceLevel: string | null; description?: string }>>({})
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [activityGoogle, setActivityGoogle] = useState<ActivityGoogleData | null>(null)
  const [visibleCount, setVisibleCount] = useState(48)
  // Suodatin (QuickSortPills): vain ilmaiset
  const [freeOnly, setFreeOnly] = useState(false)

  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    fetch('/api/activities')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => setActivities(data.activities ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/venue-ratings')
      .then(r => r.json())
      .then(data => setVenueRatings(data.ratings ?? {}))
      .catch(() => {})
  }, [])

  // Rikas Google-profiili haetaan vasta kun kortti avataan (lista pysyy kevyenä)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- profiilin nollaus ennen uutta hakua, kun valinta sulkeutuu
    if (!selectedActivity) { setActivityGoogle(null); return }
    const key = selectedActivity.name.toLowerCase().trim()
    let cancelled = false
    setActivityGoogle(null)
    fetch(`/api/activity-google?key=${encodeURIComponent(key)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setActivityGoogle(d.google ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedActivity])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- sivutuksen reset kategorian vaihtuessa
  useEffect(() => { setVisibleCount(48) }, [catFilter])
  // Kategorian avaus/vaihto vie listan alkuun — ei "puolesta välistä".
  // Auki/Lähellä-pillerit näkyvät nykyään myös kategorialistassa, joten
  // suodattimia ei enää nollata kategoriaan mentäessä.
  useEffect(() => { if (catFilter !== 'all') window.scrollTo(0, 0) }, [catFilter])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sivutuksen reset suodattimien muuttuessa
  useEffect(() => { setVisibleCount(48) }, [filterOpen, filterNearby, freeOnly])

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
    // Aktiviteettien rikastus tallennetaan 'act:'-avaimella; kortit hakevat
    // paljaalla nimellä. Paljasnimiset (ravintolapäällekkäisyys) ensin, sitten
    // act:-rivit yliajavat → aktiviteettikohtainen arvosana voittaa.
    Object.entries(venueRatings).forEach(([key, val]) => { if (val && !key.startsWith('act:')) m.set(key.toLowerCase(), val) })
    Object.entries(venueRatings).forEach(([key, val]) => { if (val && key.startsWith('act:')) m.set(key.slice(4).toLowerCase(), val) })
    return m
  }, [venueRatings])

  const catPool = useMemo(() => {
    if (catFilter === 'all') return activities
    return activities.filter(a => a.category === catFilter)
  }, [activities, catFilter])


  const sortedPool = useMemo(() => {
    // Oletusnäkymä (catFilter==='all') renderöi localPicksin, ei sortedPoolia —
    // ei turhaan lajitella koko ~2500 kohteen listaa pillerivalinnoilla
    if (catFilter === 'all') return []
    let filtered = [...catPool]
    if (filterOpen) filtered = filtered.filter(a => {
      // Outdoor spots without opening_hours are always accessible
      if (!a.openingHours && OUTDOOR_ALWAYS_OPEN.includes(a.category)) return true
      return isOpenNow(a.openingHours) === true
    })
    if (freeOnly) filtered = filtered.filter(a => a.fee === false)
    if (filterNearby && userPos && distMap.size > 0) {
      filtered.sort((a, b) => (distMap.get(a.id) ?? Infinity) - (distMap.get(b.id) ?? Infinity))
    } else {
      // Oletus: paras laatu ensin (painotettu Bayes-arvosana venue-ratingeista),
      // kuvalliset tasapelin kärkeen. Sama logiikka kuin ravintoloissa.
      const score = (a: Activity) => {
        const rt = ratingMap.get(a.name.toLowerCase())
        if (!rt) return 0
        return (rt.reviewCount * rt.rating + 50 * 4.2) / (rt.reviewCount + 50)
      }
      filtered.sort((a, b) => {
        const d = score(b) - score(a)
        if (d !== 0) return d
        const ia = a.image ? 1 : 0, ib = b.image ? 1 : 0
        if (ia !== ib) return ib - ia
        return (ratingMap.get(b.name.toLowerCase())?.reviewCount ?? 0) - (ratingMap.get(a.name.toLowerCase())?.reviewCount ?? 0)
      })
    }
    return filtered
  }, [catPool, filterOpen, filterNearby, freeOnly, userPos, distMap, ratingMap])

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

  // ── "✨ Helsinkiläisten suosikit" — ~60 lokaalisti kiinnostavinta ─────────
  // Kuratoitu kärki oletusnäkymään: kategoriapaino (saunat/näköpaikat kärkeen)
  // + Helsinki-kohteet edellä (muut kaupungit alas) + kuva & arvosana nostavat
  // + turistiklusteri alas. Ei suora arvostelumäärä-boostia ("maineen katto"),
  // vaan Bayes-kutistettu arvosana, ettei Suomenlinna jyrää.
  const localPicks = useMemo(() => {
    if (catFilter !== 'all') return []
    const localScore = (a: Activity): number => {
      let s = ACT_CAT_WEIGHT[a.category] ?? 1
      // Helsinki edellä: tunnettu muu kaupunki (Espoo/Vantaa…) sakotetaan,
      // tagiton kohde jää neutraaliksi (moni oikea Helsinki-kohde on tagiton)
      const c = (a.city || '').toLowerCase()
      if (c === 'helsinki') s += 1
      else if (c) s -= 2
      if (a.image) s += 3
      // Bayes-kutistus (prior 20 arvostelua @ 4.2) — harvat arvostelut eivät
      // ali- eivätkä yliarvota; ei kovaa arvostelumääräkynnystä
      const rt = ratingMap.get(a.name.toLowerCase())
      if (rt) {
        const shrunk = (rt.reviewCount * rt.rating + 20 * 4.2) / (rt.reviewCount + 20)
        s += (shrunk - 4.0) * 1.5
      }
      if (ACT_TOURIST_DEMOTE.test(a.name)) s -= 4
      return s
    }
    // Hero näytetään vain ilman kovaa suodatinta → sulje se pois ruudukosta vain
    // silloin (muuten hero voi olla kelvollinen suodatettu kohde, ei duplikaattia).
    const heroShown = !freeOnly
    // Kuratoinnin arvoiset: kiinnostava kategoria TAI kuva/arvosana on.
    const candidates = activities.filter(a =>
      (!heroShown || a.id !== heroActivity?.id) &&
      (ACT_CURATED_CATS.has(a.category) || !!a.image || ratingMap.has(a.name.toLowerCase()))
    )
    const open = (a: Activity) =>
      !a.openingHours && OUTDOOR_ALWAYS_OPEN.includes(a.category) ? true : isOpenNow(a.openingHours) === true
    let pool = candidates
    if (filterOpen) pool = pool.filter(open)
    if (freeOnly) pool = pool.filter(a => a.fee === false)
    // Lähellä-tila: puhdas etäisyysjärjestys kuratoidusta setistä (ei kategoriakattoa)
    if (filterNearby && userPos && distMap.size > 0) {
      return [...pool]
        .sort((a, b) => (distMap.get(a.id) ?? Infinity) - (distMap.get(b.id) ?? Infinity))
        .slice(0, ACT_TOP_PICKS)
    }
    const byScore = [...pool].sort((a, b) => {
      const d = localScore(b) - localScore(a)
      if (d !== 0) return d
      const ia = a.image ? 1 : 0, ib = b.image ? 1 : 0
      if (ia !== ib) return ib - ia
      return (ratingMap.get(b.name.toLowerCase())?.reviewCount ?? 0) - (ratingMap.get(a.name.toLowerCase())?.reviewCount ?? 0)
    })
    // Round-robin kategorioiden yli: monipuolinen kärki (ei 20 saunaa peräkkäin),
    // mutta paras-ensin — kategoriat parhaan kohteensa mukaan, korkeintaan CAP/kat.
    const queues = new Map<string, Activity[]>()
    for (const a of byScore) {
      const q = queues.get(a.category)
      if (q) q.push(a); else queues.set(a.category, [a])
    }
    const catOrder = [...queues.keys()].sort((x, y) =>
      localScore(queues.get(y)![0]) - localScore(queues.get(x)![0]))
    const CAP = 12
    const perCat: Record<string, number> = {}
    const picks: Activity[] = []
    let added = true
    while (picks.length < ACT_TOP_PICKS && added) {
      added = false
      for (const cat of catOrder) {
        if (picks.length >= ACT_TOP_PICKS) break
        const q = queues.get(cat)!
        const n = perCat[cat] ?? 0
        if (n >= CAP || n >= q.length) continue
        picks.push(q[n])
        perCat[cat] = n + 1
        added = true
      }
    }
    // Jos katto jätti alle 60, täytetään lopuilla parhausjärjestyksessä
    if (picks.length < ACT_TOP_PICKS) {
      const chosen = new Set(picks.map(p => p.id))
      for (const a of byScore) {
        if (picks.length >= ACT_TOP_PICKS) break
        if (!chosen.has(a.id)) picks.push(a)
      }
    }
    return picks
  }, [activities, catFilter, ratingMap, filterOpen, filterNearby, freeOnly, userPos, distMap, heroActivity])

  const clearFilter = useCallback(() => { setCatFilter('all'); setFilterOpen(false); setFilterNearby(false); setFreeOnly(false) }, [])

  return (
    <main className="max-w-6xl mx-auto px-4 pt-4 pb-24 space-y-4">

      {/* Heading */}
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">HELSINKI</p>
        <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.8rem,6vw,3rem)', letterSpacing: '-0.03em' }}>
          Aktiviteetit
        </h1>
      </div>

      {/* Loading skeleton — sama muoto kuin ladattu näkymä: hero + ruudukko */}
      {loading && (
        <div className="space-y-4">
          <div className="rounded-[22px] skeleton-shimmer" style={{ aspectRatio: '16/10' }} />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-[18px] overflow-hidden skeleton-shimmer" style={{ aspectRatio: '4/3' }} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: '-0.01em' }}>Haetaan aktiviteetteja</span>
          </div>
        </div>
      )}

      {/* Latausvirhe — ei harhaanjohtavaa tyhjää näkymää */}
      {!loading && loadError && activities.length === 0 && (
        <div className="rounded-2xl p-6 text-center space-y-3 my-4" style={{ background: 'rgba(255,80,80,.06)', border: '1px solid rgba(255,80,80,.2)' }}>
          <p className="text-4xl">📡</p>
          <p className="text-white font-black">{t('activities.error')}</p>
          <button onClick={() => window.location.reload()}
            className="rounded-xl px-5 py-3 font-black text-white"
            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
            Yritä uudelleen
          </button>
        </div>
      )}

      {!loading && !(loadError && activities.length === 0) && (
        <>
          {/* ═══ ETUSIVU (catFilter 'all') — etusivun tyyli: hero → kategoriat →
               Auta valitsemaan → yksi ruudukko (ei karuselleja) ═══ */}
          {catFilter === 'all' && (
            <>
              {/* Hero piilotetaan kun kova suodatin (🆓/★) on päällä — ettei
                  ylänosto riitele suodatetun ruudukon kanssa */}
              {heroActivity && !freeOnly && (
                <ActivityHero
                  a={heroActivity}
                  distance={distMap.get(heroActivity.id)}
                  rating={ratingMap.get(heroActivity.name.toLowerCase())}
                  onShowOnMap={onShowOnMap}
                />
              )}

              <CategoryGrid onSelect={setCatFilter} />

              <QuickSortPills filterOpen={filterOpen} filterNearby={filterNearby} freeOnly={freeOnly} onToggleOpen={handleToggleOpen} onToggleNearby={handleToggleNearby} onToggleFree={() => setFreeOnly(v => !v)} />

              {/* Kärkipoiminnat: ~60 lokaalisti kiinnostavinta. Loput kategorioittain yltä. */}
              {localPicks.length > 0 ? (
                <section className="space-y-3">
                  <h2 className="font-black text-white text-[18px]" style={{ letterSpacing: '-0.02em' }}>
                    ✨ Helsinkiläisten suosikit
                  </h2>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
                    {localPicks.map(a => (
                      <ActivityListCard key={a.id} a={a} distance={distMap.get(a.id)}
                        rating={ratingMap.get(a.name.toLowerCase())} onShowOnMap={onShowOnMap} onOpen={setSelectedActivity} />
                    ))}
                  </div>
                  {localPicks.length >= ACT_TOP_PICKS && (
                    <p className="text-center text-[13px] font-bold text-white/35 pt-1">
                      Löydä lisää selaamalla kategorioita ↑
                    </p>
                  )}
                </section>
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

          {/* ═══ KATEGORIAN PYSTYLISTA — alleviivatabit + yksipalstainen lista ═══ */}
          {catFilter !== 'all' && (
            <>
              <ActSubTabs active={catFilter} onSelect={setCatFilter} />

              <h2 className="font-black text-white text-[19px]" style={{ letterSpacing: '-0.02em' }}>
                {CATEGORY_META[catFilter].emoji} {CATEGORY_META[catFilter].label}
                <span className="text-white/30 text-[14px] font-bold"> · {sortedPool.length} kohdetta</span>
              </h2>

              <QuickSortPills filterOpen={filterOpen} filterNearby={filterNearby} freeOnly={freeOnly} onToggleOpen={handleToggleOpen} onToggleNearby={handleToggleNearby} onToggleFree={() => setFreeOnly(v => !v)} />

              {sortedPool.length > 0 ? (
                <>
                  {/* Mobiilissa pystylista; leveällä 2-3 vierekkäin kuten ennen */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
                    {sortedPool.slice(0, visibleCount).map(a => (
                      <ActivityListCard key={a.id} a={a} distance={distMap.get(a.id)}
                        rating={ratingMap.get(a.name.toLowerCase())} onShowOnMap={onShowOnMap} onOpen={setSelectedActivity} />
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
              )}
            </>
          )}
        </>
      )}

      {/* Detail panel */}
      {selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSelectedActivity(null)}>
          <div className="w-full max-w-2xl mx-auto rounded-t-[28px] overflow-y-auto animate-sheet-up"
            style={{ background: '#0f0f13', border: '1px solid rgba(255,255,255,.1)', maxHeight: '85vh', overscrollBehavior: 'contain' }}
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
              {(() => {
                // Googlen tiivistelmä (esim. Löyly, Kiasma) ensin — laadukasta
                // suomenkielistä esittelyä; muuten OSM-kuvaus kuten ennen.
                const nk = selectedActivity.name.toLowerCase().trim()
                const gDesc = venueRatings[`act:${nk}`]?.description ?? venueRatings[nk]?.description ?? selectedActivity.description
                return gDesc ? <p className="text-white/70 text-sm leading-relaxed">{gDesc}</p> : null
              })()}

              {/* Arvosana + tähtijakauma (jakauma haetaan avattaessa) */}
              {(() => {
                const rt = ratingMap.get(selectedActivity.name.toLowerCase())
                const rating = activityGoogle?.rating ?? rt?.rating ?? null
                const count = activityGoogle?.reviewCount ?? rt?.reviewCount ?? null
                if (rating == null) return null
                const dist = activityGoogle?.ratingDistribution
                const total = dist ? Object.values(dist).reduce((a, b) => a + b, 0) : 0
                return (
                  <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,.04)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-black" style={{ color: '#e8c06a' }}>★ {rating.toFixed(1)}</span>
                      {count != null && <span className="text-white/40 text-xs font-bold">{fmtReviews(count)} arvostelua</span>}
                    </div>
                    {dist && total > 0 && (
                      <div className="mt-2 space-y-1">
                        {[5, 4, 3, 2, 1].map((star) => {
                          const n = dist[String(star)] ?? 0
                          const pct = total > 0 ? Math.round((n / total) * 100) : 0
                          return (
                            <div key={star} className="flex items-center gap-2">
                              <span className="text-white/40 text-[10px] w-3 text-right">{star}</span>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#e8c06a' }} />
                              </div>
                              <span className="text-white/30 text-[10px] w-8 text-right">{pct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}

              {selectedActivity.address && (
                <div className="flex items-center gap-2 text-white/30 text-sm">
                  <MapPin size={13} /> {selectedActivity.address}
                </div>
              )}

              {/* Aukiolot — koko viikko luettavasti (suomeksi) */}
              {selectedActivity.openingHours && (
                <div className="flex items-start gap-2 text-white/40 text-sm">
                  <Clock size={13} className="mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    {formatHoursFi(selectedActivity.openingHours).map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hintataso */}
              {activityGoogle?.priceLevel && (
                <div className="text-sm font-black text-emerald-400/80">{activityGoogle.priceLevel}</div>
              )}

              {/* Ominaisuudet (esteettömyys, mukavuudet, lapset…) */}
              {(() => {
                // 12 eikä 10: arvojärjestyksen jälkeen kahteen viimeiseen mahtuu varaus-
                // ja yleisötietoa, joka jäi aiemmin kokonaan pois. Pillit rivittyvät.
                const tags = pickAttributes(activityGoogle?.attributes ?? null, 12)
                if (!tags.length) return null
                return (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {tags.map((tg, i) => (
                      <span key={i} className="text-[11px] font-bold px-2 py-1 rounded-full text-white/60" style={{ background: 'rgba(255,255,255,.06)' }}>
                        {tg.emoji} {tg.label}
                      </span>
                    ))}
                  </div>
                )
              })()}
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
                {(activityGoogle?.phone ?? selectedActivity.phone) && (
                  <a href={`tel:${activityGoogle?.phone ?? selectedActivity.phone}`}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white/70 text-sm font-bold"
                    style={{ background: 'rgba(255,255,255,.08)' }}>
                    <Phone size={13} /> {activityGoogle?.phone ?? selectedActivity.phone}
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
