'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Event, Restaurant, Activity, type ActivityCategory } from '@/lib/types'
import { getBasemap } from '@/lib/basemap'
import { isOutsideTargetAudience, onPerheTapahtuma, onSenioriTapahtuma } from '@/lib/audience'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

// Static imports are safe here: MapView is always loaded with { ssr: false }.
// The webpack alias in next.config.ts forces both this ESM import and the CJS
// require() inside leaflet.markercluster to share the same module instance,
// so markerClusterGroup is reachable via (L as any).default after the side-effect.
import * as L from 'leaflet'
import 'leaflet.markercluster'
import secondhandData from '@/data/secondhand.json'

// ── Kirpputorit karttakerrokseen ──────────────────────────
// /api/activities (OSM) ei tunne kirpputoreja, mutta /kirpputorit-oppaan
// liiketiedosto tuntee — 113 liikettä koordinaatteineen samasta reposta.
// Omistaja 31.8.2026: oppaan kategoriat (kirpputori, sauna jne) pitää
// löytyä kartalta. Moduulitasolla kerran, ei jokaisella renderillä.
const KIRPPUTORIT: Activity[] = ((secondhandData as { shops?: { name?: string; lat?: number; lon?: number; address?: string; openingHours?: string | null; www?: string | null }[] }).shops ?? [])
  .filter((x) => typeof x.lat === 'number' && typeof x.lon === 'number' && x.name)
  .map((x, i) => ({
    id: `kirppis-${i}`,
    name: x.name!,
    description: 'Kirpputori',
    category: 'kirpputori' as const,
    address: x.address ?? '',
    city: 'Helsinki',
    lat: x.lat, lon: x.lon,
    www: x.www ?? null,
    phone: null,
    openingHours: x.openingHours ?? undefined,
    image: null,
  }))

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
  /** Discover-näkymän Lista⇄Kartta-kytkin tuo listan päiväsuodattimen
      mukanaan — kartta näyttää SAMAT tapahtumat kuin lista, ei omaa
      oletusvalintaansa. Koskee vain mountausta (kartta umounttuu
      moodivaihdoksissa, joten alkuarvo on aina tuore). */
  initialDateFilter?: DateFilterKey
  initialCustomDate?: string
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
    case 'kirpputori': return { color: '#5fd9a6', emoji: '🛍' }
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
  // Peukalokoot: 32/38/44 px oli liian pieniä osua mobiilissa → 40/48/56 px
  const size = count < 10 ? 40 : count < 100 ? 48 : 56
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid rgba(255,255,255,0.88);box-shadow:0 2px 10px rgba(0,0,0,0.55),0 0 0 4px ${color}40;display:flex;align-items:center;justify-content:center;font-size:${count < 10 ? 14 : 12}px;font-weight:900;color:#fff;font-family:-apple-system,sans-serif;letter-spacing:-.02em">${count}</div>`,
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
  // 30 px → 36 px: pinnit pitää saada osuttua peukalolla mobiilissa
  return L.divIcon({
    html: `<div style="width:36px;height:36px;${shape};background:${color};border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.6),0 0 10px ${color}66;display:flex;align-items:center;justify-content:center;font-size:15px">${inner}</div>`,
    className: '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iconSize: [36, 36] as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iconAnchor: (round ? [18, 18] : [18, 31]) as any,
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
  // Perhetapahtumat näkyvät VAIN tästä valittuna — oletusnäkymä on 18–40-
  // kohderyhmän (omistaja 4.9.2026: vauvatreffit kartalla laski profiilia).
  { key: 'perhe',    emoji: '👨‍👩‍👧', label: 'Lapset & perhe', color: '#f59e0b', tKey: 'map.family' as const },
] as const

// Tyyppinapit vastaavat Ravintolat-välilehden tyyppejä (design 6-kartta.png)
const REST_SUBS = [
  { key: 'ravintola', emoji: '🍽', label: 'Ruokapaikat', color: '#5f96ff', tKey: 'map.rest_food' as const },
  { key: 'kahvila',   emoji: '☕', label: 'Kahvilat',    color: '#5f96ff', tKey: 'map.rest_cafes' as const },
  { key: 'baari',     emoji: '🍸', label: 'Baarit',      color: '#5f96ff', tKey: 'map.rest_bars' as const },
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

// Kahviloiden, baarien ja yökerhojen alakategoriat (samat todistepohjaiset
// leimat kuin Ravintolat-välilehdellä; avaimet = venue_ratings.sub_categories).
const REST_TYPE_ALASUBIT: Record<string, readonly { key: string; emoji: string; tKey: TranslationKey }[]> = {
  kahvila: [
    { key: 'klassikot',    emoji: '🎩', tKey: 'restaurants.sub_klassikot' },
    { key: 'ranskalaiset', emoji: '🥖', tKey: 'restaurants.sub_ranskalaiset' },
    { key: 'boheemit',     emoji: '📖', tKey: 'restaurants.sub_boheemit' },
    { key: 'erikois',      emoji: '☕', tKey: 'restaurants.sub_erikois' },
    { key: 'paahtimo',     emoji: '🔥', tKey: 'restaurants.sub_paahtimo' },
    { key: 'brunssi',      emoji: '🥐', tKey: 'restaurants.sub_brunssi' },
  ],
  baari: [
    { key: 'cocktail',   emoji: '🍸', tKey: 'restaurants.sub_cocktail' },
    { key: 'craft_beer', emoji: '🍺', tKey: 'restaurants.sub_olut' },
    { key: 'wine',       emoji: '🍷', tKey: 'restaurants.sub_viini' },
    { key: 'sports',     emoji: '🏟', tKey: 'restaurants.sub_urheilu' },
    { key: 'karaoke',    emoji: '🎤', tKey: 'restaurants.sub_karaoke' },
  ],
  yokerho: [
    { key: 'klubi',   emoji: '🎉', tKey: 'restaurants.sub_klubi' },
    { key: 'karaoke', emoji: '🎤', tKey: 'restaurants.sub_karaoke' },
    { key: 'tekno',   emoji: '🎧', tKey: 'restaurants.sub_tekno' },
    { key: 'katto',   emoji: '🌃', tKey: 'restaurants.sub_katto' },
  ],
}

const ACT_SUBS = [
  { key: 'sauna',      emoji: '🧖', label: 'Sauna',         color: '#f97316', tKey: 'cat.sauna' as const },
  { key: 'kirpputori', emoji: '🛍', label: 'Kirpputori',    color: '#ec4899', tKey: 'cat.kirpputori' as const },
  { key: 'museo',      emoji: '🏛', label: 'Museo',         color: '#06b6d4', tKey: 'cat.museo' as const },
  { key: 'nahtavyys',  emoji: '📍', label: 'Nähtävyys',     color: '#3b82f6', tKey: 'cat.nahtavyys' as const },
  { key: 'galleria',   emoji: '🎨', label: 'Galleria',      color: '#a855f7', tKey: 'cat.galleria' as const },
  { key: 'puisto',     emoji: '🌿', label: 'Puisto',        color: '#22c55e', tKey: 'cat.puisto' as const },
  { key: 'uimaranta',  emoji: '🏊', label: 'Uimaranta',     color: '#14b8a6', tKey: 'cat.uimaranta' as const },
  { key: 'nakopaikka', emoji: '🔭', label: 'Näköalapaikka', color: '#f59e0b', tKey: 'cat.nakopaikka' as const },
] as const

// ── Popup-kuvausten käännösavaimet ────────────────────────
// Popupit näyttävät palvelimen muotoileman kuvauksen: aktiviteeteilla se on
// suomeksi (app/api/activities/route.ts osmDescription), ravintoloilla useimmiten
// OSM:n raaka cuisine-tagi mutta uusilla avauksilla Googlen suomenkielinen
// kategoria. Englanninkieliselle käyttäjälle näytetään käännetty kategoria.

// Record<ActivityCategory, …> pitää tämän täydellisenä: uusi kategoria
// lib/types.ts:ään pysäyttää käännöksen tsc:hen eikä jää suomeksi popupiin.
const ACT_CAT_KEYS: Record<ActivityCategory, TranslationKey> = {
  sauna:      'cat.sauna',
  kirpputori: 'cat.kirpputori',
  museo:      'cat.museo',
  nahtavyys:  'cat.nahtavyys',
  galleria:   'cat.galleria',
  nakopaikka: 'cat.nakopaikka',
  uimaranta:  'cat.uimaranta',
  puisto:     'cat.puisto',
  markkina:   'cat.markkina',
  urheilu:    'cat.urheilu',
  muu:        'cat.muu',
}

// Keittiökategoria → käännösavain. 'awarded' on suodatinnappi (featured), ei
// keittiö, joten se jätetään pois. Kun ravintolalla ei ole yhtään
// cuisineCategoriesia, popup putoaa r.descriptioniin — uusilla avauksilla se on
// Googlen suomenkielinen kategoria, ks. fallback renderöintikohdassa.
const CUISINE_KEYS: Record<string, TranslationKey> = {
  nordisk:        'cuisine.nordisk',
  japanese:       'cuisine.japanese',
  pizza:          'cuisine.pizza',
  italian:        'cuisine.italian',
  asian:          'cuisine.asian',
  burger:         'cuisine.burger',
  veggie:         'cuisine.veggie',
  kebab:          'cuisine.kebab',
  mediterranean:  'cuisine.mediterranean',
  indian:         'cuisine.indian',
  seafood:        'cuisine.seafood',
  steak:          'cuisine.steak',
  mexican:        'cuisine.mexican',
  middle_eastern: 'cuisine.middle_eastern',
  african:        'cuisine.african',
  cafe:           'cuisine.cafe_dessert',
  french:         'cuisine.french',
}

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
// Pinnit ovat nyt tasoväreissä (design-tokenit): ravintolat sininen,
// tekeminen vihreä — legenda kuvaa tasot, tyyppi näkyy pinnin emojista
const LEGEND_REST = [
  { color: '#5f96ff', label: 'Ravintolat' },
]
const LEGEND_ACT = [
  { color: '#5fd9a6', label: 'Tekemistä' },
]

// ── Component ─────────────────────────────────────────────

// ── Mobiilin pudotusvalikko ───────────────────────────────
// Suodatinpillerit veivät mobiilissa kolme riviä karttatilaa (omistaja
// 31.8.2026 kuvakaappauksen kanssa): nyt jokainen suodatinryhmä on YKSI
// nappi, joka avaa vieritettävän valikon. Työpöydällä pilleririvit säilyvät.
function MapMenu({ id, open, onToggle, label, active, children }: {
  id: string
  open: string | null
  onToggle: (id: string | null) => void
  label: string
  /** Näkyykö nappi korostettuna (jokin muu kuin oletus valittuna) */
  active: boolean
  children: React.ReactNode
}) {
  const on = open === id
  return (
    <div className="relative shrink-0">
      <button onClick={() => onToggle(on ? null : id)} aria-expanded={on}
        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap border transition-all"
        style={active || on
          ? { background: '#6b76ff', color: '#fff', borderColor: 'transparent', boxShadow: '0 2px 10px -2px rgba(91,101,230,.5)' }
          // Kiinteä tumma tausta: läpinäkyvä nappi ei erottunut vaalean
          // karttapohjan päältä lainkaan (mitattu kuvakaappauksesta 31.8.).
          : { background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(10px)', color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.12)' }}>
        {label}
        <span className={`text-[9px] transition-transform ${on ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {on && (
        <div className="absolute left-0 top-full mt-1.5 z-[1002] min-w-[190px] max-h-[46vh] overflow-y-auto rounded-2xl border border-white/10 p-1.5"
          style={{ background: 'rgba(13,13,16,.98)', backdropFilter: 'blur(18px)', boxShadow: '0 18px 44px -10px rgba(0,0,0,.85)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function MapMenuItem({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-xl text-[13px] font-bold transition-all ${on ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/6'}`}
      style={on ? { background: '#6b76ff' } : {}}>
      {children}
    </button>
  )
}

export default function MapView({ events, onEventClick, mapTarget, onTargetConsumed, initialDateFilter, initialCustomDate }: Props) {
  const { t, lang } = useLanguage()
  // Mobiilivalikoista auki enintään yksi kerrallaan; kartan/taustan napautus sulkee.
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const LEGEND_KEYS: Record<string, TranslationKey> = {
    'Keikka':     'legend.concert',
    'Yöelämä':   'legend.nightlife',
    'Baari':      'legend.bar',
    'Teatteri':   'legend.theatre',
    'Taide':      'legend.art',
    'Ilmainen':   'legend.free',
    'Ravintola':  'legend.restaurant',
    'Ravintolat': 'nav.restaurants',
    'Tekemistä':  'nav.activities',
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

  const [dateFilter,  setDateFilter]  = useState<DateFilterKey>(initialDateFilter ?? 'today')
  const [customDate,  setCustomDate]  = useState(initialCustomDate ?? '')
  const [calOpen,     setCalOpen]     = useState(false)
  const [calMonth,    setCalMonth]    = useState<{ year: number; month: number }>(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  // Pinnin napautus avaa pohjaan liukuvan esikatselukortin (EI Leaflet-popupia
  // + infopaneelia päällekkäin kuten ennen — tuplaus oli mobiilissa bugi).
  const [previewEvent, setPreviewEvent] = useState<Event | null>(null)

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
    // Setterit ovat vakaita; listattu jotta React Compiler voi todistaa sen
    // eikä ohita koko komponentin optimointia (lint-virhe 31.8.2026).
  }, [setEventGroup, setCalOpen, setRestType, setRestCuisine, setActCat])

  // ── Init map ─────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl
    const map = L.map(containerRef.current, { center: HELSINKI_CENTER, zoom: 12, zoomControl: true })
    // Vaalea, luettava pohja — EI tummaa: tumma näytti tyylikkäältä mutta
    // kadut ja vesialueet hukkuivat mustaan (omistaja: "kartan pitäisi olla
    // niin kuin Google Mapsissa"). Taustakartan lähde on nyt lib/basemap.ts,
    // koska CARTO alkoi vaatia avainta ja rikkoi molemmat kartat kerralla.
    const base = getBasemap()
    L.tileLayer(base.url, {
      attribution: base.attribution,
      maxZoom: base.maxZoom,
      ...(base.subdomains ? { subdomains: base.subdomains } : {}),
    }).addTo(map)
    mapRef.current = map
    // Kartan tyhjän kohdan napautus sulkee esikatselukortin ja mobiilivalikon
    map.on('click', () => { setPreviewEvent(null); setOpenMenu(null) })

    // With the webpack alias (next.config.ts), the static 'leaflet.markercluster'
    // side-effect import patches the same CJS exports object that our L references.
    // markerClusterGroup lands on (L as any).default (CJS interop wrapper).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Lcjs = (L as any).default ?? L
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasMCG = typeof (Lcjs as any).markerClusterGroup === 'function'
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
    const sync = (cluster: L.Layer | null, on: boolean) => {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- karttatason synkkaus mapTarget-propin mukaan
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- latauslipun synkkaus fetch-efektissä
    setRestsLoading(true)
    fetch('/api/restaurants').then(r => r.json())
      .then(d => setRestaurants(d.restaurants ?? []))
      .catch(() => {}).finally(() => setRestsLoading(false))
  }, [layers.restaurants, restaurants.length, restsLoading])

  useEffect(() => {
    if (!layers.activities || activities.length > 0 || activitiesLoading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- latauslipun synkkaus fetch-efektissä
    setActivitiesLoading(true)
    fetch('/api/activities').then(r => r.json())
      // Kirpputorit LIITETÄÄN 400 kärkipaikan PERÄÄN, ei sekaan: slice ei saa
      // pudottaa niitä, koska ne ovat ainoa kirpputori-lähde kartalla.
      .then(d => setActivities([...(d.activities ?? []).slice(0, 400), ...KIRPPUTORIT]))
      .catch(() => {}).finally(() => setActivitiesLoading(false))
  }, [layers.activities, activities.length, activitiesLoading])

  // ── Event markers ─────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !eventClusterRef.current) return
    const cluster = eventClusterRef.current
    cluster.clearLayers()
    // Esikatselukortti suljetaan kun suodattimet vaihtuvat, jottei kortti
    // jää näyttämään pinniä joka poistui kartalta.
    setPreviewEvent(null)
    if (!layers.events) return
    events.forEach((event) => {
      if (!event.location?.lat || !event.location?.lon) return
      // Kohderyhmä (omistaja 4.9.2026): seniorikohdennettu ei näy kartalla
      // koskaan; lapsiperhetapahtumat näkyvät VAIN "Lapset & perhe" -katego-
      // riassa; oletusnäkymä on 18–40-rajattu kuten poiminnat.
      if (onSenioriTapahtuma(event)) return
      if (eventGroup === 'perhe') {
        if (!onPerheTapahtuma(event)) return
      } else {
        if (isOutsideTargetAudience(event)) return
        if (eventGroup && getEventGroup(event) !== eventGroup) return
      }
      if (!filterEventByDate(event, dateFilter, customDate)) return
      const { color, emoji } = eventColor(event)
      const icon = makePinIcon(color, emoji, false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const marker = L.marker([event.location.lat, event.location.lon] as any, { icon })
      // Pinnin klikkaus avasi aiemmin SEKÄ Leaflet-popupin että koko
      // infopaneelin päällekkäin — mobiilissa sekava tuplaus. Nyt vain
      // esikatselukortti, josta on selkeä CTA varsinaisiin tietoihin.
      marker.on('click', () => setPreviewEvent(event))
      cluster.addLayer(marker)
    })
  }, [mapReady, events, layers.events, eventGroup, dateFilter, customDate])

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
        if (restType === 'ravintola') {
          if (restCuisine === 'awarded' && !r.featured) return
          if (restCuisine !== 'awarded' && !r.cuisineCategories.includes(restCuisine)) return
        } else if (!(r.subCategories ?? []).includes(restCuisine)) return
      }
      const { color, emoji } = restaurantColor(r.type)
      const dist = userPos ? haversine(userPos[0], userPos[1], r.lat!, r.lon!) : null
      const icon = makePinIcon(color, emoji, true)
      // Suomeksi r.description sellaisenaan; englanniksi käännetty keittiökategoria
      // silloin kun sellainen on tiedossa (uusien avausten kuvaus on suomeksi).
      const restCuisineKey = lang === 'en' ? CUISINE_KEYS[r.cuisineCategories?.[0] ?? ''] : undefined
      const restDesc = restCuisineKey ? t(restCuisineKey) : r.description
      const popup = `<div style="font-family:Inter,sans-serif;min-width:160px;max-width:210px">
        <p style="font-weight:700;font-size:13px;margin:0 0 4px;color:#fff">${esc(r.name)}</p>
        ${restDesc ? `<p style="font-size:11px;color:${color};margin:0 0 3px;font-weight:600;text-transform:capitalize">${esc(restDesc)}</p>` : ''}
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
      // a.description on palvelimella suomeksi muotoiltu (ja tarkempi: mm. saunan
      // polttoaine), joten suomeksi se säilyy; englanniksi näytetään kategoria.
      // Tuntematon kategoria putoaa turvallisesti takaisin kuvaukseen.
      const actCatKey: TranslationKey | undefined = ACT_CAT_KEYS[a.category]
      const actDesc = lang === 'en' && actCatKey ? t(actCatKey) : a.description
      const popup = `<div style="font-family:Inter,sans-serif;min-width:160px;max-width:210px">
        <p style="font-weight:700;font-size:13px;margin:0 0 4px;color:#fff">${esc(a.name)}</p>
        <p style="font-size:11px;color:${color};margin:0 0 3px;font-weight:600;text-transform:capitalize">${esc(actDesc)}</p>
        ${a.address ? `<p style="font-size:11px;color:#888;margin:0 0 3px">${esc(a.address)}</p>` : ''}
        ${a.fee === false ? `<p style="font-size:11px;color:#10b981;margin:0 0 3px;font-weight:600">${t('map.free_act')}</p>` : ''}
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
  const eventsOnMap     = events.filter(e => {
    if (!e.location?.lat || !filterEventByDate(e, dateFilter, customDate)) return false
    if (onSenioriTapahtuma(e)) return false
    if (eventGroup === 'perhe') return onPerheTapahtuma(e)
    if (isOutsideTargetAudience(e)) return false
    return !eventGroup || getEventGroup(e) === eventGroup
  }).length
  const restsOnMap      = restaurants.filter(r => {
    if (!r.lat) return false
    if (restType && r.type !== restType) return false
    if (restCuisine) {
      if (restType === 'ravintola') {
        if (restCuisine === 'awarded' && !r.featured) return false
        if (restCuisine !== 'awarded' && !r.cuisineCategories.includes(restCuisine)) return false
      } else if (!(r.subCategories ?? []).includes(restCuisine)) return false
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
    // Korkeus: mobiilissa vähennetään alanavigaation 72 px (100dvh - 220px),
    // muuten kartta jatkuu navigaation ALLE ja alareunan lukumäärä- ja
    // latausmerkit sekä esikatselukortti jäävät sen taakse piiloon.
    <div className="relative w-full rounded-2xl border border-white/8 h-[calc(100dvh-220px)] min-h-[400px] md:h-[calc(100dvh-148px)] md:min-h-[480px]"
      style={{ clipPath: 'inset(0 round 1rem)' }}>
      {/* Leaflet-CSS vain karttaa käytettäessä (ennen render-block kaikilla sivuilla layoutin kautta) */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
      <div ref={containerRef} className="w-full h-full" />
      {/* Zoom-nappi piiloon mobiilissa (nipistyszoomaus toimii); sm+:lla
          nappi siirretään suodatinrivien ALLE — top-vasemmalla se jäisi
          uusien tasonappien taakse kuten mobiilissa ennen piilotusta. */}
      <style>{`
        @media (max-width: 639px) { .leaflet-control-zoom { display: none } }
        @media (min-width: 640px) { .leaflet-top.leaflet-left .leaflet-control-zoom { margin-top: 96px } }
      `}</style>

      {/* ── Suodattimet: kaksi tiivistä riviä KAIKILLA leveyksillä (omistaja
          31.8.2026: ensin mobiiliin — "selkeäksi ja sitten scroll menuja" —
          ja saman päivän jatko: "karttanäkymä pitäisi olla myös tietokoneella
          samanlainen"). Rivi 1: nimetyt tasot. Rivi 2: aktiivisten tasojen
          pudotusvalikot. Vanhat pilleririvit poistettu kokonaan. ── */}
      <div className="absolute z-[1001] flex flex-col gap-1.5 items-start" style={{ top: 10, left: 8, right: 8 }}>
        {openMenu && <div className="fixed inset-0 z-[-1]" onClick={() => setOpenMenu(null)} />}
        <div className="flex gap-1.5">
          {LAYER_META.map(opt => (
            <button key={opt.key} onClick={() => { toggleLayer(opt.key); setOpenMenu(null) }}
              className={`flex items-center gap-1.5 rounded-full text-xs font-black transition-all shrink-0 whitespace-nowrap px-3 py-1.5 border ${
                layers[opt.key] ? 'text-white border-transparent' : 'text-white/45 border-white/10'
              }`}
              style={layers[opt.key] ? { background: opt.bg } : { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}>
              {opt.key === 'events' ? t('map.layer_events') : opt.key === 'restaurants' ? t('map.layer_restaurants') : t('map.layer_guide')}
            </button>
          ))}
        </div>
        {/* flex-wrap, EI overflow-x-auto: vaakavieritysrajaus leikkaisi myös
            pystysuunnassa ja pudotusvalikko jäisi piiloon (mitattu 31.8.). */}
        <div className="flex flex-wrap gap-1.5">
          {layers.events && (
            <MapMenu id="date" open={openMenu} onToggle={setOpenMenu} active={dateFilter !== 'today' || !!customDate}
              label={dateFilter === 'custom' && customDate
                ? '📅 ' + new Date(customDate + 'T12:00:00').toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { day: 'numeric', month: 'numeric' })
                : t(DATE_PILLS.find(dp => dp.key === dateFilter)?.tKey ?? 'date.today')}>
              {DATE_PILLS.map(dp => (
                <MapMenuItem key={dp.key} on={dateFilter === dp.key && !customDate}
                  onClick={() => { setDateFilter(dp.key); setCustomDate(''); setCalOpen(false); setOpenMenu(null) }}>
                  {t(dp.tKey)}
                </MapMenuItem>
              ))}
              <MapMenuItem on={dateFilter === 'custom' && !!customDate}
                onClick={() => { setCalOpen(true); setOpenMenu(null) }}>
                {t('map.pick_day')}
              </MapMenuItem>
            </MapMenu>
          )}
          {layers.events && (
            <MapMenu id="egroup" open={openMenu} onToggle={setOpenMenu} active={!!eventGroup}
              label={eventGroup ? `${EVENT_SUBS.find(sf => sf.key === eventGroup)?.emoji} ${t(EVENT_SUBS.find(sf => sf.key === eventGroup)!.tKey)}` : `🎟 ${t('map.all')}`}>
              <MapMenuItem on={!eventGroup} onClick={() => { setEventGroup(null); setOpenMenu(null) }}>{t('map.all')}</MapMenuItem>
              {EVENT_SUBS.map(sf => (
                <MapMenuItem key={sf.key} on={eventGroup === sf.key}
                  onClick={() => { setEventGroup(sf.key); setOpenMenu(null) }}>
                  {sf.emoji} {t(sf.tKey)}
                </MapMenuItem>
              ))}
            </MapMenu>
          )}
          {layers.restaurants && (
            <MapMenu id="rest" open={openMenu} onToggle={setOpenMenu} active={!!restType}
              label={restType ? `${REST_SUBS.find(sf => sf.key === restType)?.emoji} ${t(REST_SUBS.find(sf => sf.key === restType)!.tKey)}` : `🍽 ${t('map.all')}`}>
              <MapMenuItem on={!restType} onClick={() => { setRestType(null); setRestCuisine(null); setOpenMenu(null) }}>{t('map.all')}</MapMenuItem>
              {REST_SUBS.map(sf => (
                <MapMenuItem key={sf.key} on={restType === sf.key}
                  onClick={() => { setRestType(sf.key); setRestCuisine(null); setOpenMenu(null) }}>
                  {sf.emoji} {t(sf.tKey)}
                </MapMenuItem>
              ))}
            </MapMenu>
          )}
          {layers.restaurants && restType && REST_TYPE_ALASUBIT[restType] && (
            <MapMenu id="typesub" open={openMenu} onToggle={setOpenMenu} active={!!restCuisine}
              label={restCuisine
                ? `${REST_TYPE_ALASUBIT[restType].find(sf => sf.key === restCuisine)?.emoji} ${t(REST_TYPE_ALASUBIT[restType].find(sf => sf.key === restCuisine)!.tKey)}`
                : `↳ ${t('map.all')}`}>
              <MapMenuItem on={!restCuisine} onClick={() => { setRestCuisine(null); setOpenMenu(null) }}>{t('map.all')}</MapMenuItem>
              {REST_TYPE_ALASUBIT[restType].map(sf => (
                <MapMenuItem key={sf.key} on={restCuisine === sf.key}
                  onClick={() => { setRestCuisine(sf.key); setOpenMenu(null) }}>
                  {sf.emoji} {t(sf.tKey)}
                </MapMenuItem>
              ))}
            </MapMenu>
          )}
          {layers.restaurants && restType === 'ravintola' && (
            <MapMenu id="cuisine" open={openMenu} onToggle={setOpenMenu} active={!!restCuisine}
              label={restCuisine ? `${REST_CUISINE_SUBS.find(sf => sf.key === restCuisine)?.emoji} ${t(REST_CUISINE_SUBS.find(sf => sf.key === restCuisine)!.tKey)}` : `↳ ${t('map.all')}`}>
              <MapMenuItem on={!restCuisine} onClick={() => { setRestCuisine(null); setOpenMenu(null) }}>{t('map.all')}</MapMenuItem>
              {REST_CUISINE_SUBS.map(sf => (
                <MapMenuItem key={sf.key} on={restCuisine === sf.key}
                  onClick={() => { setRestCuisine(sf.key); setOpenMenu(null) }}>
                  {sf.emoji} {t(sf.tKey)}
                </MapMenuItem>
              ))}
            </MapMenu>
          )}
          {layers.activities && (
            <MapMenu id="act" open={openMenu} onToggle={setOpenMenu} active={!!actCat}
              label={actCat ? `${ACT_SUBS.find(sf => sf.key === actCat)?.emoji} ${t(ACT_SUBS.find(sf => sf.key === actCat)!.tKey)}` : `🧭 ${t('map.all')}`}>
              <MapMenuItem on={!actCat} onClick={() => { setActCat(null); setOpenMenu(null) }}>{t('map.all')}</MapMenuItem>
              {ACT_SUBS.map(sf => (
                <MapMenuItem key={sf.key} on={actCat === sf.key}
                  onClick={() => { setActCat(sf.key); setOpenMenu(null) }}>
                  {sf.emoji} {t(sf.tKey)}
                </MapMenuItem>
              ))}
            </MapMenu>
          )}
        </div>
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

      {/* ── Minikalenteri — YHTEINEN mobiilivalikolle ja työpöydän 📅-napille.
          Oma lohko eikä suodatinstackin sisällä: stack on mobiilissa piilossa,
          mutta kalenterin pitää aueta myös mobiilivalikon Valitse päivä -rivistä. ── */}
      {calOpen && layers.events && (
        <div className="absolute z-[1003] left-1/2 -translate-x-1/2" style={{ top: 96, width: 282 }}>
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

      {/* ── Tapahtuman esikatselukortti — pinnin napautuksesta.
          Mobiilimalli: kortti liukuu alareunaan (ei popupia pinniin). ── */}
      {previewEvent && (
        <div className="absolute left-2 right-2 bottom-5 z-[1001] flex justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/10 overflow-hidden"
            style={{ background: 'rgba(13,13,16,.97)', backdropFilter: 'blur(16px)', boxShadow: '0 20px 50px -12px rgba(0,0,0,.8)' }}>
            {previewEvent.image && (
              // eslint-disable-next-line @next/next/no-img-element -- Leaflet-konteksti, ei next/image-optimointia
              <img src={previewEvent.image} alt="" className="w-full h-28 object-cover" loading="lazy" />
            )}
            <div className="p-3.5">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm leading-snug">{previewEvent.title}</p>
                  <p className="text-xs mt-1 font-semibold" style={{ color: '#a3abff' }}>
                    {new Date(previewEvent.startTime).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                    {' '}
                    {new Date(previewEvent.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                    {previewEvent.isFree ? ' · ' + t('map.free_popup') : ''}
                  </p>
                  {previewEvent.location?.name && (
                    <p className="text-xs text-white/45 mt-0.5 truncate">{previewEvent.location.name}</p>
                  )}
                </div>
                <button onClick={() => setPreviewEvent(null)} aria-label={t('common.close')}
                  className="shrink-0 w-8 h-8 rounded-full text-white/50 hover:text-white text-sm transition-colors"
                  style={{ background: 'rgba(255,255,255,.06)' }}>✕</button>
              </div>
              <button
                onClick={() => { const e = previewEvent; setPreviewEvent(null); onEventClick(e) }}
                className="mt-3 w-full py-2.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                {t('common.more_info')} →
              </button>
            </div>
          </div>
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
