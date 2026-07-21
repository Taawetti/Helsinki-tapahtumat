'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Event, Restaurant, Activity } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

// Static imports are safe here: MapView is always loaded with { ssr: false }.
// The webpack alias in next.config.ts forces both this ESM import and the CJS
// require() inside leaflet.markercluster to share the same module instance,
// so markerClusterGroup is reachable via (L as any).default after the side-effect.
import * as L from 'leaflet'
import 'leaflet.markercluster'

// ── Types ─────────────────────────────────────────────────

export interface MapTarget {
  lat: number
  lon: number
  name: string
  zoom?: number
  type?: 'event' | 'restaurant' | 'activity'
}

interface Props {
  events: Event[]
  onEventClick: (event: Event) => void
  mapTarget?: MapTarget | null
  onTargetConsumed?: () => void
}

type Layers = { events: boolean; restaurants: boolean; activities: boolean }

// ── Constants ─────────────────────────────────────────────

const HELSINKI_CENTER: [number, number] = [60.1699, 24.9384]

const LAYER_META = [
  { key: 'events'      as const, label: '🎟 Tapahtumat', bg: 'linear-gradient(150deg,#6b76ff,#5059e6)' },
  { key: 'restaurants' as const, label: '🍽 Ravintolat',  bg: 'linear-gradient(150deg,#2563eb,#5f96ff)' },
  { key: 'activities'  as const, label: '🧖 Tekemistä',   bg: 'linear-gradient(150deg,#10b981,#5fd9a6)' },
]

// ── Color helpers ─────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function eventColor(event: Event): { color: string; emoji: string } {
  const text = [event.title, event.shortDescription, ...event.categories].join(' ').toLowerCase()
  if (event.isFree) return { color: '#10b981', emoji: '🎁' }
  if (/keikka|konsertti|live|bändi|musiikki/.test(text)) return { color: '#a855f7', emoji: '🎸' }
  if (/yökerho|nightclub|bileet|disko|rave|klubi|dj/.test(text)) return { color: '#ec4899', emoji: '🌙' }
  if (/baari|pub|bar|olut|beer|viini/.test(text)) return { color: '#f59e0b', emoji: '🍺' }
  if (/teatteri|tanssi|näytelmä|ooppera|baletti/.test(text)) return { color: '#ef4444', emoji: '🎭' }
  if (/taide|galleria|näyttely|museo/.test(text)) return { color: '#06b6d4', emoji: '🎨' }
  if (/urheilu|jalkapallo|jääkiekko|ottelu/.test(text)) return { color: '#3b82f6', emoji: '⚽' }
  return { color: '#0072C6', emoji: '📍' }
}

// Ravintolapinnien pohjaväri = design-tokenin sininen #5f96ff; tyyppi näkyy emojista
function restaurantColor(type: Restaurant['type']): { color: string; emoji: string } {
  switch (type) {
    case 'ravintola': return { color: '#5f96ff', emoji: '🍽' }
    case 'kahvila':   return { color: '#5f96ff', emoji: '☕' }
    case 'baari':     return { color: '#5f96ff', emoji: '🍸' }
    case 'yokerho':   return { color: '#5f96ff', emoji: '🌃' }
    case 'pikaruoka': return { color: '#5f96ff', emoji: '🍔' }
    default:          return { color: '#5f96ff', emoji: '📍' }
  }
}

// Tekemistä-pinnien pohjaväri = design-tokenin vihreä #5fd9a6; kategoria emojista
function activityColor(category: string): { color: string; emoji: string } {
  switch (category) {
    case 'sauna':      return { color: '#5fd9a6', emoji: '🧖' }
    case 'museo':      return { color: '#5fd9a6', emoji: '🏛' }
    case 'nahtavyys':  return { color: '#5fd9a6', emoji: '📍' }
    case 'galleria':   return { color: '#5fd9a6', emoji: '🎨' }
    case 'nakopaikka': return { color: '#5fd9a6', emoji: '🔭' }
    case 'uimaranta':  return { color: '#5fd9a6', emoji: '🏊' }
    case 'puisto':     return { color: '#5fd9a6', emoji: '🌿' }
    case 'markkina':   return { color: '#5fd9a6', emoji: '🏪' }
    case 'urheilu':    return { color: '#5fd9a6', emoji: '⚽' }
    default:           return { color: '#5fd9a6', emoji: '✨' }
  }
}

function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : null
}

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createClusterIcon(cluster: any, color: string) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 32 : count < 100 ? 38 : 44
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid rgba(255,255,255,0.88);box-shadow:0 2px 10px rgba(0,0,0,0.55),0 0 0 4px ${color}40;display:flex;align-items:center;justify-content:center;font-size:${count < 10 ? 13 : 11}px;font-weight:900;color:#fff;font-family:-apple-system,sans-serif;letter-spacing:-.02em">${count}</div>`,
    className: '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iconSize: [size, size] as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iconAnchor: [size / 2, size / 2] as any,
  })
}

function makePinIcon(color: string, emoji: string, round = false) {
  const shape = round
    ? `border-radius:50%`
    : `border-radius:50% 50% 50% 4px;transform:rotate(-45deg)`
  const inner = round ? emoji : `<span style="transform:rotate(45deg)">${emoji}</span>`
  return L.divIcon({
    html: `<div style="width:30px;height:30px;${shape};background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.6),0 0 10px ${color}66;display:flex;align-items:center;justify-content:center;font-size:13px">${inner}</div>`,
    className: '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iconSize: [30, 30] as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iconAnchor: (round ? [15, 15] : [15, 26]) as any,
  })
}

// ── Sub-filter definitions ────────────────────────────────

const EVENT_SUBS = [
  { key: 'keikka',   emoji: '🎸', label: 'Keikka',      color: '#a855f7', tKey: 'legend.concert' as const },
  { key: 'yoelama',  emoji: '🌙', label: 'Yöelämä',     color: '#ec4899', tKey: 'legend.nightlife' as const },
  { key: 'baari',    emoji: '🍺', label: 'Baari',        color: '#f59e0b', tKey: 'legend.bar' as const },
  { key: 'teatteri', emoji: '🎭', label: 'Teatteri',     color: '#ef4444', tKey: 'legend.theatre' as const },
  { key: 'taide',    emoji: '🎨', label: 'Taide',        color: '#06b6d4', tKey: 'legend.art' as const },
  { key: 'urheilu',  emoji: '⚽', label: 'Urheilu',      color: '#3b82f6', tKey: 'legend.sport' as const },
  { key: 'ilmainen', emoji: '🎁', label: 'Ilmainen',     color: '#10b981', tKey: 'legend.free' as const },
] as const

// Tyyppinapit vastaavat Ravintolat-välilehden tyyppejä (design 6-kartta.png)
const REST_SUBS = [
  { key: 'ravintola', emoji: '🍽', label: 'Ruokapaikat', color: '#5f96ff', tKey: 'legend.restaurant' as const },
  { key: 'kahvila',   emoji: '☕', label: 'Kahvilat',    color: '#5f96ff', tKey: 'legend.cafe' as const },
  { key: 'baari',     emoji: '🍸', label: 'Baarit',      color: '#5f96ff', tKey: 'legend.bar' as const },
  { key: 'yokerho',   emoji: '🌃', label: 'Yökerhot',    color: '#5f96ff', tKey: 'legend.nightclub' as const },
  { key: 'pikaruoka', emoji: '🍔', label: 'Pikaruoka',   color: '#5f96ff', tKey: 'legend.fastfood' as const },
] as const

const REST_CUISINE_SUBS = [
  { key: 'awarded',       emoji: '🏆', label: 'Palkitut',       color: '#f59e0b', tKey: 'cuisine.awarded' as const },
  { key: 'nordisk',       emoji: '🇫🇮', label: 'Pohjoismainen', color: '#3b82f6', tKey: 'cuisine.nordisk' as const },
  { key: 'japanese',      emoji: '🍣', label: 'Japanilainen',   color: '#ef4444', tKey: 'cuisine.japanese' as const },
  { key: 'pizza',         emoji: '🍕', label: 'Pizza',          color: '#f97316', tKey: 'cuisine.pizza' as const },
  { key: 'italian',       emoji: '🍝', label: 'Italialainen',   color: '#10b981', tKey: 'cuisine.italian' as const },
  { key: 'asian',         emoji: '🍜', label: 'Aasialainen',    color: '#d946ef', tKey: 'cuisine.asian' as const },
  { key: 'burger',        emoji: '🍔', label: 'Hampurilaiset',  color: '#d97706', tKey: 'cuisine.burger' as const },
  { key: 'veggie',        emoji: '🌱', label: 'Kasvis',         color: '#22c55e', tKey: 'cuisine.veggie' as const },
  { key: 'kebab',         emoji: '🌯', label: 'Kebab',          color: '#f59e0b', tKey: 'cuisine.kebab' as const },
  { key: 'mediterranean', emoji: '🫒', label: 'Välimeri',       color: '#14b8a6', tKey: 'cuisine.mediterranean' as const },
  { key: 'indian',        emoji: '🍛', label: 'Intialainen',    color: '#a78bfa', tKey: 'cuisine.indian' as const },
  { key: 'seafood',       emoji: '🐟', label: 'Kala & meri',    color: '#06b6d4', tKey: 'cuisine.seafood' as const },
  { key: 'steak',         emoji: '🥩', label: 'Pihvi & grilli', color: '#ef4444', tKey: 'cuisine.steak' as const },
  { key: 'mexican',       emoji: '🌮', label: 'Meksikolainen',   color: '#22c55e', tKey: 'cuisine.mexican' as const },
  { key: 'middle_eastern',emoji: '🧆', label: 'Lähi-itä',        color: '#d97706', tKey: 'cuisine.middle_eastern' as const },
  { key: 'african',       emoji: '🌍', label: 'Afrikkalainen',    color: '#c67c52', tKey: 'cuisine.african' as const },
] as const

const ACT_SUBS = [
  { key: 'sauna',      emoji: '🧖', label: 'Sauna',         color: '#f97316', tKey: 'cat.sauna' as const },
  { key: 'museo',      emoji: '🏛', label: 'Museo',         color: '#06b6d4', tKey: 'cat.museo' as const },
  { key: 'nahtavyys',  emoji: '📍', label: 'Nähtävyys',     color: '#3b82f6', tKey: 'cat.nahtavyys' as const },
  { key: 'galleria',   emoji: '🎨', label: 'Galleria',      color: '#a855f7', tKey: 'cat.galleria' as const },
  { key: 'puisto',     emoji: '🌿', label: 'Puisto',        color: '#22c55e', tKey: 'cat.puisto' as const },
  { key: 'uimaranta',  emoji: '🏊', label: 'Uimaranta',     color: '#14b8a6', tKey: 'cat.uimaranta' as const },
  { key: 'nakopaikka', emoji: '🔭', label: 'Näköalapaikka', color: '#f59e0b', tKey: 'cat.nakopaikka' as const },
] as const

type DateFilterKey = 'today' | 'tomorrow' | 'week' | 'month' | 'custom'

const DATE_PILLS: { key: DateFilterKey; tKey: TranslationKey }[] = [
  { key: 'today',    tKey: 'date.today' },
  { key: 'tomorrow', tKey: 'map.date_tomorrow' },
  { key: 'week',     tKey: 'map.date_week' },
  { key: 'month',    tKey: 'map.date_month' },
]

function filterEventByDate(event: Event, filter: DateFilterKey, customDate: string): boolean {
  const start = new Date(event.startTime)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const add = (n: number) => new Date(today.getTime() + n * 86400000)
  switch (filter) {
    case 'today':    return start >= today && start < add(1)
    case 'tomorrow': return start >= add(1) && start < add(2)
    case 'week':     return start >= today && start < add(7)
    case 'month':    return start >= today && start < add(30)
    case 'custom': {
      if (!customDate) return true
      const cd = new Date(customDate + 'T00:00:00'); const cdn = new Date(cd.getTime() + 86400000)
      return start >= cd && start < cdn
    }
  }
}

function getEventGroup(event: Event): string {
  const text = [event.title, event.shortDescription, ...event.categories].join(' ').toLowerCase()
  if (event.isFree) return 'ilmainen'
  if (/keikka|konsertti|live|bändi|musiikki/.test(text)) return 'keikka'
  if (/yökerho|nightclub|bileet|disko|rave|klubi|dj/.test(text)) return 'yoelama'
  if (/baari|pub|bar|olut|beer|viini/.test(text)) return 'baari'
  if (/teatteri|tanssi|näytelmä|ooppera|baletti/.test(text)) return 'teatteri'
  if (/taide|galleria|näyttely|museo/.test(text)) return 'taide'
  if (/urheilu|jalkapallo|jääkiekko|ottelu/.test(text)) return 'urheilu'
  return 'muu'
}

// ── Legend data ───────────────────────────────────────────

const LEGEND_EVENT = [
  { color: '#a855f7', label: 'Keikka' },
  { color: '#ec4899', label: 'Yöelämä' },
  { color: '#f59e0b', label: 'Baari' },
  { color: '#ef4444', label: 'Teatteri' },
  { color: '#06b6d4', label: 'Taide' },
  { color: '#10b981', label: 'Ilmainen' },
]
const LEGEND_REST = [
  { color: '#f97316', label: 'Ravintola' },
  { color: '#d97706', label: 'Kahvila' },
  { color: '#d946ef', label: 'Baari' },
  { color: '#ef4444', label: 'Pikaruoka' },
]
const LEGEND_ACT = [
  { color: '#f97316', label: 'Sauna' },
  { color: '#06b6d4', label: 'Museo' },
  { color: '#3b82f6', label: 'Nähtävyys' },
  { color: '#a855f7', label: 'Galleria' },
  { color: '#22c55e', label: 'Puisto' },
  { color: '#14b8a6', label: 'Uimaranta' },
]

// ── Component ─────────────────────────────────────────────

export default function MapView({ events, onEventClick, mapTarget, onTargetConsumed }: Props) {
  const { t, lang } = useLanguage()

  const LEGEND_KEYS: Record<string, TranslationKey> = {
    'Keikka':     'legend.concert',
    'Yöelämä':   'legend.nightlife',
    'Baari':      'legend.bar',
    'Teatteri':   'legend.theatre',
    'Taide':      'legend.art',
    'Ilmainen':   'legend.free',
    'Ravintola':  'legend.restaurant',
    'Kahvila':    'legend.cafe',
    'Pikaruoka':  'legend.fastfood',
    'Sauna':      'legend.sauna',
    'Museo':      'legend.museum',
    'Nähtävyys':  'legend.sight',
    'Galleria':   'legend.gallery',
    'Puisto':     'legend.park',
    'Uimaranta':  'legend.beach',
  }

  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [layers, setLayers] = useState<Layers>({ events: true, restaurants: false, activities: false })

  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [restsLoading, setRestsLoading] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)

  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)

  const [eventGroup,   setEventGroup]   = useState<string | null>(null)
  const [restType,     setRestType]     = useState<string | null>(null)
  const [restCuisine,  setRestCuisine]  = useState<string | null>(null)
  const [actCat,       setActCat]       = useState<string | null>(null)

  const [dateFilter,  setDateFilter]  = useState<DateFilterKey>('today')
  const [customDate,  setCustomDate]  = useState('')
  const [calOpen,     setCalOpen]     = useState(false)
  const [calMonth,    setCalMonth]    = useState<{ year: number; month: number }>(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef      = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventClusterRef    = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restClusterRef     = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actClusterRef      = useRef<any>(null)

  const toggleLayer = useCallback((key: keyof Layers) => {
    setLayers(l => ({ ...l, [key]: !l[key] }))
    if (key === 'events')      { setEventGroup(null); setCalOpen(false) }
    if (key === 'restaurants') { setRestType(null); setRestCuisine(null) }
    if (key === 'activities')  setActCat(null)
  }, [])

  // ── Init map ─────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl
    const map = L.map(containerRef.current, { center: HELSINKI_CENTER, zoom: 12, zoomControl: true })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd', maxZoom: 20,
    }).addTo(map)
    mapRef.current = map

    // With the webpack alias (next.config.ts), the static 'leaflet.markercluster'
    // side-effect import patches the same CJS exports object that our L references.
    // markerClusterGroup lands on (L as any).default (CJS interop wrapper).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Lcjs = (L as any).default ?? L
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasMCG = typeof (Lcjs as any).markerClusterGroup === 'function'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mkCluster = (color: string) => hasMCG
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (Lcjs as any).markerClusterGroup({
          chunkedLoading: true,
          maxClusterRadius: 55,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          zoomToBoundsOnClick: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          iconCreateFunction: (cluster: any) => createClusterIcon(cluster, color),
        })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (L as any).layerGroup()

    eventClusterRef.current = mkCluster('#6b76ff')
    restClusterRef.current  = mkCluster('#5f96ff')
    actClusterRef.current   = mkCluster('#5fd9a6')

    map.addLayer(eventClusterRef.current)
    setTimeout(() => { if (mapRef.current) mapRef.current.invalidateSize() }, 120)
    setMapReady(true)

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  // ── Sync cluster layers to layer toggle state ─────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const sync = (cluster: any, on: boolean) => {
      if (!cluster) return
      if (on && !map.hasLayer(cluster)) map.addLayer(cluster)
      else if (!on && map.hasLayer(cluster)) map.removeLayer(cluster)
    }
    sync(eventClusterRef.current, layers.events)
    sync(restClusterRef.current,  layers.restaurants)
    sync(actClusterRef.current,   layers.activities)
  }, [mapReady, layers])

  // ── Fly to mapTarget when map ready ──────────────────────
  useEffect(() => {
    if (!mapReady || !mapTarget || !mapRef.current) return
    // Auto-enable relevant layer
    if (mapTarget.type === 'restaurant') setLayers(l => ({ ...l, restaurants: true }))
    else if (mapTarget.type === 'activity') setLayers(l => ({ ...l, activities: true }))

    const timer = setTimeout(() => {
      if (!mapRef.current) return
      mapRef.current.flyTo([mapTarget.lat, mapTarget.lon], mapTarget.zoom ?? 16, { duration: 1.2, easeLinearity: 0.5 })
      L.popup({ className: 'dark-popup', closeButton: true })
        .setLatLng([mapTarget.lat, mapTarget.lon])
        .setContent(`<p style="color:#fff;font-family:Inter,sans-serif;font-size:13px;font-weight:700;margin:0;padding:2px 0">📍 ${mapTarget.name}</p>`)
        .openOn(mapRef.current)
      onTargetConsumed?.()
    }, 350)
    return () => clearTimeout(timer)
  }, [mapReady, mapTarget, onTargetConsumed])

  // ── Fetch data on demand ──────────────────────────────────
  useEffect(() => {
    if (!layers.restaurants || restaurants.length > 0 || restsLoading) return
    setRestsLoading(true)
    fetch('/api/restaurants').then(r => r.json())
      .then(d => setRestaurants(d.restaurants ?? []))
      .catch(() => {}).finally(() => setRestsLoading(false))
  }, [layers.restaurants, restaurants.length, restsLoading])

  useEffect(() => {
    if (!layers.activities || activities.length > 0 || activitiesLoading) return
    setActivitiesLoading(true)
    fetch('/api/activities').then(r => r.json())
      .then(d => setActivities((d.activities ?? []).slice(0, 400)))
      .catch(() => {}).finally(() => setActivitiesLoading(false))
  }, [layers.activities, activities.length, activitiesLoading])

  // ── Event markers ─────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !eventClusterRef.current) return
    const cluster = eventClusterRef.current
    cluster.clearLayers()
    if (!layers.events) return
    events.forEach((event) => {
      if (!event.location?.lat || !event.location?.lon) return
      if (eventGroup && getEventGroup(event) !== eventGroup) return
      if (!filterEventByDate(event, dateFilter, customDate)) return
      const { color, emoji } = eventColor(event)
      const icon = makePinIcon(color, emoji, false)
      const time = new Date(event.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
      const popup = `<div style="font-family:Inter,sans-serif;min-width:180px;max-width:220px">
        ${event.image ? `<img src="${event.image}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px" loading="lazy"/>` : ''}
        <p style="font-weight:700;font-size:13px;margin:0 0 4px;color:#fff;line-height:1.3">${esc(event.title)}</p>
        <p style="font-size:11px;color:${color};margin:0 0 2px;font-weight:600">${time}${event.isFree ? ' · ' + t('map.free_popup') : ''}</p>
        <p style="font-size:11px;color:#777;margin:0">${esc(event.location?.name)}</p>
      </div>`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const marker = L.marker([event.location.lat, event.location.lon] as any, { icon })
      marker.bindPopup(popup, { className: 'dark-popup', maxWidth: 240 })
      marker.on('click', () => onEventClick(event))
      cluster.addLayer(marker)
    })
  }, [mapReady, events, onEventClick, layers.events, eventGroup, dateFilter, customDate, t, lang])

  // ── Restaurant markers ────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !restClusterRef.current) return
    const cluster = restClusterRef.current
    cluster.clearLayers()
    if (!layers.restaurants) return
    restaurants.forEach((r) => {
      if (!r.lat || !r.lon) return
      if (restType && r.type !== restType) return
      if (restCuisine) {
        if (restCuisine === 'awarded' && !r.featured) return
        if (restCuisine !== 'awarded' && !r.cuisineCategories.includes(restCuisine)) return
      }
      const { color, emoji } = restaurantColor(r.type)
      const dist = userPos ? haversine(userPos[0], userPos[1], r.lat!, r.lon!) : null
      const icon = makePinIcon(color, emoji, true)
      const popup = `<div style="font-family:Inter,sans-serif;min-width:160px;max-width:210px">
        <p style="font-weight:700;font-size:13px;margin:0 0 4px;color:#fff">${esc(r.name)}</p>
        ${r.description ? `<p style="font-size:11px;color:${color};margin:0 0 3px;font-weight:600;text-transform:capitalize">${esc(r.description)}</p>` : ''}
        ${r.address ? `<p style="font-size:11px;color:#888;margin:0 0 3px">${esc(r.address)}${r.city && r.city !== 'Helsinki' ? `, ${esc(r.city)}` : ''}</p>` : ''}
        ${dist !== null ? `<p style="font-size:11px;color:#aaa;margin:0 0 4px">📍 ${fmtDist(dist)} ${t('map.dist_away')}</p>` : ''}
        ${safeUrl(r.www) ? `<a href="${safeUrl(r.www)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#a3abff;font-weight:600;text-decoration:none">${t('common.website')} →</a>` : ''}
        ${r.phone ? `<p style="font-size:11px;color:#aaa;margin:${safeUrl(r.www) ? '3px' : '0'} 0 0">${r.phone}</p>` : ''}
      </div>`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const marker = L.marker([r.lat, r.lon] as any, { icon })
      marker.bindPopup(popup, { className: 'dark-popup', maxWidth: 220 })
      cluster.addLayer(marker)
    })
  }, [mapReady, restaurants, layers.restaurants, userPos, restType, restCuisine, t, lang])

  // ── Activity markers ──────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !actClusterRef.current) return
    const cluster = actClusterRef.current
    cluster.clearLayers()
    if (!layers.activities) return
    activities.forEach((a) => {
      if (!a.lat || !a.lon) return
      if (actCat && a.category !== actCat) return
      const { color, emoji } = activityColor(a.category)
      const icon = makePinIcon(color, emoji, true)
      const popup = `<div style="font-family:Inter,sans-serif;min-width:160px;max-width:210px">
        <p style="font-weight:700;font-size:13px;margin:0 0 4px;color:#fff">${esc(a.name)}</p>
        <p style="font-size:11px;color:${color};margin:0 0 3px;font-weight:600;text-transform:capitalize">${esc(a.description)}</p>
        ${a.address ? `<p style="font-size:11px;color:#888;margin:0 0 3px">${esc(a.address)}</p>` : ''}
        ${a.fee === false ? `<p style="font-size:11px;color:#10b981;margin:0 0 3px;font-weight:600">🎁 ${t('map.free_act')}</p>` : ''}
        ${a.openingHours ? `<p style="font-size:10px;color:#666;margin:0 0 3px">${a.openingHours.split(';')[0]}</p>` : ''}
        ${safeUrl(a.www) ? `<a href="${safeUrl(a.www)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#a3abff;font-weight:600;text-decoration:none">${t('common.website')} →</a>` : ''}
      </div>`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const marker = L.marker([a.lat, a.lon] as any, { icon })
      marker.bindPopup(popup, { className: 'dark-popup', maxWidth: 220 })
      cluster.addLayer(marker)
    })
  }, [mapReady, activities, layers.activities, actCat, t, lang])

  // ── User position marker ──────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !userPos) return
    if (userMarkerRef.current) { try { mapRef.current.removeLayer(userMarkerRef.current) } catch {} }
    const icon = L.divIcon({
      html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 5px rgba(59,130,246,0.25)"></div>`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      className: '', iconSize: [18, 18] as any, iconAnchor: [9, 9] as any,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    userMarkerRef.current = L.marker(userPos as any, { icon, zIndexOffset: 2000 })
      .bindPopup(`<p style="color:#fff;font-family:Inter;font-size:12px;margin:0;font-weight:600">${t('map.you_are_here')}</p>`, { className: 'dark-popup' })
      .addTo(mapRef.current)
  }, [mapReady, userPos, t])

  // ── Locate me ─────────────────────────────────────────────
  const locateMe = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setUserPos(coords)
        if (mapRef.current) mapRef.current.setView(coords, 15)
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  // ── Counts ────────────────────────────────────────────────
  const eventsOnMap     = events.filter(e =>
    e.location?.lat &&
    filterEventByDate(e, dateFilter, customDate) &&
    (!eventGroup || getEventGroup(e) === eventGroup)
  ).length
  const restsOnMap      = restaurants.filter(r => {
    if (!r.lat) return false
    if (restType && r.type !== restType) return false
    if (restCuisine) {
      if (restCuisine === 'awarded' && !r.featured) return false
      if (restCuisine !== 'awarded' && !r.cuisineCategories.includes(restCuisine)) return false
    }
    return true
  }).length
  const activitiesOnMap = activities.filter(a => a.lat && (!actCat || a.category === actCat)).length

  const countParts = [
    layers.events      && eventsOnMap     > 0 && `${eventsOnMap} ${t('map.events_count')}`,
    layers.restaurants && restsOnMap      > 0 && `${restsOnMap} ${t('map.rests_count')}`,
    layers.activities  && activitiesOnMap > 0 && `${activitiesOnMap} ${t('map.acts_count')}`,
  ].filter(Boolean).join(' · ')

  const activeLegend = [
    ...(layers.events      ? LEGEND_EVENT : []),
    ...(layers.restaurants ? LEGEND_REST  : []),
    ...(layers.activities  ? LEGEND_ACT   : []),
  ]

  return (
    <div className="relative w-full rounded-2xl border border-white/8"
      style={{ height: 'calc(100dvh - 148px)', minHeight: 480, clipPath: 'inset(0 round 1rem)' }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Layer toggles ── */}
      <div className="absolute top-3 left-3 z-[1000]">
        <div className="flex gap-1.5 bg-black/85 backdrop-blur-md rounded-xl p-1.5 shadow-xl border border-white/8">
          {LAYER_META.map(opt => (
            <button key={opt.key} onClick={() => toggleLayer(opt.key)}
              className={`flex items-center gap-1.5 rounded-lg text-xs font-black transition-all shrink-0 whitespace-nowrap px-2 py-1.5 sm:px-3 ${
                layers[opt.key] ? 'text-white shadow-sm' : 'text-white/35 hover:text-white/60'
              }`}
              style={layers[opt.key] ? { background: opt.bg } : {}}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${layers[opt.key] ? 'bg-white' : 'bg-white/20'}`} />
              <span className="sm:hidden">{opt.key === 'events' ? '🎟' : opt.key === 'restaurants' ? '🍽' : '🧖'}</span>
              <span className="hidden sm:inline">{opt.key === 'events' ? t('map.layer_events') : opt.key === 'restaurants' ? t('map.layer_restaurants') : t('map.layer_activities')}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Date + sub-filters stack ── */}
      <div className="absolute z-[1000] flex flex-col gap-1" style={{ top: 60, left: 8, right: 8 }}>

        {/* Date filter row — only when events layer ON */}
        {layers.events && (
          <div style={{ borderRadius: 12, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex gap-1 overflow-x-auto px-2 py-1.5" style={{ scrollbarWidth: 'none' }}>
              {DATE_PILLS.map(dp => (
                <button key={dp.key}
                  onClick={() => { setDateFilter(dp.key); setCustomDate(''); setCalOpen(false) }}
                  className="shrink-0 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap border"
                  style={dateFilter === dp.key && customDate === ''
                    ? { background: '#6b76ff', color: '#fff', borderColor: 'transparent' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.08)' }}>
                  {t(dp.tKey)}
                </button>
              ))}
              <span className="shrink-0 w-px self-stretch my-0.5" style={{ background: 'rgba(255,255,255,0.12)' }} />
              <button
                onClick={() => setCalOpen(o => !o)}
                className="shrink-0 flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap border"
                style={calOpen || (dateFilter === 'custom' && customDate)
                  ? { background: '#6b76ff', color: '#fff', borderColor: 'transparent' }
                  : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.08)' }}>
                📅 {dateFilter === 'custom' && customDate
                  ? new Date(customDate + 'T12:00:00').toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { day: 'numeric', month: 'short' })
                  : t('map.select_date')}
              </button>
            </div>
          </div>
        )}

        {/* Row 1: event subs + restaurant type row + activity subs */}
        {(layers.events || layers.restaurants || layers.activities) && (
          <div style={{ borderRadius: 12, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex gap-1 overflow-x-auto px-2 py-1.5" style={{ scrollbarWidth: 'none' }}>
              {layers.events && EVENT_SUBS.map(sf => (
                <button key={sf.key}
                  onClick={() => setEventGroup(eventGroup === sf.key ? null : sf.key)}
                  className="shrink-0 flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap border border-white/8"
                  style={eventGroup === sf.key
                    ? { background: sf.color, color: '#fff', borderColor: 'transparent' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                  {sf.emoji} {t(sf.tKey)}
                </button>
              ))}
              {layers.events && (layers.restaurants || layers.activities) && (
                <span className="shrink-0 w-px self-stretch my-0.5" style={{ background: 'rgba(255,255,255,0.12)' }} />
              )}
              {layers.restaurants && REST_SUBS.map(sf => (
                <button key={sf.key}
                  onClick={() => { setRestType(restType === sf.key ? null : sf.key); setRestCuisine(null) }}
                  className="shrink-0 flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap border border-white/8"
                  style={restType === sf.key
                    ? { background: sf.color, color: '#fff', borderColor: 'transparent' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                  {sf.emoji} {t(sf.tKey)}
                </button>
              ))}
              {layers.restaurants && layers.activities && (
                <span className="shrink-0 w-px self-stretch my-0.5" style={{ background: 'rgba(255,255,255,0.12)' }} />
              )}
              {layers.activities && ACT_SUBS.map(sf => (
                <button key={sf.key}
                  onClick={() => setActCat(actCat === sf.key ? null : sf.key)}
                  className="shrink-0 flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap border border-white/8"
                  style={actCat === sf.key
                    ? { background: sf.color, color: '#fff', borderColor: 'transparent' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                  {sf.emoji} {t(sf.tKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Row 2: restaurant cuisine sub-filter (↳ only for Ruokapaikat —
            cuisine categories don't apply to cafés/bars/nightclubs) */}
        {layers.restaurants && restType === 'ravintola' && (
          <div style={{ borderRadius: 12, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(12px)', border: '1px solid rgba(95,150,255,0.25)' }}>
            <div className="flex gap-1 overflow-x-auto px-2 py-1.5" style={{ scrollbarWidth: 'none' }}>
              <span className="shrink-0 text-[10px] font-black self-center pr-1" style={{ color: '#5f96ff' }}>↳</span>
              {REST_CUISINE_SUBS.map(sf => (
                <button key={sf.key}
                  onClick={() => setRestCuisine(restCuisine === sf.key ? null : sf.key)}
                  className="shrink-0 flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap border border-white/8"
                  style={restCuisine === sf.key
                    ? { background: sf.color, color: '#fff', borderColor: 'transparent' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                  {sf.emoji} {t(sf.tKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mini calendar popup */}
        {calOpen && layers.events && (
          <div style={{ alignSelf: 'center', width: 282 }}>
            <div style={{ background: '#0d0d10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.9)' }}>
              {/* Month navigation */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <button onClick={() => setCalMonth(m => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 20, padding: '0 10px', lineHeight: 1 }}>‹</button>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'Inter,sans-serif' }}>
                  {new Date(calMonth.year, calMonth.month).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => setCalMonth(m => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 20, padding: '0 10px', lineHeight: 1 }}>›</button>
              </div>
              {/* Weekday headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '8px 10px 0' }}>
                {(lang === 'fi'
                  ? ['Ma','Ti','Ke','To','Pe','La','Su']
                  : ['Mo','Tu','We','Th','Fr','Sa','Su']
                ).map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter,sans-serif', paddingBottom: 4 }}>{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 10px 10px', gap: 2 }}>
                {(() => {
                  const firstDow = (new Date(calMonth.year, calMonth.month, 1).getDay() + 6) % 7
                  const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate()
                  const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() })()
                  const evCounts: Record<number, number> = {}
                  events.forEach(ev => {
                    const s = new Date(ev.startTime)
                    if (s.getFullYear() === calMonth.year && s.getMonth() === calMonth.month)
                      evCounts[s.getDate()] = (evCounts[s.getDate()] || 0) + 1
                  })
                  const cells: (number | null)[] = []
                  for (let i = 0; i < firstDow; i++) cells.push(null)
                  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
                  return cells.map((day, idx) => {
                    if (day === null) return <div key={`e${idx}`} />
                    const dateStr = `${calMonth.year}-${String(calMonth.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                    const cellMs = new Date(calMonth.year, calMonth.month, day).getTime()
                    const isPast = cellMs < todayMs
                    const isToday = cellMs === todayMs
                    const isSel = dateFilter === 'custom' && customDate === dateStr
                    const dots = evCounts[day] || 0
                    return (
                      <button key={day} disabled={isPast}
                        onClick={() => {
                          if (isSel) { setDateFilter('today'); setCustomDate('') }
                          else { setCustomDate(dateStr); setDateFilter('custom'); setCalOpen(false) }
                        }}
                        style={{
                          height: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 8, border: isToday && !isSel ? '1px solid rgba(99,102,241,0.5)' : '1px solid transparent',
                          background: isSel ? '#6b76ff' : 'transparent',
                          color: isPast ? 'rgba(255,255,255,0.18)' : '#fff',
                          fontSize: 12, fontWeight: isSel || isToday ? 700 : 400,
                          fontFamily: 'Inter,sans-serif', cursor: isPast ? 'default' : 'pointer',
                          position: 'relative',
                        }}>
                        {day}
                        {dots > 0 && !isPast && (
                          <span style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: '50%', background: isSel ? 'rgba(255,255,255,0.7)' : '#6b76ff' }} />
                        )}
                      </button>
                    )
                  })
                })()}
              </div>
              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <button onClick={() => setCalOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: 'Inter,sans-serif' }}>
                  {t('map.cal_close')}
                </button>
                {dateFilter === 'custom' && customDate && (
                  <button onClick={() => { setDateFilter('today'); setCustomDate(''); setCalOpen(false) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a3abff', fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif' }}>
                    {t('map.cal_clear')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Locate me ── */}
      <button onClick={locateMe} disabled={locating}
        className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 px-2 py-2 sm:px-3 rounded-xl bg-black/85 backdrop-blur-md border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-all shadow-lg disabled:opacity-60">
        {locating
          ? <span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(107,118,255,.5)', borderTopColor: '#6b76ff' }} />
          : <span>📍</span>}
        <span className="hidden sm:inline">{userPos ? t('common.update_loc') : t('common.locate_me')}</span>
      </button>

      {/* ── Loading indicators ── */}
      {(restsLoading || activitiesLoading) && (
        <div className="absolute bottom-16 right-3 z-[1000] flex items-center gap-2 px-3 py-2 rounded-xl bg-black/85 text-white/50 text-xs">
          <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white/70 animate-spin" />
          {restsLoading ? t('map.loading_rests') : t('map.loading_acts')}
        </div>
      )}

      {/* ── Legend ── */}
      {activeLegend.length > 0 && (
        <div className="absolute bottom-10 left-3 hidden sm:flex flex-col gap-1 bg-black/75 backdrop-blur-sm rounded-xl p-2.5 z-[1000] max-h-48 overflow-hidden">
          {activeLegend.slice(0, 12).map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}` }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter,sans-serif' }}>{t((LEGEND_KEYS[label] ?? label) as TranslationKey)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Count badge ── */}
      {countParts && (
        <div className="absolute bottom-4 right-3 bg-black/75 backdrop-blur-sm text-white/45 text-xs px-3 py-1.5 rounded-full z-[1000]">
          {countParts}
        </div>
      )}
    </div>
  )
}
