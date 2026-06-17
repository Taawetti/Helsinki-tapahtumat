'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, MapPin, Globe, Phone, X, ChevronDown, Navigation, Clock, Ticket } from 'lucide-react'
import type { Activity, ActivityCategory } from '@/lib/types'

// ── Constants ─────────────────────────────────────────────

const PAGE_SIZE = 48

const CATEGORY_META: Record<ActivityCategory, { label: string; emoji: string; description: string }> = {
  sauna:      { label: 'Saunat',           emoji: '🧖', description: 'Julkiset saunat' },
  museo:      { label: 'Museot',           emoji: '🏛', description: 'Museot ja historia' },
  nahtavyys:  { label: 'Nähtävyydet',      emoji: '📍', description: 'Kohteet ja monumentit' },
  galleria:   { label: 'Galleriat',        emoji: '🎨', description: 'Taide ja galleriat' },
  nakopaikka: { label: 'Näköalapaikat',    emoji: '🔭', description: 'Panoraamanäkymät' },
  uimaranta:  { label: 'Uimarannat',       emoji: '🏊', description: 'Uimarannat ja -paikat' },
  puisto:     { label: 'Puistot',          emoji: '🌿', description: 'Puistot ja luonto' },
  markkina:   { label: 'Torit & hallit',   emoji: '🏪', description: 'Kauppahallit ja torit' },
  urheilu:    { label: 'Urheilu',          emoji: '⚽', description: 'Urheilupaikat' },
  muu:        { label: 'Muut',             emoji: '✨', description: 'Muut aktiviteetit' },
}

// Ordered chip list (omit 'muu' from chips — it'll show in "Kaikki")
const CHIP_CATEGORIES: ActivityCategory[] = [
  'sauna', 'museo', 'nahtavyys', 'galleria', 'nakopaikka',
  'uimaranta', 'puisto', 'markkina', 'urheilu',
]

// Curated top picks — shown as a featured horizontal row
const TOP_PICKS = [
  { name: 'Löyly', emoji: '🔥', note: 'Design-sauna merellä, Hernesaaressa. Ravintola, terassi & lautas.' },
  { name: 'Allas Sea Pool', emoji: '🌊', note: 'Meressä uiminen Etelärannassa — kolme allasta, sauna, ravintola.' },
  { name: 'Kotiharjun sauna', emoji: '🪵', note: 'Helsingin vanhin julkinen puusauna (1928). Kallio.' },
  { name: 'Kansallismuseo', emoji: '🏛', note: 'Suomen historian kattavin kokoelma Töölössä.' },
  { name: 'HAM Helsinki', emoji: '🎨', note: 'Helsingin taidemuseo — nykytaide Tennispalatsissa.' },
  { name: 'Suomenlinna', emoji: '⛵', note: 'Unescon maailmanperintökohde — lautalla 15 min Kauppatorilta.' },
  { name: 'Kauppahalli', emoji: '🧅', note: 'Helsingin Kauppahalli — ruokakulttuuria vuodesta 1889.' },
  { name: 'Temppeliaukion kirkko', emoji: '⛪', note: 'Kallioon louhittu kirkko, yksi Helsingin tunnetuimmista kohteista.' },
]

type SortMode = 'default' | 'nearby' | 'open'

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

function isOpenNow(hours?: string): boolean | undefined {
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

// ── Top pick card (horizontal scroll, curated) ────────────

function TopPickCard({ pick, activity, distance }: {
  pick: typeof TOP_PICKS[number]
  activity?: Activity
  distance?: number
}) {
  const open = activity?.openingHours ? isOpenNow(activity.openingHours) : undefined
  const cat = activity ? CATEGORY_META[activity.category] : null

  return (
    <div className="shrink-0 w-64 rounded-2xl border border-white/8 bg-gradient-to-b from-white/6 to-white/2 hover:from-white/8 hover:to-white/4 transition-all p-4 space-y-2">
      <div className="text-3xl leading-none">{pick.emoji}</div>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-black text-white text-sm leading-tight">{pick.name}</h3>
        {open !== undefined && (
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${open ? 'bg-green-500/15 text-green-400' : 'bg-red-500/10 text-red-400/60'}`}>
            {open ? 'Avoinna' : 'Suljettu'}
          </span>
        )}
      </div>
      <p className="text-white/45 text-xs leading-relaxed">{pick.note}</p>
      <div className="flex gap-2 flex-wrap">
        {cat && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/6 text-white/35">
            {cat.emoji} {cat.label}
          </span>
        )}
        {distance !== undefined && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300/70">
            {fmtDist(distance)}
          </span>
        )}
        {activity?.fee === false && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400/70">
            Ilmainen
          </span>
        )}
      </div>
      {activity?.address && (
        <div className="flex items-center gap-1.5 text-white/30 text-[10px]">
          <MapPin size={9} className="shrink-0" />
          <span>{activity.address}{activity.city && activity.city !== 'Helsinki' ? `, ${activity.city}` : ''}</span>
        </div>
      )}
      {activity?.openingHours && (
        <div className="flex items-center gap-1.5 text-white/25 text-[10px]">
          <Clock size={9} className="shrink-0" />
          <span>{activity.openingHours.split(';')[0]}</span>
        </div>
      )}
      {activity && (activity.www || activity.phone) && (
        <div className="flex gap-3 pt-0.5">
          {activity.www && (
            <a href={activity.www} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold text-purple-400/70 hover:text-purple-300 transition-colors">
              <Globe size={10} /> Nettisivu
            </a>
          )}
          {activity.phone && (
            <a href={`tel:${activity.phone}`}
              className="flex items-center gap-1 text-[10px] font-bold text-white/25 hover:text-white/50 transition-colors">
              <Phone size={10} /> {activity.phone}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Activity card ─────────────────────────────────────────

function ActivityCard({ activity, distance }: { activity: Activity; distance?: number }) {
  const meta = CATEGORY_META[activity.category]
  const open = isOpenNow(activity.openingHours)

  return (
    <div className="rounded-2xl border border-white/6 bg-white/3 hover:bg-white/[0.05] transition-colors p-4 space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">{meta.emoji}</span>
          <h3 className="font-bold text-white text-sm leading-tight truncate">{activity.name}</h3>
        </div>
        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
          {open !== undefined && (
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${open ? 'bg-green-500/15 text-green-400' : 'bg-red-500/10 text-red-400/60'}`}>
              {open ? 'Avoinna' : 'Suljettu'}
            </span>
          )}
          {distance !== undefined && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300/80">
              {fmtDist(distance)}
            </span>
          )}
        </div>
      </div>

      {/* Category + description */}
      <p className="text-white/40 text-xs">{activity.description}</p>

      {/* Details row */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {activity.fee === false && (
          <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400/80">Ilmainen</span>
        )}
        {activity.fee === true && activity.charge && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400/80">
            <Ticket size={9} /> {activity.charge}
          </span>
        )}
        {activity.saunaFuel === 'wood' && (
          <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400/70">🪵 Puusauna</span>
        )}
        {activity.wheelchair === true && (
          <span className="px-2 py-0.5 rounded-full bg-blue-500/8 text-blue-300/50">♿ Esteetön</span>
        )}
      </div>

      {/* Opening hours */}
      {activity.openingHours && (
        <div className="flex items-start gap-1.5 text-white/25 text-xs">
          <Clock size={10} className="shrink-0 mt-0.5" />
          <span className="break-all">{activity.openingHours}</span>
        </div>
      )}

      {/* Address */}
      {activity.address && (
        <div className="flex items-center gap-1.5 text-white/25 text-xs">
          <MapPin size={10} className="shrink-0" />
          <span>{activity.address}{activity.city && activity.city !== 'Helsinki' ? `, ${activity.city}` : ''}</span>
        </div>
      )}

      {/* Links */}
      {(activity.www || activity.phone) && (
        <div className="flex items-center gap-3 pt-0.5">
          {activity.www && (
            <a href={activity.www} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold text-purple-400/70 hover:text-purple-300 transition-colors">
              <Globe size={10} /> Nettisivu
            </a>
          )}
          {activity.phone && (
            <a href={`tel:${activity.phone}`}
              className="flex items-center gap-1 text-[10px] font-bold text-white/25 hover:text-white/50 transition-colors">
              <Phone size={10} /> {activity.phone}
            </a>
          )}
          {activity.wikipedia && (
            <a href={`https://fi.wikipedia.org/wiki/${encodeURIComponent(activity.wikipedia.replace('fi:', ''))}`}
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] font-bold text-white/20 hover:text-white/45 transition-colors">
              Wikipedia
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────

export default function ActivitiesView() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [total, setTotal] = useState(0)
  const [categoryCount, setCategoryCount] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<ActivityCategory | 'all'>('all')
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [freeOnly, setFreeOnly] = useState(false)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/activities')
      .then(r => r.json())
      .then(data => {
        setActivities(data.activities ?? [])
        setTotal(data.total ?? 0)
        setCategoryCount(data.categoryCount ?? {})
        setError('')
      })
      .catch(() => setError('Aktiviteettien lataus epäonnistui'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { setShown(PAGE_SIZE) }, [search, catFilter, sortMode, freeOnly])

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
    activities.forEach(a => {
      if (a.lat && a.lon) m.set(a.id, haversine(userPos[0], userPos[1], a.lat, a.lon))
    })
    return m
  }, [userPos, activities])

  // Top picks with matched activity data
  const topPicksWithData = useMemo(() => {
    const byName = new Map(activities.map(a => [a.name.toLowerCase(), a]))
    return TOP_PICKS.map(p => ({ pick: p, activity: byName.get(p.name.toLowerCase()) }))
  }, [activities])

  const filtered = useMemo(() => {
    let result = activities
    if (catFilter !== 'all') result = result.filter(a => a.category === catFilter)
    if (freeOnly) result = result.filter(a => a.fee === false)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.address.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      )
    }
    if (sortMode === 'nearby' && userPos) {
      result = [...result].sort((a, b) => (distMap.get(a.id) ?? Infinity) - (distMap.get(b.id) ?? Infinity))
    } else if (sortMode === 'open') {
      result = [...result].sort((a, b) => {
        const aO = isOpenNow(a.openingHours)
        const bO = isOpenNow(b.openingHours)
        if (aO && !bO) return -1
        if (!aO && bO) return 1
        return 0
      })
    }
    return result
  }, [activities, catFilter, freeOnly, search, sortMode, userPos, distMap])

  const visible = filtered.slice(0, shown)
  const hasMore = shown < filtered.length

  return (
    <main className="max-w-6xl mx-auto px-4 pt-5 pb-24 space-y-6">

      {/* ── Heading ── */}
      <div>
        <h1 className="font-black text-white leading-none select-none"
          style={{ fontSize: 'clamp(2rem,8vw,4rem)', letterSpacing: '-0.03em' }}>
          Tekemistä
        </h1>
        <p className="text-white/25 text-sm mt-1">
          Saunat, museot, nähtävyydet, galleriat ja paljon muuta — Helsinki-alue
        </p>
      </div>

      {/* ── Top picks (curated) ── */}
      {!loading && (
        <section>
          <h2 className="text-white/80 font-black text-sm tracking-wide uppercase mb-3">
            ⭐ Paras Helsingistä
          </h2>
          <div className="flex gap-4 overflow-x-auto scrollbar-none -mx-4 px-4 pb-2">
            {topPicksWithData.map(({ pick, activity }) => (
              <TopPickCard
                key={pick.name}
                pick={pick}
                activity={activity}
                distance={activity?.id ? distMap.get(activity.id) : undefined}
              />
            ))}
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
          placeholder="Hae nimellä tai osoitteella…"
          className="w-full pl-9 pr-9 py-3 bg-white/5 border border-white/8 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/40 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Category chips ── */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        <button
          onClick={() => setCatFilter('all')}
          className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-black transition-all whitespace-nowrap ${
            catFilter === 'all'
              ? 'text-white shadow-lg'
              : 'text-white/40 bg-white/5 hover:bg-white/8 hover:text-white/70'
          }`}
          style={catFilter === 'all' ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)' } : {}}>
          🌍 Kaikki
          {catFilter !== 'all' && <span className="text-white/20 text-[10px] font-normal">{total}</span>}
        </button>
        {CHIP_CATEGORIES.map(cat => {
          const count = categoryCount[cat] ?? 0
          if (count === 0) return null
          const meta = CATEGORY_META[cat]
          return (
            <button key={cat}
              onClick={() => setCatFilter(cat)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-black transition-all whitespace-nowrap ${
                catFilter === cat
                  ? 'text-white shadow-lg'
                  : 'text-white/40 bg-white/5 hover:bg-white/8 hover:text-white/70'
              }`}
              style={catFilter === cat ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)' } : {}}>
              {meta.emoji} {meta.label}
              {catFilter !== cat && <span className="text-white/20 text-[10px] font-normal">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* ── Sort & filter row ── */}
      <div className="flex flex-wrap gap-2 items-center">
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
          Lähellä minua
        </button>

        <button onClick={() => setSortMode(m => m === 'open' ? 'default' : 'open')}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
            sortMode === 'open'
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/60'
          }`}>
          <Clock size={11} /> Avoinna nyt
        </button>

        <button onClick={() => setFreeOnly(f => !f)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
            freeOnly
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/60'
          }`}>
          🎁 Ilmaiseksi
        </button>
      </div>

      {locError && <p className="text-orange-400/70 text-xs">Sijaintia ei saatu — tarkista selaimen lupa</p>}

      {/* Active filters */}
      {(search || catFilter !== 'all' || freeOnly || sortMode !== 'default') && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-white/25 text-xs">Suodattimet:</span>
          {catFilter !== 'all' && (
            <button onClick={() => setCatFilter('all')}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-300/80 hover:bg-purple-500/25">
              {CATEGORY_META[catFilter].emoji} {CATEGORY_META[catFilter].label} <X size={10} />
            </button>
          )}
          {freeOnly && (
            <button onClick={() => setFreeOnly(false)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300/80 hover:bg-emerald-500/25">
              Ilmainen <X size={10} />
            </button>
          )}
          {search && (
            <button onClick={() => setSearch('')}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/8 text-white/50 hover:bg-white/12">
              &ldquo;{search}&rdquo; <X size={10} />
            </button>
          )}
          <button onClick={() => { setSearch(''); setCatFilter('all'); setFreeOnly(false); setSortMode('default') }}
            className="text-xs text-white/25 hover:text-white/50 underline underline-offset-2">
            Tyhjennä kaikki
          </button>
        </div>
      )}

      {/* Count */}
      {!loading && !error && (
        <p className="text-white/20 text-xs font-bold">
          {filtered.length.toLocaleString('fi-FI')} kohdetta
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-white/30 text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin shrink-0" />
            <span>Haetaan aktiviteetteja kartalta…</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white/3 p-4 space-y-2">
                <div className="flex gap-2">
                  <div className="w-6 h-6 bg-white/5 rounded animate-pulse" />
                  <div className="h-4 bg-white/4 rounded animate-pulse w-3/4" />
                </div>
                <div className="h-3 bg-white/3 rounded animate-pulse w-1/2" />
                <div className="h-3 bg-white/3 rounded animate-pulse w-2/3" />
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
            {visible.map(a => <ActivityCard key={a.id} activity={a} distance={distMap.get(a.id)} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button onClick={() => setShown(s => s + PAGE_SIZE)}
                className="flex items-center gap-2 text-sm font-bold px-8 py-3 rounded-xl border border-white/10 text-white/45 hover:text-white hover:border-white/20 bg-white/3 transition-all">
                <ChevronDown size={15} />
                Lataa lisää ({filtered.length - shown} jäljellä)
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center py-24 text-center gap-4">
          <span className="text-5xl">🔭</span>
          <div>
            <p className="text-white/50 font-bold">Ei tuloksia</p>
            <p className="text-white/25 text-sm mt-1">Kokeile eri hakusanaa tai tyhjennä suodattimet</p>
          </div>
          <button onClick={() => { setSearch(''); setCatFilter('all'); setFreeOnly(false) }}
            className="text-sm font-bold px-4 py-2 rounded-xl border border-purple-500/30 text-purple-400/70 hover:text-purple-300 hover:border-purple-500/50 transition-all">
            Tyhjennä suodattimet
          </button>
        </div>
      )}
    </main>
  )
}
