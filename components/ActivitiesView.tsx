'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, MapPin, Globe, Phone, X, ChevronDown, Navigation, Clock, Ticket, Timer, Map as MapIcon } from 'lucide-react'
import type { Activity, ActivityCategory } from '@/lib/types'
import {
  type TouristTheme,
  type AttractionHighlight,
  TOURIST_THEME_META,
  THEME_CATEGORIES,
  getHighlight,
} from '@/lib/activity-highlights'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

// ── Constants ─────────────────────────────────────────────

const PAGE_SIZE = 48

const CATEGORY_META: Record<ActivityCategory, { label: string; emoji: string }> = {
  sauna:      { label: 'Sauna',           emoji: '🧖' },
  museo:      { label: 'Museo',           emoji: '🏛' },
  nahtavyys:  { label: 'Nähtävyys',       emoji: '📍' },
  galleria:   { label: 'Galleria',        emoji: '🎨' },
  nakopaikka: { label: 'Näköalapaikka',   emoji: '🔭' },
  uimaranta:  { label: 'Uimaranta',       emoji: '🏊' },
  puisto:     { label: 'Puisto',          emoji: '🌿' },
  markkina:   { label: 'Tori & halli',    emoji: '🏪' },
  urheilu:    { label: 'Urheilu',         emoji: '⚽' },
  muu:        { label: 'Muu',             emoji: '✨' },
}

const CHIP_CATEGORIES: ActivityCategory[] = [
  'sauna', 'museo', 'nahtavyys', 'galleria', 'nakopaikka',
  'uimaranta', 'puisto', 'markkina', 'urheilu',
]

// Expanded top picks with theme tags
type TopPick = {
  name: string; emoji: string; note: string; noteEn?: string
  themes: TouristTheme[]; defaultPick?: boolean
}

const TOP_PICKS: TopPick[] = [
  { name: 'Löyly',                emoji: '🔥', note: 'Design-sauna merellä, Hernesaaressa. Ravintola, terassi & lounas.', noteEn: 'Award-winning design sauna by the sea in Hernesaari. Restaurant, terrace & lunch.', themes: ['sauna'], defaultPick: true },
  { name: 'Allas Sea Pool',        emoji: '🌊', note: 'Meressä uiminen Etelärannassa — kolme allasta, sauna, ravintola.', noteEn: 'Sea swimming at South Harbour — three pools, sauna and restaurant.', themes: ['sauna', 'ulkoilu'], defaultPick: true },
  { name: 'Kotiharjun sauna',      emoji: '🪵', note: 'Helsingin vanhin julkinen puusauna (1928). Kallio.', noteEn: "Helsinki's oldest public wood-fired sauna (1928). In Kallio.", themes: ['sauna'], defaultPick: true },
  { name: 'Suomenlinna',           emoji: '⛵', note: 'Unescon maailmanperintökohde — lautalla 15 min Kauppatorilta.', noteEn: 'UNESCO World Heritage fortress island — 15 min ferry from Market Square.', themes: ['historia', 'ulkoilu'], defaultPick: true },
  { name: 'Temppeliaukion kirkko', emoji: '⛪', note: 'Kallioon louhittu kirkko — yksi Helsingin tunnetuimmista.', noteEn: "Church carved into solid rock — one of Helsinki's most iconic sights.", themes: ['historia'], defaultPick: true },
  { name: 'Kansallismuseo',        emoji: '🏛', note: 'Suomen historian kattavin kokoelma Töölössä.', noteEn: "Finland's most comprehensive history collection in Töölö.", themes: ['historia', 'taide'], defaultPick: true },
  { name: 'HAM Helsinki',          emoji: '🎨', note: 'Helsingin taidemuseo — nykytaide Tennispalatsissa.', noteEn: 'Helsinki Art Museum — contemporary art in the Tennis Palace.', themes: ['taide'], defaultPick: true },
  { name: 'Kauppahalli',           emoji: '🧅', note: 'Helsingin Kauppahalli — ruokakulttuuria vuodesta 1889.', noteEn: 'Helsinki Market Hall — food culture since 1889.', themes: ['historia', 'ilmainen'], defaultPick: true },
  // Taide-lisäykset
  { name: 'Ateneum',               emoji: '🖼',  note: 'Suomen suurin taidekokoelma — kultakausi ja mestarit.', noteEn: "Finland's largest art collection — Golden Age and masters.", themes: ['taide'] },
  { name: 'Kiasma',                emoji: '🌀',  note: 'Nykytaidemuseo Steven Hollin ikonisessa kaarirakenuksessa.', noteEn: "Contemporary art museum in Steven Holl's iconic curved building.", themes: ['taide'] },
  { name: 'Amos Rex',              emoji: '🎭',  note: 'Kokeellinen taidemuseo maan alla Lasipalatsin alla.', noteEn: 'Experimental art museum underground beneath the Lasipalatsi.', themes: ['taide'] },
  // Perhe
  { name: 'Linnanmäki',            emoji: '🎢',  note: 'Suomen suosituin huvipuisto, yli 40 laitetta (1950).', noteEn: "Finland's most popular amusement park, 40+ rides (since 1950).", themes: ['perhe'] },
  { name: 'Korkeasaari',           emoji: '🦁',  note: 'Saarieläintarha — lautalla 20 min Kauppatorilta (1889).', noteEn: 'Island zoo — 20 min ferry from Market Square (since 1889).', themes: ['perhe', 'ulkoilu'] },
  { name: 'Heureka',               emoji: '🔬',  note: 'Interaktiivinen tiedekeskus koko perheelle Vantaalla.', noteEn: 'Interactive science centre for the whole family in Vantaa.', themes: ['perhe'] },
  // Ulkoilu
  { name: 'Pihlajasaari',          emoji: '🏖',  note: 'Helsinkiläisten kesäsuosikki — hiekkaranta lautalla 10 min.', noteEn: "Helsinkians' summer favourite — sandy beach, 10 min ferry.", themes: ['ulkoilu'] },
  { name: 'Sibelius-monumentti',   emoji: '🎵',  note: '600 teräsputkea Sibelius-puistossa — maksuton käynti.', noteEn: '600 steel pipes in Sibelius Park — free entry.', themes: ['ulkoilu', 'ilmainen'] },
  { name: 'Seurasaari',            emoji: '🌲',  note: 'Ulkoilmamuseo 87 historiallisella rakennuksella.', noteEn: 'Open-air museum with 87 historical buildings.', themes: ['historia', 'ulkoilu', 'ilmainen'] },
  // Ilmainen
  { name: 'Helsingin tuomiokirkko', emoji: '🕍', note: 'Ikoninen valkoinen katedraali Senaatintorilla (1852).', noteEn: 'Iconic white cathedral at Senate Square (1852).', themes: ['historia', 'ilmainen'] },
  { name: 'Uspenski-katedraali',    emoji: '🔵', note: 'Pohjois-Euroopan suurin ortodoksinen kirkko.', noteEn: "Northern Europe's largest Orthodox cathedral.", themes: ['historia', 'ilmainen'] },
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

// ── Badge chip ────────────────────────────────────────────

function BadgeChip({ text }: { text: string }) {
  const isUnesco = text === 'UNESCO'
  const isVanhin = text.includes('vanhin') || text.includes('Vanhin')
  const isAinutlaatuinen = text === 'Ainutlaatuinen'
  const cls = isUnesco
    ? 'bg-blue-500/15 text-blue-300/90 border border-blue-500/20'
    : isVanhin || isAinutlaatuinen
      ? 'bg-amber-500/15 text-amber-300/90 border border-amber-500/20'
      : 'bg-purple-500/10 text-purple-300/80 border border-purple-500/15'
  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
      {text}
    </span>
  )
}

// ── Top pick card ─────────────────────────────────────────

function TopPickCard({ pick, activity, distance, highlight, onShowOnMap }: {
  pick: TopPick
  activity?: Activity
  distance?: number
  highlight?: AttractionHighlight
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t, lang } = useLanguage()
  const open = activity?.openingHours ? isOpenNow(activity.openingHours) : undefined
  const cat = activity ? CATEGORY_META[activity.category] : null

  return (
    <div className="shrink-0 w-64 rounded-2xl border border-white/8 bg-gradient-to-b from-white/6 to-white/2 hover:from-white/8 hover:to-white/4 transition-all p-4 space-y-2">
      <div className="text-3xl leading-none">{pick.emoji}</div>

      {/* Name + open badge */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-black text-white text-sm leading-tight">{pick.name}</h3>
        {open !== undefined && (
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${open ? 'bg-green-500/15 text-green-400' : 'bg-red-500/10 text-red-400/60'}`}>
            {open ? t('common.open') : t('common.closed')}
          </span>
        )}
      </div>

      {/* Hook text (superlative) — highlighted */}
      {highlight?.hook ? (
        <p className="text-amber-300/70 text-[11px] leading-snug font-semibold">{lang === 'en' && highlight.hookEn ? highlight.hookEn : highlight.hook}</p>
      ) : (
        <p className="text-white/45 text-xs leading-relaxed">{lang === 'en' && pick.noteEn ? pick.noteEn : pick.note}</p>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {highlight?.badge && <BadgeChip text={lang === 'en' && highlight.badgeEn ? highlight.badgeEn : highlight.badge} />}
        {highlight?.duration && (
          <span className="flex items-center gap-1 text-[10px] text-white/35 font-medium">
            <Timer size={9} className="shrink-0" /> {highlight.duration}
          </span>
        )}
        {cat && activity && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/6 text-white/30">
            {cat.emoji} {t(('cat.' + activity.category) as TranslationKey)}
          </span>
        )}
        {distance !== undefined && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300/70">
            {fmtDist(distance)}
          </span>
        )}
        {activity?.fee === false && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400/70">
            {t('common.free')}
          </span>
        )}
      </div>

      {/* Practical tip */}
      {highlight?.tip && (
        <p className="text-white/25 text-[10px] italic leading-relaxed">{lang === 'en' && highlight.tipEn ? highlight.tipEn : highlight.tip}</p>
      )}

      {/* Address */}
      {activity?.address && (
        <div className="flex items-center gap-1.5 text-white/25 text-[10px]">
          <MapPin size={9} className="shrink-0" />
          <span>{activity.address}{activity.city && activity.city !== 'Helsinki' ? `, ${activity.city}` : ''}</span>
        </div>
      )}

      {/* Opening hours */}
      {activity?.openingHours && (
        <div className="flex items-center gap-1.5 text-white/20 text-[10px]">
          <Clock size={9} className="shrink-0" />
          <span>{activity.openingHours.split(';')[0]}</span>
        </div>
      )}

      {/* Links */}
      {activity && (
        <div className="flex gap-3 pt-0.5 flex-wrap">
          {activity.www && (
            <a href={/^https?:\/\//i.test(activity.www ?? '') ? activity.www! : '#'} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold text-purple-400/70 hover:text-purple-300 transition-colors">
              <Globe size={10} /> {t('common.website')}
            </a>
          )}
          {activity.phone && (
            <a href={`tel:${activity.phone}`}
              className="flex items-center gap-1 text-[10px] font-bold text-white/25 hover:text-white/50 transition-colors">
              <Phone size={10} /> {activity.phone}
            </a>
          )}
          {onShowOnMap && activity.lat && activity.lon && (
            <button
              onClick={() => onShowOnMap(activity.lat!, activity.lon!, activity.name)}
              className="flex items-center gap-1 text-[10px] font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
              <MapIcon size={10} /> {t('common.show_on_map')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Activity card ─────────────────────────────────────────

function ActivityCard({ activity, distance, highlight, onShowOnMap }: {
  activity: Activity
  distance?: number
  highlight?: AttractionHighlight
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t, lang } = useLanguage()
  const meta = CATEGORY_META[activity.category]
  const open = isOpenNow(activity.openingHours)

  return (
    <div className="rounded-2xl border border-white/6 bg-white/3 hover:bg-white/[0.05] transition-colors p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">{meta.emoji}</span>
          <h3 className="font-bold text-white text-sm leading-tight truncate">{activity.name}</h3>
        </div>
        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
          {open !== undefined && (
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${open ? 'bg-green-500/15 text-green-400' : 'bg-red-500/10 text-red-400/60'}`}>
              {open ? t('common.open') : t('common.closed')}
            </span>
          )}
          {distance !== undefined && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300/80">
              {fmtDist(distance)}
            </span>
          )}
        </div>
      </div>

      {/* Hook text if available, otherwise generic description */}
      {highlight?.hook ? (
        <p className="text-amber-300/65 text-xs leading-snug font-medium">{lang === 'en' && highlight.hookEn ? highlight.hookEn : highlight.hook}</p>
      ) : (
        <p className="text-white/40 text-xs">{activity.description}</p>
      )}

      {/* Badges + details */}
      <div className="flex flex-wrap gap-1.5 text-[10px] items-center">
        {highlight?.badge && <BadgeChip text={lang === 'en' && highlight.badgeEn ? highlight.badgeEn : highlight.badge} />}
        {highlight?.duration && (
          <span className="flex items-center gap-1 text-white/30 font-medium">
            <Timer size={9} /> {highlight.duration}
          </span>
        )}
        {activity.fee === false && (
          <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400/80">{t('common.free')}</span>
        )}
        {activity.fee === true && activity.charge && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400/80">
            <Ticket size={9} /> {activity.charge}
          </span>
        )}
        {activity.saunaFuel === 'wood' && (
          <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400/70">{t('common.wood_sauna')}</span>
        )}
        {activity.wheelchair === true && (
          <span className="px-2 py-0.5 rounded-full bg-blue-500/8 text-blue-300/50">{t('common.accessible')}</span>
        )}
      </div>

      {/* Practical tip */}
      {highlight?.tip && (
        <p className="text-white/25 text-[10px] italic leading-relaxed">{lang === 'en' && highlight.tipEn ? highlight.tipEn : highlight.tip}</p>
      )}

      {activity.openingHours && (
        <div className="flex items-start gap-1.5 text-white/25 text-xs">
          <Clock size={10} className="shrink-0 mt-0.5" />
          <span className="break-all">{activity.openingHours}</span>
        </div>
      )}

      {activity.address && (
        <div className="flex items-center gap-1.5 text-white/25 text-xs">
          <MapPin size={10} className="shrink-0" />
          <span>{activity.address}{activity.city && activity.city !== 'Helsinki' ? `, ${activity.city}` : ''}</span>
        </div>
      )}

      <div className="flex items-center gap-3 pt-0.5 flex-wrap">
        {activity.www && (
          <a href={activity.www} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-bold text-purple-400/70 hover:text-purple-300 transition-colors">
            <Globe size={10} /> {t('common.website')}
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
            {t('common.wikipedia')}
          </a>
        )}
        {onShowOnMap && activity.lat && activity.lon && (
          <button
            onClick={() => onShowOnMap(activity.lat!, activity.lon!, activity.name)}
            className="flex items-center gap-1 text-[10px] font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
            <MapIcon size={10} /> {t('common.show_on_map')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────

export default function ActivitiesView({ onShowOnMap }: {
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  const { t, lang } = useLanguage()

  const [activities, setActivities] = useState<Activity[]>([])
  const [total, setTotal] = useState(0)
  const [categoryCount, setCategoryCount] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<ActivityCategory | 'all'>('all')
  const [selectedTheme, setSelectedTheme] = useState<TouristTheme | null>(null)
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
      .catch(() => setError(t('activities.error')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { setShown(PAGE_SIZE) }, [search, catFilter, selectedTheme, sortMode, freeOnly])

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

  // Pre-compute highlight for each activity
  const highlightMap = useMemo(() => {
    const m = new Map<string, AttractionHighlight>()
    activities.forEach(a => {
      const h = getHighlight(a.name)
      if (h) m.set(a.id, h)
    })
    return m
  }, [activities])

  // Top picks filtered by selected theme
  const shownPicks = useMemo(() => {
    return selectedTheme
      ? TOP_PICKS.filter(p => p.themes.includes(selectedTheme))
      : TOP_PICKS.filter(p => p.defaultPick)
  }, [selectedTheme])

  // Match top picks with OSM activity data
  const topPicksWithData = useMemo(() => {
    const byName = new Map(activities.map(a => [a.name.toLowerCase(), a]))
    return shownPicks.map(p => ({
      pick: p,
      activity: byName.get(p.name.toLowerCase()),
      highlight: getHighlight(p.name),
    }))
  }, [activities, shownPicks])

  const filtered = useMemo(() => {
    let result = activities

    // Theme filter
    if (selectedTheme) {
      const cats = THEME_CATEGORIES[selectedTheme]
      result = result.filter(a => {
        const h = getHighlight(a.name)
        if (h?.themes.includes(selectedTheme)) return true
        if (cats.length > 0 && cats.includes(a.category)) return true
        if (selectedTheme === 'ilmainen') return a.fee === false
        return false
      })
    }

    // Category chip filter
    if (catFilter !== 'all') result = result.filter(a => a.category === catFilter)

    // Free-only filter
    if (freeOnly) result = result.filter(a => a.fee === false)

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.address.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      )
    }

    // Sort
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
  }, [activities, selectedTheme, catFilter, freeOnly, search, sortMode, userPos, distMap])

  const visible = filtered.slice(0, shown)
  const hasMore = shown < filtered.length

  const handleTheme = (theme: TouristTheme) => {
    setSelectedTheme(t => t === theme ? null : theme)
    setCatFilter('all')
  }

  return (
    <main className="max-w-6xl mx-auto px-4 pt-5 pb-24 space-y-6">

      {/* ── Heading ── */}
      <div>
        <h1 className="font-black text-white leading-none select-none"
          style={{ fontSize: 'clamp(2rem,8vw,4rem)', letterSpacing: '-0.03em' }}>
          {t('activities.heading')}
        </h1>
        <p className="text-white/25 text-sm mt-1">
          {t('activities.subtitle')}
        </p>
      </div>

      {/* ── Mitä haet tänään? ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-white/70 font-black text-sm tracking-wide uppercase">{t('activities.what_looking')}</h2>
          <p className="text-white/25 text-xs mt-0.5">{t('activities.interest_hint')}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.entries(TOURIST_THEME_META) as [TouristTheme, typeof TOURIST_THEME_META[TouristTheme]][]).map(([theme, meta]) => {
            const isSelected = selectedTheme === theme
            return (
              <button key={theme} onClick={() => handleTheme(theme)}
                className={`rounded-2xl p-3.5 text-left transition-all border ${
                  isSelected
                    ? 'border-purple-500/50 shadow-lg shadow-purple-500/10'
                    : 'border-white/6 bg-white/3 hover:bg-white/6 hover:border-white/12 active:scale-[0.98]'
                }`}
                style={isSelected ? { background: 'linear-gradient(135deg,rgba(168,85,247,0.15),rgba(236,72,153,0.1))', borderColor: 'rgba(168,85,247,0.4)' } : {}}>
                <div className="text-2xl mb-1.5 leading-none">{meta.emoji}</div>
                <div className={`font-black text-xs leading-tight ${isSelected ? 'text-white' : 'text-white/80'}`}>{t(('theme.' + theme) as TranslationKey)}</div>
                <div className="text-white/30 text-[10px] mt-0.5 leading-tight">{lang === 'en' ? meta.shortDescEn : meta.shortDesc}</div>
              </button>
            )
          })}
        </div>
        {selectedTheme && (
          <button onClick={() => setSelectedTheme(null)}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/55 transition-colors">
            <X size={11} /> {t('common.clear_selection')}
          </button>
        )}
      </section>

      {/* ── Top picks ── */}
      {!loading && (
        <section>
          <h2 className="text-white/70 font-black text-sm tracking-wide uppercase mb-3">
            {selectedTheme ? t(('theme.' + selectedTheme + '_title') as TranslationKey) : t('activities.top_picks')}
          </h2>
          <div className="flex gap-4 overflow-x-auto scrollbar-none -mx-4 px-4 pb-2">
            {topPicksWithData.map(({ pick, activity, highlight }) => (
              <TopPickCard
                key={pick.name}
                pick={pick}
                activity={activity}
                highlight={highlight}
                distance={activity?.id ? distMap.get(activity.id) : undefined}
                onShowOnMap={onShowOnMap}
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
          placeholder={t('restaurants.search_ph')}
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
        <button onClick={() => setCatFilter('all')}
          className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-black transition-all whitespace-nowrap ${
            catFilter === 'all'
              ? 'text-white shadow-lg'
              : 'text-white/40 bg-white/5 hover:bg-white/8 hover:text-white/70'
          }`}
          style={catFilter === 'all' ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)' } : {}}>
          🌍 {t('restaurants.type_all')}
          {catFilter !== 'all' && <span className="text-white/20 text-[10px] font-normal">{selectedTheme ? filtered.length : total}</span>}
        </button>
        {CHIP_CATEGORIES.map(cat => {
          const count = categoryCount[cat] ?? 0
          if (count === 0) return null
          const meta = CATEGORY_META[cat]
          return (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-black transition-all whitespace-nowrap ${
                catFilter === cat
                  ? 'text-white shadow-lg'
                  : 'text-white/40 bg-white/5 hover:bg-white/8 hover:text-white/70'
              }`}
              style={catFilter === cat ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)' } : {}}>
              {meta.emoji} {t(('cat.' + cat) as TranslationKey)}
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
          {t('activities.nearby_me')}
        </button>

        <button onClick={() => setSortMode(m => m === 'open' ? 'default' : 'open')}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
            sortMode === 'open'
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/60'
          }`}>
          <Clock size={11} /> {t('activities.sort_open')}
        </button>

        <button onClick={() => setFreeOnly(f => !f)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
            freeOnly
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/60'
          }`}>
          🎁 {t('activities.free_only')}
        </button>
      </div>

      {locError && <p className="text-orange-400/70 text-xs">{t('common.location_error')}</p>}

      {/* Active filters */}
      {(search || catFilter !== 'all' || freeOnly || sortMode !== 'default') && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-white/25 text-xs">{t('common.filters')}</span>
          {catFilter !== 'all' && (
            <button onClick={() => setCatFilter('all')}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-300/80 hover:bg-purple-500/25">
              {CATEGORY_META[catFilter].emoji} {t(('cat.' + catFilter) as TranslationKey)} <X size={10} />
            </button>
          )}
          {freeOnly && (
            <button onClick={() => setFreeOnly(false)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300/80 hover:bg-emerald-500/25">
              {t('common.free')} <X size={10} />
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
            {t('common.clear_all')}
          </button>
        </div>
      )}

      {/* Count */}
      {!loading && !error && (
        <p className="text-white/20 text-xs font-bold">
          {filtered.length.toLocaleString()} {t('activities.total')}
          {selectedTheme && ` — ${t(('theme.' + selectedTheme) as TranslationKey)}`}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-white/30 text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin shrink-0" />
            <span>{t('activities.loading')}</span>
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
            {visible.map(a => (
              <ActivityCard
                key={a.id}
                activity={a}
                distance={distMap.get(a.id)}
                highlight={highlightMap.get(a.id)}
                onShowOnMap={onShowOnMap}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button onClick={() => setShown(s => s + PAGE_SIZE)}
                className="flex items-center gap-2 text-sm font-bold px-8 py-3 rounded-xl border border-white/10 text-white/45 hover:text-white hover:border-white/20 bg-white/3 transition-all">
                <ChevronDown size={15} />
                {t('activities.load_more')} ({filtered.length - shown} {t('common.remaining')})
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
            <p className="text-white/50 font-bold">{t('common.no_results')}</p>
            <p className="text-white/25 text-sm mt-1">{t('common.try_search')}</p>
          </div>
          <button onClick={() => { setSearch(''); setCatFilter('all'); setFreeOnly(false); setSelectedTheme(null) }}
            className="text-sm font-bold px-4 py-2 rounded-xl border border-purple-500/30 text-purple-400/70 hover:text-purple-300 hover:border-purple-500/50 transition-all">
            {t('common.clear_filters')}
          </button>
        </div>
      )}
    </main>
  )
}
