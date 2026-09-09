'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Event, Restaurant, Activity, type ActivityCategory } from '@/lib/types'
import { getBasemap } from '@/lib/basemap'
import { isOutsideTargetAudience, onPerheTapahtuma, onSenioriTapahtuma } from '@/lib/audience'
import { getEventVibes } from '@/lib/event-classify'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { helsinkiDateOf, helsinkiISO, helsinkiToday } from '@/lib/helsinki-time'
import { osuuPaivaan, paivaPlus, type DateFilterKey } from '@/lib/map-date-filter'

// Static imports are safe here: MapView is always loaded with { ssr: false }.
// The webpack alias in next.config.ts forces both this ESM import and the CJS
// require() inside leaflet.markercluster to share the same module instance,
// so markerClusterGroup is reachable via (L as any).default after the side-effect.
import * as L from 'leaflet'
import 'leaflet.markercluster'
import secondhandData from '@/data/secondhand.json'
import pubivisaKoordinaatit from '@/data/pubivisa-koordinaatit.json'

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

/** Osoiteavain kuten scripts/geokoodaa-pubivisat.ts: "Mäkelänkatu 45, 00550
 *  Helsinki" → "mäkelänkatu 45". Elävän visalistan rivit liitetään tällä
 *  geokoodattuihin sijainteihin. */
function katuAvain(osoite: string): string {
  return osoite.toLowerCase().split(',')[0].trim().replace(/\s+/g, ' ')
}

const VISA_SIJAINNIT = new Map<string, { lat: number; lon: number; name: string }>(
  Object.entries(pubivisaKoordinaatit as Record<string, { lat?: number; lon?: number; name?: string }>)
    .filter(([, v]) => typeof v.lat === 'number' && typeof v.lon === 'number')
    .map(([k, v]) => [k, { lat: v.lat!, lon: v.lon!, name: v.name ?? '' }]),
)

/** Oppaan tapahtumarivi (lib/guide-data GuideEvent) — kantaa koordinaattinsa. */
type OpasTapahtumaRivi = {
  id: string; title: string; startTime: string; venue: string
  isFree?: boolean; price?: string | null; image?: string | null
  street?: string; lat?: number; lon?: number
}

/** Oppaan rivi kartan Event-muotoon. Sama muunnos kuin oppaan korteissa
 *  (GuideInlineView toEvent), tässä omana kopiona jottei koko opasnäkymää
 *  tarvitse importata karttaan. */
function opasRiviTapahtumaksi(e: OpasTapahtumaRivi): Event {
  return {
    id: e.id,
    title: e.title,
    shortDescription: '',
    description: '',
    startTime: e.startTime,
    endTime: null,
    location: e.venue || e.lat != null
      ? { name: e.venue, streetAddress: e.street ?? '', city: 'Helsinki', lat: e.lat, lon: e.lon }
      : null,
    image: e.image ?? null,
    isFree: e.isFree ?? false,
    price: e.price ?? null,
    ticketUrl: null,
    infoUrl: null,
    categories: [],
    source: 'guide',
  } as Event
}

/** Visarivi oppaan datasta: viikoittain toistuva visailta. */
type VisaRivi = { name: string; address: string; weekday: number; hour: number; minute: number }

// ── Types ─────────────────────────────────────────────────

/** Syvälinkki yhteen pisteeseen: kartta lentää tähän ja avaa nimipopupin. */
type MapTarget = { lat: number; lon: number; name: string; zoom?: number; type?: 'event' | 'restaurant' | 'activity' }

type Layers = { events: boolean; restaurants: boolean; activities: boolean }

interface Props {
  events: Event[]
  /** Tapahtumahaku kesken (HomeClientin useEvents) — kartta näyttää
   *  lataustilan, jottei tyhjä kartta näytä "ei tapahtumia" (omistaja
   *  6.9.2026: kuukausi-ikkunan kylmä haku kestää, käyttäjä ehtii lähteä). */
  eventsLoading?: boolean
  onEventClick: (event: Event) => void
  mapTarget?: MapTarget | null
  onTargetConsumed?: () => void
  /** Discover-näkymän Lista⇄Kartta-kytkin tuo listan päiväsuodattimen
   *  mukanaan — kartta näyttää SAMAT tapahtumat kuin lista, ei omaa
   *  oletusvalintaansa. Koskee vain mountausta (kartta unmounttuu
   *  moodivaihdoksissa, joten alkuarvo on aina tuore). */
  initialDateFilter?: DateFilterKey
  initialCustomDate?: string
  /** OSION KONTEKSTI: kartta avautuu siihen mitä käyttäjä oli katsomassa —
   *  ravintolaosiosta ravintolataso valintoineen, oppaasta oppaan kohteet,
   *  tapahtumista aihepiirivalinta (omistaja 8.9.2026). Yksisuuntainen
   *  siemen: kartalla tehty muutos ei valu takaisin listaan. */
  initialLayers?: Partial<Layers>
  initialEventGroup?: string | null
  initialRestType?: string | null
  initialRestCuisine?: string | null
  initialActCat?: string | null
  /** Mistä oppaasta kartalle tultiin. Kartta hakee aiheen sisällön itse
   *  (/api/guides/[slug]), joten sama toimii myös kun aihe valitaan kartan
   *  Opas-valikosta ilman että opasta on avattu (omistaja 9.9.2026). */
  opasSlug?: string
}

/** Opasaiheet joilla on aikaan sidottua sisältöä. Avain = kartan
 *  kategoria-avain (ACT_SUBS), arvo = oppaan slug ja onko aiheella myös
 *  paikkanäkymä (vain kirpputoreilla). */
const AIKA_AIHEET: Record<string, { slug: string; pari: boolean }> = {
  kirpputori: { slug: 'kirpputorit', pari: true },
  pubivisa:   { slug: 'pubivisat',   pari: false },
}

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

// Väri + emoji pinnin PÄÄRYHMÄSTÄ (getEventGroup — keskitetty luokitin).
// Ilmainen värittyy vihreäksi vain jos mikään sisältöryhmä ei osu ensin.
// Haetaan EVENT_SUBSista, jotta pinni ja valikkorivi eivät voi ajautua eri
// väreihin — ennen tässä oli oma switch, joka jäi jälkeen kun kategorioita
// lisättiin (uusi kategoria näkyi valikossa mutta pinni oli 📍 muu).
function eventColor(event: Event): { color: string; emoji: string } {
  const ryhma = getEventGroup(event)
  const sub = EVENT_SUBS.find((s) => s.key === ryhma)
  return sub ? { color: sub.color, emoji: sub.emoji } : { color: '#0072C6', emoji: '📍' }
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

// Palautusarvo interpoloidaan href="..."-attribuuttiin → myös escapoitava,
// muuten OSM-datan lainausmerkki murtautuu attribuutista ulos (esim.
// website-tagi 'https://x.fi" onmouseover="...').
function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? esc(url) : null
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

// Kartan kategoriat = LISTAN aihepiirit (lib/types VIBES) + ilmainen.
// Avaimet, emojit, käännösavaimet ja järjestys ovat samat kuin
// aihepiiripaneelissa (VibePanel: Ilmaiseksi ensin, sitten VIBES) — omistaja
// 8.9.2026: kartalla pitää olla samat vaihtoehdot kuin listapuolella.
// Avain on VIBES-id, joten osuuRyhmaan (getEventVibes) suodattaa ne kaikki
// ilman erikoistapauksia; 'lapset' on ainoa poikkeus, koska sillä on oma
// kohderyhmäkäsittely (onPerheTapahtuma).
const EVENT_SUBS = [
  { key: 'ilmainen',    emoji: '🎁', label: 'Ilmaiseksi',            color: '#10b981', tKey: 'legend.free' as const },
  { key: 'keikka',      emoji: '🎸', label: 'Keikka',                color: '#a855f7', tKey: 'vibe.keikka' as const },
  { key: 'yoelama',     emoji: '🌙', label: 'Yöelämä',               color: '#ec4899', tKey: 'vibe.yoelama' as const },
  { key: 'baari',       emoji: '🍺', label: 'Baari / Pub',           color: '#f59e0b', tKey: 'vibe.baari' as const },
  { key: 'urheilu',     emoji: '⚽', label: 'Urheilu',               color: '#3b82f6', tKey: 'vibe.urheilu' as const },
  { key: 'standup',     emoji: '😂', label: 'Stand up',              color: '#fb7185', tKey: 'vibe.standup' as const },
  { key: 'museo',       emoji: '🏛', label: 'Museo',                  color: '#0ea5e9', tKey: 'vibe.museo' as const },
  // Lapsiperhetapahtumat näkyvät VAIN tästä valittuna — oletusnäkymä on
  // 18–40-kohderyhmän (omistaja 4.9.2026: vauvatreffit kartalla laski profiilia).
  { key: 'lapset',      emoji: '👨‍👩‍👧', label: 'Lapset & Perhe',   color: '#fb923c', tKey: 'vibe.lapset' as const },
  { key: 'tyopaja',     emoji: '🛠', label: 'Harrastukset & Kurssit', color: '#14b8a6', tKey: 'vibe.tyopaja' as const },
  { key: 'teatteri',    emoji: '🎭', label: 'Teatteri & Tanssi',      color: '#ef4444', tKey: 'vibe.teatteri' as const },
  { key: 'taide',       emoji: '🎨', label: 'Taide',                  color: '#06b6d4', tKey: 'vibe.taide' as const },
  { key: 'festivaali',  emoji: '🎪', label: 'Festivaali',             color: '#d946ef', tKey: 'vibe.festivaali' as const },
  { key: 'underground', emoji: '🔦', label: 'Underground',            color: '#7e22ce', tKey: 'vibe.underground' as const },
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
  // Michelin on listan kategoria (RestaurantsView SUB_CATS) — kartalta
  // puuttui. Ei ole cuisineCategory vaan oma lippujoukko, ks. suodatin alla.
  { key: 'michelin',      emoji: '🏵️', tKey: 'restaurants.cat_michelin' as const },
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
    // Kattoterassit ovat dataltaan baareja (9 paikkaa, subCategories ['katto']),
    // joten rivi kuuluu tänne — ilman sitä /terassit-opasta ei voi kääntää
    // kartan suodattimeksi. Nimike on kattoterassi eikä sub_katto
    // ("Kattoklubit"), joka on yökerhojen sanasto.
    { key: 'katto',      emoji: '🌇', tKey: 'guides.kicker_rooftop' },
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
  // Nämä kaksi ovat ActivityCategory-tyypissä ja datassa (mitattu 8.9.2026:
  // urheilu 531, markkina 11 kohdetta) mutta puuttuivat valikosta, joten ne
  // näkyivät vain "Kaikki"-tilassa.
  { key: 'urheilu',    emoji: '🏟', label: 'Urheilupaikka', color: '#3b82f6', tKey: 'cat.urheilu' as const },
  { key: 'markkina',   emoji: '🧺', label: 'Markkinat',     color: '#eab308', tKey: 'cat.markkina' as const },
  // Pubivisat ovat AINA tapahtumia (omistaja 9.9.2026), joten tämä rivi on
  // aihevalinta: sen valinta vaihtaa kartan visailtoihin päivärivin kanssa
  // eikä näytä paikkoja (ks. AIKA_AIHEET).
  { key: 'pubivisa',   emoji: '🧠', label: 'Pubivisat',     color: '#8b5cf6', tKey: 'guides.pubivisat_title' as const },
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
  pubivisa:   'guides.pubivisat_title',
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


// Päivävalinnat = listan päivärivi (HomeClient) + kuukausi, joka on kartan
// oma laajempi selausikkuna. "Illalla" ja "Viikonloppu" puuttuivat aiemmin,
// jolloin listan illan rajaus katosi kartalle siirryttäessä (omistaja 8.9.2026).
const DATE_PILLS: { key: DateFilterKey; tKey: TranslationKey }[] = [
  { key: 'today',    tKey: 'date.today' },
  { key: 'tonight',  tKey: 'date.tonight' },
  { key: 'tomorrow', tKey: 'map.date_tomorrow' },
  { key: 'weekend',  tKey: 'date.weekend' },
  { key: 'week',     tKey: 'map.date_week' },
  { key: 'month',    tKey: 'map.date_month' },
]

// Pinnin VÄRIN pääryhmä — keskitetystä luokittimesta (sama kuin listan
// kategoriat), tärkeysjärjestys määrää värin kun kategorioita on monta.
// SUODATUS EI käytä tätä: se tarkistaa koko vibes-joukon (alla), koska
// aiempi oma regex-kaskadi antoi vain yhden ryhmän ja esim. "Baari"-
// suodatin palautti aina 0 — baaritapahtumat luokittuivat ilmainen/keikka-
// ryhmiin ennen kuin baari-sääntöön päästiin (omistajan havainto 6.9.2026).
function getEventGroup(event: Event): string {
  const vibes = getEventVibes(event)
  // Kuusi ensimmäistä olivat tässä jo ennen kategorioiden yhtenäistämistä —
  // järjestys pidetään, jotta vanhojen pinnien värit eivät muutu. Uudet
  // tulevat perään, joten ne osuvat vain kun mikään aiempi ei osu.
  for (const g of ['keikka', 'yoelama', 'baari', 'teatteri', 'taide', 'urheilu',
                   'standup', 'festivaali', 'museo', 'tyopaja', 'underground', 'lapset'] as const) {
    if (vibes.includes(g)) return g
  }
  if (event.isFree) return 'ilmainen'
  return 'muu'
}

/** Osuuko tapahtuma kartan kategoriasuodattimeen — INKLUSIIVINEN kuten
 *  listan kategoriat: tapahtuma voi kuulua moneen ryhmään. */
function osuuRyhmaan(event: Event, ryhma: string): boolean {
  if (ryhma === 'ilmainen') return !!event.isFree
  return getEventVibes(event).includes(ryhma)
}

// ── Legend data ───────────────────────────────────────────

// Selite: kategoriat samasta lähteestä kuin valikko ja pinnit. Näytetään
// pääryhmät (getEventGroupin kaskadin kärki + ilmainen) — koko 13 kategorian
// lista ei mahdu selitteeseen, ja valikko kertoo loput.
const LEGEND_AVAIMET = ['keikka', 'yoelama', 'baari', 'teatteri', 'taide', 'ilmainen'] as const
const LEGEND_EVENT = LEGEND_AVAIMET.map((k) => {
  const sub = EVENT_SUBS.find((s) => s.key === k)!
  return { color: sub.color, label: sub.label }
})
// Pinnit ovat nyt tasoväreissä (design-tokenit): ravintolat sininen,
// tekeminen vihreä — legenda kuvaa tasot, tyyppi näkyy pinnin emojista
const LEGEND_REST = [
  { color: '#5f96ff', label: 'Ravintolat' },
]
const LEGEND_ACT = [
  { color: '#5fd9a6', label: 'Tekemistä' },
]
// Visailloissa jokainen pinni on samaa lajia (🧠 violetti), joten yleinen
// tapahtumalegenda selittäisi värejä joita kartalla ei ole yhtään.
const LEGENDA_VISAT = [
  { color: '#8b5cf6', label: 'Pubivisat' },
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

/** Tasonappi — yksi tyyli kaikille (tavalliset tasot ja opaslaatikot). */
function LayerNappi({ on, bg, onClick, children }: { on: boolean; bg: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full text-xs font-black transition-all shrink-0 whitespace-nowrap px-3 py-1.5 border ${
        on ? 'text-white border-transparent' : 'text-white/45 border-white/10'
      }`}
      style={on ? { background: bg } : { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}>
      {children}
    </button>
  )
}

export default function MapView({ events, eventsLoading, onEventClick, mapTarget, onTargetConsumed, initialDateFilter, initialCustomDate, initialLayers, initialEventGroup, initialRestType, initialRestCuisine, initialActCat, opasSlug }: Props) {
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
    'Pubivisat':  'guides.pubivisat_title',
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
  const [layers, setLayers] = useState<Layers>({ events: true, restaurants: false, activities: false, ...initialLayers })

  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [restsLoading, setRestsLoading] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)

  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)

  // ── OPASAIHEET (omistaja 9.9.2026) ────────────────────────
  // Opas-valikko on AIHEVALINTA, ja aihe ratkaisee mitä kartalla näkyy:
  //   kirpputorit → paikat TAI kirppistapahtumat (ainoa jolla on pari)
  //   pubivisat   → aina visaillat (viikoittain toistuvia, ei paikkanäkymää)
  //   jamit       → aina tapahtumia (oppaassa ei ole paikkoja)
  //   muut        → paikkoja kuten ennen
  /** Kirpputorien pari: kumpi puoli näkyy. */
  const [kirppisMoodi, setKirppisMoodi] = useState<'paikat' | 'tapahtumat'>('paikat')
  /** Saapumisoppaan rajaus purettu käyttäjän toimesta ("Kaikki"). Koskee
   *  vain slug-pohjaisia aiheita (jamit); kategoriapohjaiset (kirpputori,
   *  pubivisa) puretaan Opas-valikon "Kaikki"-rivillä. */
  const [aiheHylatty, setAiheHylatty] = useState(false)
  const [opasSisalto, setOpasSisalto] = useState<Record<string, { tapahtumat: Event[]; visat: VisaRivi[] }>>({})
  const haetutAiheet = useRef<Set<string>>(new Set())

  const [eventGroup,   setEventGroup]   = useState<string | null>(initialEventGroup ?? null)
  const [restType,     setRestType]     = useState<string | null>(initialRestType ?? null)
  const [restCuisine,  setRestCuisine]  = useState<string | null>(initialRestCuisine ?? null)
  const [actCat,       setActCat]       = useState<string | null>(initialActCat ?? null)

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
  // Kartalla näkyvien tapahtumapinnien määrä — ohjaa lataus-/tyhjätilaviestiä.
  const [eventMarkerCount, setEventMarkerCount] = useState(0)

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

  /** Valittu opasaihe: kartan kategoriasta, tai saapumisoppaasta silloin kun
   *  oppaalla ei ole karttakategoriaa (jamit). */
  const opasAihe = useMemo<{ slug: string; pari: boolean } | null>(() => {
    if (actCat && AIKA_AIHEET[actCat]) return AIKA_AIHEET[actCat]
    if (!aiheHylatty && opasSlug === 'jamit') return { slug: 'jamit', pari: false }
    return null
  }, [actCat, opasSlug, aiheHylatty])

  /** Näytetäänkö aiheen TAPAHTUMAT paikkojen sijaan. Parittomat aiheet
   *  (pubivisat, jamit) ovat aina tapahtumia. */
  const aiheTapahtumina = !!opasAihe && (!opasAihe.pari || kirppisMoodi === 'tapahtumat')

  /** Aiheen sisältö on vielä matkalla. Aihe ei kulje eventsLoading-lipun
   *  kautta (oma /api/guides-haku), joten ilman tätä "ei osumia" -viesti
   *  välähtäisi ennen kuin visaillat ehtivät kartalle. */
  const aiheLatautuu = aiheTapahtumina && !opasSisalto[opasAihe?.slug ?? '']

  // ── Sync cluster layers to layer toggle state ─────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const sync = (cluster: L.Layer | null, on: boolean) => {
      if (!cluster) return
      if (on && !map.hasLayer(cluster)) map.addLayer(cluster)
      else if (!on && map.hasLayer(cluster)) map.removeLayer(cluster)
    }
    // Aihetilassa tapahtumaklusteri on kartalla vaikka tapahtumataso olisi
    // pois: aihe (visaillat, jamit, kirppistapahtumat) ON tapahtumanäkymä.
    sync(eventClusterRef.current, layers.events || aiheTapahtumina)
    sync(restClusterRef.current,  layers.restaurants)
    sync(actClusterRef.current,   layers.activities)
  }, [mapReady, layers, aiheTapahtumina])

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
        .setContent(`<p style="color:#fff;font-family:Inter,sans-serif;font-size:13px;font-weight:700;margin:0;padding:2px 0">📍 ${esc(mapTarget.name)}</p>`)
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

  // Aiheen sisältö haetaan vasta kun sitä tarvitaan, kerran per aihe.
  useEffect(() => {
    const slug = aiheTapahtumina ? opasAihe?.slug : undefined
    if (!slug || haetutAiheet.current.has(slug)) return
    haetutAiheet.current.add(slug)
    let elossa = true
    fetch(`/api/guides/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { events?: OpasTapahtumaRivi[]; visas?: VisaRivi[] }) => {
        if (!elossa) return
        setOpasSisalto((edelliset) => ({
          ...edelliset,
          [slug]: { tapahtumat: (d.events ?? []).map(opasRiviTapahtumaksi), visat: d.visas ?? [] },
        }))
      })
      .catch(() => { haetutAiheet.current.delete(slug) })
    return () => { elossa = false }
  }, [aiheTapahtumina, opasAihe])

  // ── Pubivisat tapahtumina ─────────────────────────────────
  // Visa toistuu viikoittain, joten generoidaan sen SEURAAVA esiintymä
  // tästä päivästä eteenpäin ja annetaan tavallisen päiväsuodattimen
  // ratkaista mitkä näkyvät. Näin "pubivisat tänään" toimii samalla
  // päivärivillä kuin muut tapahtumat, ilman omaa erikoislogiikkaa.
  const visaTapahtumat = useMemo<Event[]>(() => {
    const opasVisat = opasAihe?.slug === 'pubivisat' ? opasSisalto['pubivisat']?.visat : undefined
    if (!opasVisat?.length) return []
    const tanaan = helsinkiToday()
    const tanaanVp = ((new Date(`${tanaan}T12:00:00Z`).getUTCDay() + 6) % 7) + 1   // 1 = ma
    return opasVisat.flatMap((v, i) => {
      const sijainti = VISA_SIJAINNIT.get(katuAvain(v.address))
      if (!sijainti) return []
      const lisays = (v.weekday - tanaanVp + 7) % 7
      const paiva = paivaPlus(tanaan, lisays)
      const [y, kk, pp] = paiva.split('-').map(Number)
      return [{
        id: `visa-${i}`,
        title: v.name,
        shortDescription: '',
        description: '',
        startTime: helsinkiISO(y, kk, pp, v.hour, v.minute),
        endTime: null,
        location: { name: v.name, streetAddress: v.address, city: 'Helsinki', lat: sijainti.lat, lon: sijainti.lon },
        image: null,
        isFree: true,
        price: null,
        ticketUrl: null,
        // Lähde omana vakiona: lib/pubivisat sisältää skraperin, jota ei pidä
        // vetää klienttinippuun pelkän osoitteen takia (= PUBIVISAT_SOURCE_URL).
        infoUrl: 'https://pubivisat.fi/helsinki',
        categories: [],
        source: 'pubivisat',
      } as Event]
    })
  }, [opasAihe, opasSisalto])

  /** Kartalla näkyvät tapahtumat: valitun opasaiheen joukko vai koko lista. */
  const tapahtumaLahde = aiheTapahtumina
    ? (opasAihe?.slug === 'pubivisat' ? visaTapahtumat : (opasSisalto[opasAihe?.slug ?? '']?.tapahtumat ?? []))
    : events
  /** Aiheen joukossa kohderyhmärajausta ei sovelleta: käyttäjä on pyytänyt
   *  juuri tämän aiheen ja opaslista näyttää siitä kaiken. Seniorikohdennettu
   *  jää yhä pois (omistajan linjaus 4.9.2026). */
  const rajattu = aiheTapahtumina

  /** Kirpputorien pari: paikat ⇄ kirppistapahtumat. Kategoria pysyy
   *  valittuna kummassakin, joten Opas-valikko on yhä käytettävissä. */
  const vaihdaKirppis = useCallback((mihin: 'paikat' | 'tapahtumat') => {
    setKirppisMoodi(mihin)
    setOpenMenu(null)
  }, [])

  /** Valitulle päivälle osuvat — ja jos niitä ei ole, TULEVAT (omistajan
   *  valinta 9.9.2026: kartta ei jää tyhjäksi vaan näyttää seuraavat, ja
   *  banneri kertoo miksi). Koskee vain oppaan rajattua joukkoa; koko
   *  kartalla päivävalinta on käyttäjän oma rajaus jota ei ohiteta. */
  const paivanTapahtumat = useMemo(
    () => tapahtumaLahde.filter((e) => osuuPaivaan(e.startTime, dateFilter, customDate)),
    [tapahtumaLahde, dateFilter, customDate],
  )
  const naytaTulevat = rajattu && paivanTapahtumat.length === 0 && tapahtumaLahde.length > 0

  // ── Event markers ─────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !eventClusterRef.current) return
    const cluster = eventClusterRef.current
    cluster.clearLayers()
    // Esikatselukortti suljetaan kun suodattimet vaihtuvat, jottei kortti
    // jää näyttämään pinniä joka poistui kartalta.
    setPreviewEvent(null)
    // Aihetilassa (visaillat, jamit, kirppistapahtumat) tapahtumat piirtyvät
    // vaikka tapahtumataso olisi pois — aihe ON tapahtumanäkymä.
    if (!layers.events && !aiheTapahtumina) { setEventMarkerCount(0); return }
    let lisatty = 0
    tapahtumaLahde.forEach((event) => {
      if (!event.location?.lat || !event.location?.lon) return
      // Kohderyhmä (omistaja 4.9.2026): seniorikohdennettu ei näy kartalla
      // koskaan; lapsiperhetapahtumat näkyvät VAIN "Lapset & Perhe" -katego-
      // riassa; OLETUSNÄKYMÄ on 18–40-rajattu kuten poiminnat.
      //
      // VALITTU KATEGORIA näyttää kaiken siitä kategoriasta — sama sääntö
      // kuin listalla, jonka koodi sanoo sen ääneen (HomeClient: "Kategoriat,
      // haku ja koCat-listat näyttävät ne edelleen"). Ilman tätä kartan uudet
      // kategoriat (esim. Harrastukset & Kurssit) olisivat lähes tyhjiä,
      // koska juuri ne tapahtumat ovat kohderyhmärajauksen ulkopuolella.
      if (onSenioriTapahtuma(event)) return
      if (eventGroup === 'lapset') {
        if (!onPerheTapahtuma(event)) return
      } else if (eventGroup) {
        if (!osuuRyhmaan(event, eventGroup)) return
      } else if (!rajattu && isOutsideTargetAudience(event)) {
        return
      }
      // Tyhjä päivä oppaan joukossa → näytetään TULEVAT (banneri kertoo miksi).
      if (!naytaTulevat && !osuuPaivaan(event.startTime, dateFilter, customDate)) return
      // Pubivisat ovat generoituja tapahtumia eivätkä osu luokittimeen —
      // annetaan niille visakategorian oma kuvake ja väri.
      const { color, emoji } = event.id.startsWith('visa-')
        ? { color: '#8b5cf6', emoji: '🧠' }
        : eventColor(event)
      const icon = makePinIcon(color, emoji, false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const marker = L.marker([event.location.lat, event.location.lon] as any, { icon })
      // Pinnin klikkaus avasi aiemmin SEKÄ Leaflet-popupin että koko
      // infopaneelin päällekkäin — mobiilissa sekava tuplaus. Nyt vain
      // esikatselukortti, josta on selkeä CTA varsinaisiin tietoihin.
      marker.on('click', () => setPreviewEvent(event))
      cluster.addLayer(marker)
      lisatty++
    })
    setEventMarkerCount(lisatty)
  }, [mapReady, tapahtumaLahde, rajattu, naytaTulevat, layers.events, aiheTapahtumina, eventGroup, dateFilter, customDate])

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
          // Sama ehto kuin listalla (RestaurantsView: tähdet, Bib Gourmand,
          // Green tai valikoima) — michelin ei ole keittiötyyppi.
          else if (restCuisine === 'michelin' && !(r.michelinStars || r.bibGourmand || r.greenMichelin || r.michelinRecommended)) return
          else if (restCuisine !== 'awarded' && restCuisine !== 'michelin' && !r.cuisineCategories.includes(restCuisine)) return
        } else if (!(r.subCategories ?? []).includes(restCuisine)) return
      }
      const { color, emoji: tyyppiEmoji } = restaurantColor(r.type)
      // Pinnin kuvake seuraa VALITTUA suodatinta (omistaja 6.9.2026:
      // Olutbaarit-valinnalla pinnissä 🍺, ei tyypin yleinen 🍸) — sama
      // emoji kuin valikkorivissä, jotta valinta ja kartta puhuvat samaa.
      const aliSub = restCuisine
        ? (restType === 'ravintola'
            ? REST_CUISINE_SUBS.find((sf) => sf.key === restCuisine)
            : REST_TYPE_ALASUBIT[restType ?? '']?.find((sf) => sf.key === restCuisine))
        : undefined
      const emoji = aliSub?.emoji ?? tyyppiEmoji
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
        ${r.phone ? `<p style="font-size:11px;color:#aaa;margin:${safeUrl(r.www) ? '3px' : '0'} 0 0">${esc(r.phone)}</p>` : ''}
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
    // Aihetilassa paikat väistyvät: käyttäjä katsoo aiheen tapahtumia.
    if (!layers.activities || aiheTapahtumina) return
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
        ${a.openingHours ? `<p style="font-size:10px;color:#666;margin:0 0 3px">${esc(a.openingHours.split(';')[0])}</p>` : ''}
        ${safeUrl(a.www) ? `<a href="${safeUrl(a.www)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#a3abff;font-weight:600;text-decoration:none">${t('common.website')} →</a>` : ''}
      </div>`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const marker = L.marker([a.lat, a.lon] as any, { icon })
      marker.bindPopup(popup, { className: 'dark-popup', maxWidth: 220 })
      cluster.addLayer(marker)
    })
  }, [mapReady, activities, layers.activities, aiheTapahtumina, actCat, t, lang])

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
  // Tapahtumien luku tulee SUORAAN markkeriefektistä (eventMarkerCount):
  // rinnakkainen suodatinkopio ehti eriytyä piirretystä joukosta, ja laskuri
  // joka ei vastaa pinnejä on pahempi kuin ei laskuria.
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

  // Aihetilassa (visaillat, jamit, kirppistapahtumat) tapahtumat lasketaan
  // vaikka tapahtumataso on pois, ja paikat jätetään laskematta koska niitä
  // ei myöskään piirretä — muuten "113 kohdetta" lukisi tyhjän paikkatason
  // päällä.
  const countParts = [
    (layers.events || aiheTapahtumina) && eventMarkerCount > 0 && `${eventMarkerCount} ${t('map.events_count')}`,
    layers.restaurants && restsOnMap      > 0 && `${restsOnMap} ${t('map.rests_count')}`,
    layers.activities && !aiheTapahtumina && activitiesOnMap > 0 && `${activitiesOnMap} ${t('map.acts_count')}`,
  ].filter(Boolean).join(' · ')

  const tapahtumaLegenda = opasAihe?.slug === 'pubivisat' && !layers.events ? LEGENDA_VISAT : LEGEND_EVENT
  const activeLegend = [
    ...(layers.events || aiheTapahtumina ? tapahtumaLegenda : []),
    ...(layers.restaurants ? LEGEND_REST : []),
    ...(layers.activities && !aiheTapahtumina ? LEGEND_ACT : []),
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
            <LayerNappi key={opt.key} on={layers[opt.key]} bg={opt.bg}
              onClick={() => { toggleLayer(opt.key); setOpenMenu(null) }}>
              {opt.key === 'events' ? t('map.layer_events') : opt.key === 'restaurants' ? t('map.layer_restaurants') : t('map.layer_guide')}
            </LayerNappi>
          ))}
        </div>
        {/* KIRPPUTORIEN PARI: ainoa opasaihe jolla on sekä paikkoja että
            tapahtumia (omistaja 9.9.2026). Näkyy heti kun kirpputori on
            valittu — myös silloin kun aihe valitaan kartan Opas-valikosta,
            ei vain oppaasta tultaessa. */}
        {opasAihe?.pari && (
          <div className="flex gap-1.5">
            <LayerNappi on={kirppisMoodi === 'paikat'} bg={LAYER_META[2].bg} onClick={() => vaihdaKirppis('paikat')}>
              🛍 {t('map.layer_places')}
            </LayerNappi>
            <LayerNappi on={kirppisMoodi === 'tapahtumat'} bg={LAYER_META[0].bg} onClick={() => vaihdaKirppis('tapahtumat')}>
              🎟 {t('map.events_kirpputorit')}
            </LayerNappi>
          </div>
        )}
        {/* flex-wrap, EI overflow-x-auto: vaakavieritysrajaus leikkaisi myös
            pystysuunnassa ja pudotusvalikko jäisi piiloon (mitattu 31.8.). */}
        <div className="flex flex-wrap gap-1.5">
          {(layers.events || aiheTapahtumina) && (
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
          {(layers.events || aiheTapahtumina) && (
            <MapMenu id="egroup" open={openMenu} onToggle={setOpenMenu} active={!!eventGroup}
              label={eventGroup ? `${EVENT_SUBS.find(sf => sf.key === eventGroup)?.emoji} ${t(EVENT_SUBS.find(sf => sf.key === eventGroup)!.tKey)}` : `🎟 ${t('map.all')}`}>
              {/* "Kaikki" purkaa myös saapumisoppaan rajauksen (jamit), jolle ei
                  ole omaa karttakategoriaa — muuten siitä ei pääsisi pois. */}
              <MapMenuItem on={!eventGroup} onClick={() => { setEventGroup(null); setAiheHylatty(true); setOpenMenu(null) }}>{t('map.all')}</MapMenuItem>
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
                  onClick={() => {
                    setActCat(sf.key)
                    // Aikaan sidottu aihe (kirpputori, pubivisa) ottaa kartan
                    // haltuun: yleinen tapahtumataso pois, jottei kaupungin
                    // muut tapahtumat sekoitu aiheen pinneihin.
                    if (AIKA_AIHEET[sf.key]) { setLayers((l) => ({ ...l, events: false })); setKirppisMoodi('paikat') }
                    setOpenMenu(null)
                  }}>
                  {sf.emoji} {t(sf.tKey)}
                </MapMenuItem>
              ))}
            </MapMenu>
          )}
        </div>
      </div>

      {/* ── Locate me ── */}
      <button onClick={locateMe} disabled={locating} aria-label={userPos ? t('common.update_loc') : t('common.locate_me')}
        className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 px-2 py-2 sm:px-3 rounded-xl bg-black/85 backdrop-blur-md border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-all shadow-lg disabled:opacity-60">
        {locating
          ? <span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(107,118,255,.5)', borderTopColor: '#6b76ff' }} />
          : <span>📍</span>}
        <span className="hidden sm:inline">{userPos ? t('common.update_loc') : t('common.locate_me')}</span>
      </button>

      {/* ── Loading indicators ── */}
      {/* Tyhjä tila KESKELLÄ (vain kun haku on VALMIS ja osumia ei ole):
          kartta ei koskaan näytä pelkkää tyhjää josta voisi luulla ettei
          tapahtumia ole (omistaja 6.9.2026). Lataustila näytetään hillitysti
          oikean alakulman pillerissä (alla) — keskitetty latausviesti oli
          omistajan mielestä liian voimakas. pointer-events-none: karttaa voi
          liikutella viestin läpi. */}
      {/* Valitulla päivällä ei ollut mitään, mutta joukossa on tulevia →
          kartalla näkyvät ne, ja banneri kertoo miksi (omistajan valinta
          9.9.2026: kartta ei jää tyhjäksi). Banneri on ylhäällä suodatinrivien
          alla, ei keskellä, koska pinnit ovat näkyvissä. */}
      {(layers.events || aiheTapahtumina) && naytaTulevat && !eventsLoading && !aiheLatautuu && (
        <div className="absolute inset-x-0 z-[1000] flex justify-center pointer-events-none" style={{ top: 96 }}>
          <div className="px-4 py-2 rounded-full bg-black/85 backdrop-blur-md border border-white/12 shadow-2xl">
            <span className="text-white/85 text-[12px] font-bold">ℹ {dateFilter === 'today' && !customDate ? t('map.empty_today_upcoming') : t('map.empty_day_upcoming')}</span>
          </div>
        </div>
      )}
      {(layers.events || aiheTapahtumina) && !naytaTulevat && eventMarkerCount === 0 && !eventsLoading && !aiheLatautuu && (
        <div className="absolute inset-x-0 z-[1000] flex justify-center pointer-events-none" style={{ top: '42%' }}>
          <div className="flex flex-col items-center gap-0.5 px-5 py-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/12 shadow-2xl text-center">
            <span className="text-white/85 text-[13px] font-bold">{t('discover.no_filter_match')}</span>
            <span className="text-white/40 text-[11.5px] font-semibold">{t('map.empty_hint')}</span>
          </div>
        </div>
      )}

      {(restsLoading || activitiesLoading || aiheLatautuu || (eventsLoading && layers.events)) && (
        <div className="absolute bottom-16 right-3 z-[1000] flex items-center gap-2 px-3 py-2 rounded-xl bg-black/85 text-white/50 text-xs">
          <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white/70 animate-spin" />
          {restsLoading ? t('map.loading_rests') : activitiesLoading ? t('map.loading_acts') : `${t('discover.loading_events')}…`}
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
      {calOpen && (layers.events || aiheTapahtumina) && (
        <div className="absolute z-[1003] left-1/2 -translate-x-1/2" style={{ top: 96, width: 282 }}>
          <div style={{ background: '#0d0d10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.9)' }}>
              {/* Month navigation */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <button onClick={() => setCalMonth(m => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })}
                  aria-label={t('a11y.prev_month')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 20, padding: '0 10px', lineHeight: 1 }}>‹</button>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'Inter,sans-serif' }}>
                  {new Date(calMonth.year, calMonth.month).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => setCalMonth(m => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })}
                  aria-label={t('a11y.next_month')}
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
                  // Tänään + tapahtumamäärät HELSINKI-päivinä (laitteen kello
                  // näytti ulkomailla väärän "tänään"-korostuksen ja siirsi
                  // aamuyön tapahtumat viereiselle päivälle).
                  const hkiTanaan = helsinkiToday()
                  const evCounts: Record<number, number> = {}
                  events.forEach(ev => {
                    const d = helsinkiDateOf(ev.startTime) // 'YYYY-MM-DD'
                    if (d.slice(0, 4) === String(calMonth.year) && Number(d.slice(5, 7)) === calMonth.month + 1)
                      evCounts[Number(d.slice(8, 10))] = (evCounts[Number(d.slice(8, 10))] || 0) + 1
                  })
                  const cells: (number | null)[] = []
                  for (let i = 0; i < firstDow; i++) cells.push(null)
                  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
                  return cells.map((day, idx) => {
                    if (day === null) return <div key={`e${idx}`} />
                    const dateStr = `${calMonth.year}-${String(calMonth.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                    const isPast = dateStr < hkiTanaan
                    const isToday = dateStr === hkiTanaan
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
                    {new Date(previewEvent.startTime).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Helsinki' })}
                    {' '}
                    {new Date(previewEvent.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' })}
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
