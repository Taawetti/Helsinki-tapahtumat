'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { MapPin, Globe, Phone, Navigation, Map as MapIcon, X, Clock } from 'lucide-react'
import type { Restaurant } from '@/lib/types'
import type { TranslationKey } from '@/lib/i18n'
import { useLanguage } from '@/contexts/LanguageContext'
import { isOpenNow, getTodayHours, helsinkiNow } from '@/lib/opening-hours'
import { poimiPoydat, aukioloTieto, type PoimintaSlot } from '@/lib/poyta-poiminnat'
import { pickAttributes } from '@/lib/google-attributes'
import { credibilityScore } from '@/lib/credibility'
import { primaryReason, interleaveReasoned, reasonsWeight } from '@/lib/restaurant-reasons'
import { ReasonBadge, relativeDate } from '@/components/ReasonBadge'
import RestaurantDetailPanel from '@/components/RestaurantDetailPanel'

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

const TYPE_TABS: { id: RestType; tKey: TranslationKey; emoji: string; dbType: Restaurant['type'] | null }[] = [
  { id: 'ruokapaikat', tKey: 'restaurants.tab_food',  emoji: '🍽', dbType: 'ravintola' },
  { id: 'kahvilat',    tKey: 'restaurants.tab_cafes', emoji: '☕', dbType: 'kahvila'   },
  { id: 'baarit',      tKey: 'restaurants.tab_bars',  emoji: '🍸', dbType: 'baari'     },
  { id: 'yokerhot',    tKey: 'restaurants.tab_clubs', emoji: '🌃', dbType: 'yokerho'   },
]

const SUB_CATS: Record<RestType, { id: string; tKey: TranslationKey; emoji: string }[]> = {
  // Järjestys on myös NÄKYVYYSJÄRJESTYS: kategorialaatoista näytetään
  // oletuksena 8 ensimmäistä (etusivun kaava), loput avautuvat napista.
  // Kasvis POISTETTU 3.9.2026 (omistaja; mitattu: kategoriassa oli tasan
  // 1 ravintola) — lähi-itä nostettiin kärkeen sen tilalle (31 paikkaa).
  ruokapaikat: [
    // Suosituimmat ja Michelin ovat KATEGORIOITA (omistaja 3.9.2026):
    // laskeutumissivun 60 kortin seinä muuttui laataksi, ja Michelin on oma
    // hakuaikomuksensa (29 paikkaa: 6 tähteä, 3 Bib, 20 oppaassa — mitattu).
    { id: 'suosituimmat',   tKey: 'restaurants.most_popular', emoji: '⭐' },
    { id: 'michelin',       tKey: 'restaurants.cat_michelin', emoji: '🏵️' },
    { id: 'japanese',       tKey: 'cuisine.japanese',       emoji: '🍣' },
    { id: 'pizza',          tKey: 'cuisine.pizza',          emoji: '🍕' },
    { id: 'italian',        tKey: 'cuisine.italian',        emoji: '🍝' },
    { id: 'asian',          tKey: 'cuisine.asian',          emoji: '🍜' },
    { id: 'middle_eastern', tKey: 'cuisine.middle_eastern', emoji: '🧆' },
    { id: 'awarded',        tKey: 'cuisine.awarded',        emoji: '🏆' },
    { id: 'nordisk',        tKey: 'cuisine.nordisk',        emoji: '🇫🇮' },
    { id: 'burger',         tKey: 'cuisine.burger',         emoji: '🍔' },
    { id: 'seafood',        tKey: 'cuisine.seafood',        emoji: '🐟' },
    { id: 'steak',          tKey: 'cuisine.steak',          emoji: '🥩' },
    { id: 'indian',         tKey: 'cuisine.indian',         emoji: '🍛' },
    { id: 'mexican',        tKey: 'cuisine.mexican',        emoji: '🌮' },
    { id: 'african',        tKey: 'cuisine.african',        emoji: '🌍' },
  ],
  kahvilat: [
    { id: 'suosituimmat', tKey: 'restaurants.most_popular',     emoji: '⭐' },
    { id: 'klassikot',    tKey: 'restaurants.sub_klassikot',    emoji: '🎩' },
    { id: 'ranskalaiset', tKey: 'restaurants.sub_ranskalaiset', emoji: '🥖' },
    { id: 'boheemit',     tKey: 'restaurants.sub_boheemit',     emoji: '📖' },
    { id: 'erikois',      tKey: 'restaurants.sub_erikois',      emoji: '☕' },
    { id: 'paahtimo',     tKey: 'restaurants.sub_paahtimo',     emoji: '🔥' },
    { id: 'brunssi',      tKey: 'restaurants.sub_brunssi',      emoji: '🥐' },
  ],
  baarit: [
    { id: 'suosituimmat', tKey: 'restaurants.most_popular', emoji: '⭐' },
    { id: 'cocktail', tKey: 'restaurants.sub_cocktail', emoji: '🍸' },
    { id: 'olut',     tKey: 'restaurants.sub_olut',     emoji: '🍺' },
    { id: 'viini',    tKey: 'restaurants.sub_viini',    emoji: '🍷' },
    { id: 'urheilu',  tKey: 'restaurants.sub_urheilu',  emoji: '🏟' },
  ],
  yokerhot: [
    { id: 'suosituimmat', tKey: 'restaurants.most_popular', emoji: '⭐' },
    { id: 'klubi',   tKey: 'restaurants.sub_klubi',   emoji: '🎉' },
    { id: 'karaoke', tKey: 'restaurants.sub_karaoke', emoji: '🎤' },
    { id: 'tekno',   tKey: 'restaurants.sub_tekno',   emoji: '🎧' },
    { id: 'katto',   tKey: 'restaurants.sub_katto',   emoji: '🌃' },
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

function formatOpeningHoursHuman(raw: string, t: (key: TranslationKey) => string): string {
  if (!raw) return ''
  if (raw === '24/7') return t('restaurants.open_247')
  // Viikonpäivälyhenteet samasta avaimesta kuin ruuhka-aikaotsikko
  // (su-alkuinen järjestys) — suomeksi tulos on sama kuin ennen.
  const SHORT = t('restaurants.weekday_short').split(', ')
  const DAYS: Record<string, string> = { Su: SHORT[0], Mo: SHORT[1], Tu: SHORT[2], We: SHORT[3], Th: SHORT[4], Fr: SHORT[5], Sa: SHORT[6] }
  return raw
    .split(';')
    .map(p => {
      let s = p.trim().replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, k => DAYS[k] ?? k)
      s = s.replace(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g, '$1–$2')
      return s
    })
    .join(', ')
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
  // Suosituimmat on kaikkien tyyppien kategoria: koko pooli, kuratointi on
  // järjestys + katkaisu (TOP_PICKS) selausnäkymässä.
  if (sub === 'suosituimmat') return true

  // ruokapaikat uses cuisine categories — no change needed
  if (restType === 'ruokapaikat') {
    if (sub === 'awarded') return !!r.featured
    // Suosituimmat: koko pooli — kuratointi on järjestys + katkaisu (TOP_PICKS).
    if (sub === 'suosituimmat') return true
    // Michelin: oppaan paikat — tähdet, Bib Gourmand, Green tai valikoima.
    if (sub === 'michelin') return !!(r.michelinStars || r.bibGourmand || r.greenMichelin || r.michelinRecommended)
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

// ── "Pöydät nyt" — kellonaikaan sidotut päiväpoiminnat ────────────────────
// Ravintolasivu oli hakemisto: sama ruudukko aamulla ja illalla, eikä mikään
// antanut syytä avata sitä juuri nyt. Tämä rivi tuo etusivun "Illan parhaat
// poiminnat" -idean ravintoloihin: kellonaikaan sopiva, auki oleva ja
// päivittäin vaihtuva valikoima syineen. Valinta: lib/poyta-poiminnat.

// Otsikot tyypeittäin JA jaksoittain — jokainen välilehti puhuu omista
// paikoistaan (omistaja 3.9.2026: "kategoriaan sopivilla otsikoilla").
const SLOT_OTSIKKO: Record<RestType, Record<PoimintaSlot, { tKey: TranslationKey; emoji: string }>> = {
  ruokapaikat: {
    aamu:      { tKey: 'poiminnat.title_aamu',      emoji: '☕' },
    lounas:    { tKey: 'poiminnat.title_lounas',    emoji: '🍽' },
    paiva:     { tKey: 'poiminnat.title_paiva',     emoji: '🧁' },
    ilta:      { tKey: 'poiminnat.title_ilta',      emoji: '🕯' },
    myohainen: { tKey: 'poiminnat.title_myohainen', emoji: '🌙' },
  },
  kahvilat: {
    aamu:      { tKey: 'poiminnat.kahvilat_aamu',   emoji: '☕' },
    lounas:    { tKey: 'poiminnat.kahvilat_lounas', emoji: '🥪' },
    paiva:     { tKey: 'poiminnat.kahvilat_paiva',  emoji: '🧁' },
    ilta:      { tKey: 'poiminnat.kahvilat_ilta',   emoji: '🕯' },
    myohainen: { tKey: 'poiminnat.title_myohainen', emoji: '🌙' },
  },
  baarit: {
    aamu:      { tKey: 'poiminnat.baarit_aamu',     emoji: '🍺' },
    lounas:    { tKey: 'poiminnat.baarit_lounas',   emoji: '🍺' },
    paiva:     { tKey: 'poiminnat.baarit_paiva',    emoji: '🍻' },
    ilta:      { tKey: 'poiminnat.baarit_ilta',     emoji: '🍸' },
    myohainen: { tKey: 'poiminnat.title_myohainen', emoji: '🌙' },
  },
  // Klubien päiväjaksot näkyvät vain jos jokin on oikeasti auki (harvinaista)
  // — silloin neutraali "Avoinna nyt".
  yokerhot: {
    aamu:      { tKey: 'poiminnat.title_avoinna',    emoji: '🌃' },
    lounas:    { tKey: 'poiminnat.title_avoinna',    emoji: '🌃' },
    paiva:     { tKey: 'poiminnat.title_avoinna',    emoji: '🌃' },
    ilta:      { tKey: 'poiminnat.yokerhot_ilta',    emoji: '🌃' },
    myohainen: { tKey: 'poiminnat.yokerhot_myohainen', emoji: '🌙' },
  },
}

function PoimintaKortti({ r, nyt, onOpen }: { r: Restaurant; nyt: Date; onOpen: (r: Restaurant) => void }) {
  const { t } = useLanguage()
  const [imgOk, setImgOk] = useState(true)
  const tieto = aukioloTieto(r.openingHours, nyt)
  const reason = primaryReason(r.reasons, nyt)
  const tyyli = getCuisineStyle(r)
  return (
    <button onClick={() => onOpen(r)}
      className="rounded-2xl overflow-hidden text-left transition-transform active:scale-[.97] flex flex-col"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.7)' }}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4/3', background: '#141418' }}>
        {r.image && imgOk ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img loading="lazy" src={r.image} onError={() => setImgOk(false)} alt={r.name}
            className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center' }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: `radial-gradient(circle at 50% 60%, ${tyyli.color}28 0%, transparent 70%)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={twemojiUrl(tyyli.cp)} alt="" width={44} height={44} style={{ objectFit: 'contain' }} />
          </div>
        )}
        {r.priceRange && (
          <span className="absolute top-2 right-2 text-[10px] font-black px-2 py-0.5 rounded-full text-white/85"
            style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}>
            {PRICE_LABELS[r.priceRange]}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
        <h3 className="font-black text-white text-[13px] leading-tight line-clamp-2">{r.name}</h3>
        {r.googleRating && (
          <span className="text-[11px] font-bold" style={{ color: '#fbbf24' }}>
            ⭐ {r.googleRating.toFixed(1)}
            {r.reviewCount ? <span className="opacity-60 font-normal"> ({r.reviewCount > 999 ? `${(r.reviewCount / 1000).toFixed(1)}${t('restaurants.thousand_suffix')}` : r.reviewCount})</span> : null}
          </span>
        )}
        {reason && <div className="min-w-0 overflow-hidden"><ReasonBadge reason={reason} /></div>}
        {/* Rivissä on vain auki olevia (lib/poyta-poiminnat) — merkki kertoo
            mihin asti ehtii. Nuoli toimii molemmilla kielillä ilman taivutusta. */}
        <span className="mt-auto pt-0.5 text-[10.5px] font-black" style={{ color: tieto.pian ? '#fbbf24' : '#34d399' }}>
          {tieto.tila === 'auki'
            ? (tieto.pian ? `● ${t('hours.closing_soon')}` : `● ${t('common.open')}${tieto.klo ? ` → ${tieto.klo}` : ''}`)
            : ''}
        </span>
      </div>
    </button>
  )
}

function PoydatNyt({ poiminta, nyt, restType, onOpen }: {
  poiminta: { slot: PoimintaSlot; poiminnat: Restaurant[] }
  nyt: Date
  restType: RestType
  onOpen: (r: Restaurant) => void
}) {
  const { t } = useLanguage()
  if (poiminta.poiminnat.length === 0) return null
  const otsikko = SLOT_OTSIKKO[restType][poiminta.slot]
  // Ruudukko kuten etusivun poiminnoissa — EI karusellia (omistaja 3.9.2026:
  // "en halua karusellia tähän, sitä ei ole muuallakaan sivustossa").
  return (
    <section className="space-y-2.5">
      <div>
        <h2 className="font-black text-white text-[18px]" style={{ letterSpacing: '-0.02em' }}>
          {otsikko.emoji} {t(otsikko.tKey)}
        </h2>
        <p className="text-[11.5px] font-bold text-white/35 mt-0.5">{t('poiminnat.subtitle')}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
        {poiminta.poiminnat.map((r) => <PoimintaKortti key={r.id} r={r} nyt={nyt} onOpen={onOpen} />)}
      </div>
    </section>
  )
}

// ── Hero card ─────────────────────────────────────────────

function HeroCard({ r, distance, onShowOnMap }: {
  r: Restaurant
  distance?: number
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}) {
  // Googlen kuvaosoitteet lahoavat (mitattu 24.8.2026: 32/60 otoksesta 403)
  // — rikkinäisen kuvakkeen sijaan pudotaan emoji-laattaan.
  const [imgOk, setImgOk] = useState(true)
  const { t } = useLanguage()
  const open = r.openingHours ? isOpenNow(r.openingHours) : undefined
  const ctaLabel = r.type === 'ravintola' ? `${t('common.website')} →` : r.type === 'kahvila' ? `${t('common.more_info')} →` : `${t('common.more_info')} →`
  const heroStyle = getCuisineStyle(r)

  return (
    <div className="relative w-full rounded-[22px] overflow-hidden" style={{ aspectRatio: '16/9', boxShadow: '0 22px 50px -20px rgba(10,10,12,.8)' }}>
      {r.image && imgOk ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img loading="lazy" src={r.image} onError={() => setImgOk(false)} alt={r.name} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center' }} />
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

// ── List card ─────────────────────────────────────────────

function RestListCard({ r, distance, onShowOnMap, onOpen }: {
  r: Restaurant
  distance?: number
  onShowOnMap?: (lat: number, lon: number, name: string) => void
  onOpen?: (r: Restaurant) => void
}) {
  // Googlen kuvaosoitteet lahoavat (mitattu 24.8.2026: 32/60 otoksesta 403)
  // — rikkinäisen kuvakkeen sijaan pudotaan emoji-laattaan.
  const [imgOk, setImgOk] = useState(true)
  const { t } = useLanguage()
  // Aikatietoinen merkki: auki → mihin asti, kiinni → milloin avautuu tänään.
  // Punainen "Suljettu"-seinä poistui tarkoituksella: kiinni oleminen ei ole
  // hälytys vaan tieto, ja seuraava avautumisaika on se hyödyllinen osa.
  const tieto = useMemo(() => aukioloTieto(r.openingHours, helsinkiNow()), [r.openingHours])
  const open = tieto.tila === 'auki' ? true : tieto.tila === 'kiinni' ? false : undefined
  const cuisineStyle = getCuisineStyle(r)
  const reason = useMemo(() => primaryReason(r.reasons, new Date()), [r.reasons])
  // Sijaluku 50 parasta -listalta näytetään myös silloin kun päämerkki on jokin
  // muu — se on eri tieto kuin Michelin-luokka, ja lyhyt.
  const secondaryReason = useMemo(() => {
    if (!reason || reason.kind === 'top50') return null
    const top50 = r.reasons?.find((x) => x.kind === 'top50' && typeof x.rank === 'number')
    return top50 ? { ...top50, label: `${t('restaurants.top50')} · ${top50.rank}` } : null
  }, [r.reasons, reason, t])
  // Tuore lehtijuttu tästä paikasta: otsikko näytetään omana rivinään, koska
  // se on juuri se tieto joka auttaa päätöstä ("isänpäivälounas", "tarjous").
  const newsReason = useMemo(
    () => r.reasons?.find((x) => x.kind === 'uutinen' && x.note) ?? null,
    [r.reasons],
  )
  // Toimituslistan nimi omana rivinään, mutta VAIN kun lista on kortin
  // ensisijainen syy — Michelin-kortilla "miksi" on jo Michelin, eikä korttiin
  // kasata kolmatta selitettä. Omistajan huomio: pelkkä "Time Out Helsinki"
  // -pilleri ei kerro miksi paikka on nostettu; tämä rivi kertoo ("Helsingin
  // parhaat aamiaiset ja brunssit") ja linkkaa artikkeliin jossa perustelu on.
  const listReason = useMemo(
    () => (reason?.kind === 'timeout' && reason.note ? reason : null),
    [reason],
  )
  return (
    <div className={`rounded-2xl overflow-hidden ${onOpen ? 'cursor-pointer transition-transform active:scale-[.99]' : ''}`}
      role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(r) : undefined}
      onKeyDown={onOpen ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r) } }) : undefined}
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.7)' }}>
      {/* Mini-header: real photo if available, else B2 emoji */}
      <div className="relative flex items-center justify-center overflow-hidden" style={{ aspectRatio: '16/10', background: '#141418' }}>
        {r.image && imgOk ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" src={r.image} onError={() => setImgOk(false)} alt={r.name} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center' }} />
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
        <div className="space-y-1.5">
          <h3 className="font-black text-white text-sm leading-tight">{r.name}</h3>
          <div className="flex items-center gap-1 flex-wrap">
            {tieto.tila !== 'tuntematon' && (
              tieto.tila === 'auki' ? (
                tieto.pian ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                    ● {t('hours.closing_soon')}
                  </span>
                ) : (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                    ● {t('common.open')}{tieto.klo ? ` → ${tieto.klo}` : ''}
                  </span>
                )
              ) : (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/6 text-white/40">
                  ○ {tieto.klo ? `${t('hours.opens')} ${tieto.klo}` : t('common.closed')}
                </span>
              )
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
            {r.reviewCount ? <span className="font-normal opacity-70">({r.reviewCount > 999 ? `${(r.reviewCount/1000).toFixed(1)}${t('restaurants.thousand_suffix')}` : r.reviewCount})</span> : null}
          </span>
        )}
        {/* SYY. Kun ulkoinen lähde on nostanut paikan, se sanotaan tässä ja
            korvaa vanhat kovakoodatut Michelin-merkit — muuten sama tieto
            näkyisi kortissa kahdesti. Ilman syytä vanhat merkit jäävät
            varalle, jottei mikään katoa jos syytiedosto ei osu. */}
        {reason ? (
          /* Kaksi merkkiä, ei enempää. Moni Suomen 50 parasta -paikka on myös
             Michelin-oppaassa, ja pelkkä vahvempi merkki hukkaisi sijaluvun:
             Palace on 50 parasta -listan ykkönen, mutta näyttäisi vain
             "Michelin 2★". Sijaluku on eri tieto ja mahtuu viereen. */
          <div className="flex flex-wrap items-center gap-1">
            <ReasonBadge reason={reason} />
            {secondaryReason && <ReasonBadge reason={secondaryReason} />}
          </div>
        ) : (
          <>
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
          </>
        )}
        {/* UUTINEN — toimittajan tuore juttu juuri tästä paikasta. Linkki avaa
            artikkelin; stopPropagation ettei kortin oma avaus laukea samalla. */}
        {newsReason && (
          /* rel: vain noopener, EI noreferrer. Käyttäjän Safari latasi
             kohdesivun tiedostoksi navigoinnin sijaan; palvelin ja DOM
             todettiin puhtaiksi ja WebKit-moottori navigoi oikein, mutta
             useissa Safari-raporteissa noreferrer on ollut osatekijä.
             noopener riittää turvaksi (ja on _blankissa nykyselaimissa
             oletus muutenkin). */
          <a
            href={newsReason.url}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
            className="block text-[11.5px] leading-snug text-white/70 hover:text-white transition-colors"
          >
            📰 {newsReason.note}
            <span className="text-white/35"> · {newsReason.date ? relativeDate(newsReason.date, t) : ''} ↗</span>
          </a>
        )}
        {/* TOIMITUSLISTA — millä listalla ja monentenako. Linkki artikkeliin,
            jossa toimittajan perustelu; emme kopioi sitä tänne. */}
        {listReason && (
          /* rel: vain noopener — sama Safari-varotoimi kuin uutisrivillä. */
          <a
            href={listReason.url}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
            className="block text-[11.5px] leading-snug text-white/70 hover:text-white transition-colors"
          >
            📋 {listReason.note}
            <span className="text-white/35"> · {listReason.source.replace(/\s*Helsinki$/, '')} ↗</span>
          </a>
        )}
        {/* ANNOS JA HINTA — kortin ainoa konkreettinen "miksi tänne" -tieto.
            Korvaa r.descriptionin, joka on OSM:n raaka keittiömerkkijono
            ("pizza;italian"): oikea annos oikealla hinnalla on samassa tilassa
            olennaisesti parempi sisältö, eikä kortin korkeus muutu.
            YKSI rivi, ei kolme — kolme annosta per kortti tuotti litanian.
            Hinta on mediaani ja se sanotaan arviona, ks. lib/menu-summary.ts. */}
        {r.menu?.samples[0] ? (
          <div className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-white/75 text-xs leading-snug truncate">{r.menu.samples[0].title}</span>
              <span className="shrink-0 text-white/90 text-xs font-black">{r.menu.samples[0].price}</span>
            </div>
            <span className="text-white/30 text-[10.5px]">
              {r.menu.dishCount} {t('restaurants.dishes')} · {t('restaurants.dishes_approx')} {Math.round(r.menu.typicalPrice)} €
            </span>
          </div>
        ) : (
          r.description && <p className="text-white/40 text-xs">{r.description}</p>
        )}
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
                  ? <><span className={open ? 'text-emerald-400/70' : ''}>{t('date.today')} {today}</span></>
                  : formatOpeningHoursHuman(r.openingHours, t)}
              </span>
            </div>
          )
        })()}
        <div className="flex items-center gap-3 pt-0.5 flex-wrap" onClick={e => e.stopPropagation()}>
          {r.www && (
            <a href={/^https?:\/\//i.test(r.www) ? r.www : 'https://' + r.www} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold hover:opacity-80 transition-opacity"
              style={{ color: '#a3abff' }}>
              <Globe size={10} /> {t('common.website')}
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
              <MapIcon size={10} /> {t('idea.on_map')}
            </button>
          )}
          {((r.lat && r.lon) || r.address) && (
            <a href={r.lat && r.lon
              ? `https://maps.google.com/maps?daddr=${r.lat},${r.lon}&travelmode=transit`
              : `https://maps.google.com/maps?daddr=${encodeURIComponent(r.address + ', Helsinki')}&travelmode=transit`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold text-blue-400/70 hover:text-blue-300 transition-colors">
              <Navigation size={10} /> {t('detail.directions')}
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
  // Googlen kuvaosoitteet lahoavat (mitattu 24.8.2026: 32/60 otoksesta 403)
  // — rikkinäisen kuvakkeen sijaan pudotaan emoji-laattaan.
  const [imgOk, setImgOk] = useState(true)
  const { t } = useLanguage()
  const r = chain.representative
  const cuisineStyle = getCuisineStyle(r)
  return (
    <button onClick={() => onClick(chain)} className="rounded-2xl overflow-hidden text-left w-full transition-all active:scale-[.98]"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.7)' }}>
      <div className="relative flex items-center justify-center overflow-hidden" style={{ aspectRatio: '16/10', background: '#141418' }}>
        {r.image && imgOk ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" src={r.image} onError={() => setImgOk(false)} alt={r.name} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center' }} />
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
        {/* Rivinsisäinen muoto (pieni alkukirjain): common.show_all on painikkeen
            teksti 'Näytä kaikki', tässä se jatkaa lausetta "3 sijaintia · …". */}
        <p className="text-[11px] font-bold mt-0.5" style={{ color: '#a3abff' }}>{chain.locations.length} {t('restaurants.locations')} · {t('restaurants.show_all_inline')}</p>
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
            <p className="text-[13px] mt-1 font-bold" style={{ color: '#a3abff' }}>📍 {chain.locations.length} {t('restaurants.locations_in_helsinki')}</p>
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
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${open ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/6 text-white/40'}`}>
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
                    <span>{t('date.today')} {todayH}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 pt-0.5 flex-wrap">
                  {onShowOnMap && r.lat && r.lon && (
                    <button onClick={() => { onShowOnMap(r.lat!, r.lon!, r.name); onClose() }}
                      className="flex items-center gap-1 text-[10px] font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
                      <MapIcon size={10} /> {t('idea.on_map')}
                    </button>
                  )}
                  {((r.lat && r.lon) || r.address) && (
                    <a href={r.lat && r.lon
                      ? `https://maps.google.com/maps?daddr=${r.lat},${r.lon}&travelmode=transit`
                      : `https://maps.google.com/maps?daddr=${encodeURIComponent(r.address + ', Helsinki')}&travelmode=transit`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] font-bold text-blue-400/70 hover:text-blue-300 transition-colors">
                      <Navigation size={10} /> {t('detail.directions')}
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
                      <Globe size={10} /> {t('common.website')}
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


// ── "Selaa kategorioittain" — 3-sarakkeinen fiilisruudukko (design 3-ravintolat.png) ──

// tint-hehkut per kategoria — sävyt vaihtelevat tarkoituksella
const GRID_TINTS: Record<string, string> = {
  suosituimmat: '251,191,36', michelin: '226,55,68',
  awarded: '232,192,106', nordisk: '95,150,255', japanese: '95,217,166', pizza: '255,107,107',
  italian: '175,130,255', asian: '95,217,166', burger: '232,192,106', veggie: '95,217,166',
  seafood: '95,150,255', steak: '255,107,107', indian: '232,150,106', mexican: '232,192,106',
  middle_eastern: '175,130,255', african: '232,150,106',
  klassikot: '232,192,106', ranskalaiset: '175,130,255', boheemit: '95,217,166', erikois: '95,150,255', paahtimo: '255,107,107', brunssi: '232,192,106',
  cocktail: '175,130,255', olut: '232,192,106', viini: '255,107,107', urheilu: '95,150,255',
  klubi: '175,130,255', karaoke: '255,107,107', tekno: '95,150,255', katto: '95,217,166',
}

// Etusivun kaava (omistaja 3.9.2026): kompakti laattaruudukko, oletuksena
// 6 ensimmäistä kategoriaa (omistaja: pohjoismainen ja hampurilaiset pois
// näkyvistä), loput avautuvat "Kaikki kategoriat ▾" -napista — 15 laatan
// seinä vei mobiilissa viisi riviä pystytilaa.
const NAKYVAT_LAATAT = 6

function SubCatGrid({ restType, onSelect }: {
  restType: RestType
  onSelect: (id: string) => void
}) {
  const { t } = useLanguage()
  const [kaikkiAuki, setKaikkiAuki] = useState(false)
  const kaikki = SUB_CATS[restType]
  const nakyvat = kaikkiAuki ? kaikki : kaikki.slice(0, NAKYVAT_LAATAT)
  const piilossa = kaikki.length - NAKYVAT_LAATAT
  // Sarakemäärä elää laattamäärän mukaan, ettei ruudukkoon jää vajaita
  // rivejä: 6 laattaa → 2×3, 4 laattaa → yksi rivi, isot avatut setit → 4.
  const laattoja = nakyvat.length + (kaikkiAuki ? 1 : 0)
  const sarakkeet = laattoja >= 9 || laattoja % 4 === 0 ? 4 : 3
  const laatta = (cat: { id: string; tKey: TranslationKey; emoji: string }) => (
    <button key={cat.id} onClick={() => onSelect(cat.id)}
      className="flex flex-col items-center justify-center gap-1.5 rounded-[16px] py-4 px-1 transition-transform active:scale-95"
      style={{
        background: `radial-gradient(120% 100% at 50% 0%, rgba(${GRID_TINTS[cat.id] ?? '120,130,200'},.16), rgba(255,255,255,.03) 70%)`,
        border: '1px solid rgba(255,255,255,.07)',
      }}>
      <span className="text-[26px] leading-none">{cat.emoji}</span>
      <span className="text-[11px] font-black text-white/85 text-center leading-tight">{t(cat.tKey)}</span>
    </button>
  )
  return (
    <section>
      <h2 className="font-black text-white text-[18px] mb-3" style={{ letterSpacing: '-0.02em' }}>
        {t('discover.grid_sub')}
      </h2>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${sarakkeet}, minmax(0, 1fr))` }}>
        {nakyvat.map(laatta)}
        {/* Avattuna mukana myös "Kaikki"-laatta → selausnäkymä suodattimineen */}
        {kaikkiAuki && (
          <button onClick={() => onSelect('kaikki')}
            className="flex flex-col items-center justify-center gap-1.5 rounded-[16px] py-4 px-1 transition-transform active:scale-95"
            style={{
              background: 'radial-gradient(120% 100% at 50% 0%, rgba(107,118,255,.22), rgba(255,255,255,.03) 70%)',
              border: '1px solid rgba(107,118,255,.28)',
            }}>
            <span className="text-[26px] leading-none">🍽</span>
            <span className="text-[11px] font-black text-white/85 text-center leading-tight">{t('common.all')}</span>
          </button>
        )}
      </div>
      {/* Sama avausnappi kuin etusivun "Kaikki aihepiirit ▾" */}
      {!kaikkiAuki && piilossa > 0 && (
        <div className="flex justify-center pt-3">
          <button onClick={() => setKaikkiAuki(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-full text-[13.5px] font-black text-white transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
            🍽 {t('restaurants.all_categories')}
            <span className="text-white/40">▾</span>
          </button>
        </div>
      )}
      {/* Pienillä tyypeillä (baarit, kahvilat) kaikki laatat mahtuvat näkyviin,
          mutta Kaikki-selaus tarvitaan silti */}
      {!kaikkiAuki && piilossa <= 0 && (
        <div className="flex justify-center pt-3">
          <button onClick={() => onSelect('kaikki')}
            className="flex items-center gap-2 px-5 py-3 rounded-full text-[13.5px] font-black text-white transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
            🍽 {t('common.show_all')}
          </button>
        </div>
      )}
    </section>
  )
}

// ── Tyyppisegmentit — pillerit (design 3-ravintolat.png) ──────────────────

function TypeTabs({ active, onChange }: { active: RestType; onChange: (id: RestType) => void }) {
  const { t } = useLanguage()
  // Sama pillerityyli kuin etusivun päivärivillä heron yläpuolella (omistaja
  // 3.9.2026: "linja pysyy") — pyöreä, ei reunaviivaa, aktiivinen indigo-
  // liukuvärillä. Mobiilissa ilman emojia ja hieman tiiviimpänä, jotta kaikki
  // neljä mahtuvat riviin ilman sivuvieritystä; overflow-x jää varmistukseksi
  // hyvin kapeille laitteille.
  return (
    <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
      {TYPE_TABS.map(tab => {
        const isActive = active === tab.id
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)}
            className={`shrink-0 flex items-center gap-2 rounded-full px-3 py-2 sm:px-4 sm:py-2.5 font-black text-[12px] sm:text-[13.5px] transition-all active:scale-[.97] ${
              isActive ? 'text-white' : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/65'
            }`}
            style={isActive ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 4px 16px -4px rgba(91,101,230,.4)', letterSpacing: '-0.01em' } : { letterSpacing: '-0.01em' }}>
            <span className="hidden sm:inline text-[16px] leading-none">{tab.emoji}</span>
            {t(tab.tKey)}
          </button>
        )
      })}
    </div>
  )
}

// ── USKOTTAVUUS: LISTOJEN OLETUSJÄRJESTYS ───────────────────────────────────
// "Jos joku on saanut 2000 arvostelua ja 4,6 arvosanan, se on parempi kuin
// paikka jolla on 14 arvostelua ja 4,7." Juuri niin `credibilityScore` toimii:
// se on Wilsonin luottamusvälin alaraja, eli varovainen arvio siitä kuinka
// hyvä paikka on VÄHINTÄÄN kun otoskoko otetaan huomioon.
//
//     2000 × 4,6  →  0,889        14 × 4,7  →  0,695
//     1978 × 4,9  →  0,967        19 × 4,1  →  0,589
//
// Ks. lib/credibility.ts, jossa on perustelu sille miksi tämä korvasi
// aiemman Bayes-kutistuksen.
//
// Palkintopiste pidetään mukana pienenä lisänä niitä paikkoja varten, joilta
// puuttuu Google-arvio kokonaan (esim. Savoy) — muuten ne putoaisivat nollaan.
const AWARD_FALLBACK = 0.55

// Kärkipoimintojen määrä oletusnäkymässä — loput löytyvät kategoria-selauksesta
const TOP_PICKS = 60
// Kuvan paino. Nostettu 0,05 → 0,15 (omistaja 3.9.2026: "haluan muutenkin
// suosia paikkoja missä kuvat koska se ei tunnu keskeneräiseltä") — kuvallinen
// paikka ohittaa nyt selvästi kuvattoman samassa laatuluokassa, muttei
// romahduta järjestystä: Wilson-asteikolla 0,15 vastaa noin yhden
// laatuportaan eroa.
const IMG_WEIGHT = 0.15

// Uskottavuuspiste yksin — EI sisällä syytä. Syylliset paikat järjestetään
// erikseen `interleaveReasoned`illa, jotta perheet lomittuvat eivätkä kasaudu
// lohkoiksi; tämä kaava ratkaisee kaikkien MUIDEN järjestyksen ja toimii
// erottimena perheiden sisällä.
function restaurantQualityScore(r: Restaurant): number {
  const c = credibilityScore(r.googleRating, r.reviewCount)
  if (c > 0) return c
  // Ei yhtään arvostelua: palkinto on ainoa tieto jonka varassa järjestää.
  return r.michelinStars || r.bibGourmand || r.michelinRecommended ? AWARD_FALLBACK : 0
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

// Hoikka suodatinrivi — näkyy KAIKISSA näkymissä (kaikki + alakategoriat).
// Korvaa entisen "Auta valitsemaan" -paneelin: samat suodattimet, mutta
// suoraan ruudukkoon eikä erilliseen arvontapooliin.
// ── Yhtenäinen suodatinrivi — SAMA Suosituimmat- ja selausnäkymässä ─────────
// Omistajan pyyntö: "tehdään kaikki-välilehdelle samanlaiset suodattimet kuin
// suosituimmat-välilehdellä" + "lähimmät ensin" myös Suosituimpiin. Vanhat
// ★4+/★4.5+ -portaat korvasi liukusäädin, ja Googlen ominaisuusliput
// (terassi, kasvis, vegaani, yöruoka, varattavissa…) POISTETTIIN omistajan
// päätöksellä: "ne eivät pidä välttämättä paikkansa niin voivat olla
// hämääviä" — kate on ~600/3600 paikkaa, joten suodatin hävitti enemmän
// oikeita osumia kuin löysi.
function SortFilterRow({ open, nearby, byReviews, minRating, count, onOpen, onNearby, onByReviews, onMinRating }: {
  open: boolean
  nearby: boolean
  byReviews: boolean
  minRating: number | null
  /** Näytetään suodatuksen tuloksena jäävä määrä; null = ei näytetä. */
  count: number | null
  onOpen: () => void
  onNearby: () => void
  onByReviews: () => void
  onMinRating: (v: number | null) => void
}) {
  const { t } = useLanguage()
  const on  = { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', color: '#fff' }
  const off = { background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)' }
  const pill = 'shrink-0 px-3 py-1.5 text-[12px] sm:px-4 sm:py-2 sm:text-sm rounded-full font-bold transition-all'
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap sm:overflow-x-auto scrollbar-none -mx-4 px-4">
      <button onClick={onOpen} className={pill} style={open ? on : off}>
        🟢 {t('idea.open_now')}
      </button>
      <button onClick={onNearby} className={pill} style={nearby ? on : off}>
        📍 {t('restaurants.sort_nearby')}
      </button>
      <button onClick={onByReviews} className={pill} style={byReviews ? on : off}>
        {t('restaurants.sort_reviews')}
      </button>
      {/* Tähtiraja liukusäätimellä: vasen laita (3,5) = ei rajaa. Raja on
          kirjaimellinen näkyvään arvosanaan — arvostelematon putoaa, koska
          sen tähtiä ei tiedetä. */}
      <label
        className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-[12px] sm:px-4 sm:py-2 sm:text-sm rounded-full font-bold"
        style={{
          background: minRating !== null ? 'rgba(251,191,36,.1)' : 'rgba(255,255,255,.06)',
          border: `1px solid ${minRating !== null ? 'rgba(251,191,36,.35)' : 'transparent'}`,
        }}
      >
        <span className={minRating !== null ? 'text-[#fbbf24]' : 'text-white/50'}>
          ⭐ {minRating !== null ? `≥ ${minRating.toFixed(1).replace('.', ',')}` : t('restaurants.stars_all')}
        </span>
        <input
          type="range"
          min={3.5}
          max={5}
          step={0.1}
          value={minRating ?? 3.5}
          aria-label={t('restaurants.min_rating_aria')}
          onChange={(e) => {
            const v = Number(e.target.value)
            onMinRating(v <= 3.5 ? null : Math.round(v * 10) / 10)
          }}
          className="w-20 sm:w-24 accent-[#fbbf24]"
        />
      </label>
      {count !== null && (
        <span className="shrink-0 text-[13px] font-bold text-white/35">{count} {t('restaurants.places')}</span>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────

export default function RestaurantsView({ onShowOnMap, jumpToId, jumpToKey }: {
  onShowOnMap?: (lat: number, lon: number, name: string) => void
  jumpToId?: string
  jumpToKey?: object
}) {
  const { t, lang } = useLanguage()
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
  // Selausnäkymän tähtiraja — sama liukusäädin kuin Suosituimmissa.
  const [browseMinRating, setBrowseMinRating] = useState<number | null>(null)
  const [browseByReviews, setBrowseByReviews] = useState(false)
  // Ominaisuussuodattimet (terassi, vegaani…) — monivalinta, JA-logiikka:
  // "terassi + vegaani" tarkoittaa molempia, koska sitä käyttäjä tarkoittaa.
  // ── Suosituimmat-listan omat suodattimet (omistajan pyyntö) ───────────────
  // Liukusäädin tähtirajalle ("asiakas voisi laittaa että esimerkiksi yli 4,7
  // tähteä vain näkyvät"), avoinna nyt, ja eniten arvosteluja -järjestys.
  // Erillään selausnäkymän suodattimista, jottei tila vuoda näkymien välillä.
  const [topOpenNow, setTopOpenNow] = useState(false)
  const [topByReviews, setTopByReviews] = useState(false)
  /** null = kaikki; muuten alaraja 3,6–5,0. Säätimen vasen laita = kaikki. */
  const [topMinRating, setTopMinRating] = useState<number | null>(null)
  const [topNearby, setTopNearby] = useState(false)

  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    fetch('/api/restaurants')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => setRestaurants(data.restaurants ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  // Open detail modal when navigated from search.
  // jumpToKey changes on every click (new object ref) so same restaurant can be reopened.
  useEffect(() => {
    if (!jumpToId || !restaurants.length) return
    const r = restaurants.find(r => r.id === jumpToId)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigointiparametrin (jumpToId) synkkaus valintatilaan; data tulee propseista, ei cascadea
    if (r) setSelectedRest(r)
  }, [jumpToKey, restaurants])


  useEffect(() => {
    // Uusi tyyppivälilehti nollaa suodattimet (näkymätön aktiivinen suodatin
    // muulla välilehdellä olisi selittämätön).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tarkoituksellinen suodatinreset välilehden vaihtuessa
    setSubCat('all'); setFilterOpen(false); setFilterNearby(false); setBrowseMinRating(null); setBrowseByReviews(false); setVisibleCount(48)
  }, [restType])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sivutuksen reset suodattimien muuttuessa
  useEffect(() => { setVisibleCount(48) }, [subCat, filterOpen, filterNearby, browseMinRating, browseByReviews])
  // Alakategorian avaus/vaihto vie listan alkuun — ei "puolesta välistä".
  // Auki/Lähellä-pillerit näkyvät nykyään myös alakategoriassa, joten
  // suodattimia ei enää nollata kategoriaan mentäessä (ei näkymätöntä vuotoa).
  // Palattaessa "Suosituimmat"-landingiin (subCat==='all') suodatintila nollataan
  // — tämä pitää pillerit ylhäällä ja aloittaa selauksen tuoreena kun käyttäjä
  // menee taas selausnäkymään. Kuratoidun listan visuaalisen suodattamattomuuden
  // TAKAA sortedPoolin `browsing`-gate (yllä), ei tämä paint-jälkeinen efekti.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pillerisuodattimien reset "Suosituimmat"-landingiin palattaessa
    if (subCat === 'all') { setFilterOpen(false); setFilterNearby(false); setBrowseMinRating(null); setBrowseByReviews(false) }
    else window.scrollTo(0, 0)
  }, [subCat])

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
  const handleTopNearby = useCallback(() => {
    setTopNearby(v => {
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
    // 'all' (Suosituimmat-landing) ja 'kaikki' (selaa kaikki -näkymä) = koko tyyppipooli
    if (subCat === 'all' || subCat === 'kaikki') return typePool
    return typePool.filter(r => matchesSubCat(r, restType, subCat))
  }, [typePool, subCat, restType])

  // Yksi päivä koko renderin ajaksi: uutuussyyn paino riippuu päivästä, ja
  // jos jokainen vertailu loisi oman Daten, lajittelu ei olisi vakaa.
  const sortToday = useMemo(() => new Date(), [])

  // Helsinki-kello tilana: poimintarivi ja aukiolomerkit elävät kellon
  // mukana. Päivitys 5 min välein — pitkään auki oleva välilehti ei jää
  // näyttämään aamun rivejä illalla.
  const [nyt, setNyt] = useState(() => helsinkiNow())
  useEffect(() => {
    const id = setInterval(() => setNyt(helsinkiNow()), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  // Pöydät nyt -poiminnat lasketaan täällä (ei komponentissa), jotta hero
  // voi väistää niitä — muuten sama paikka olisi rivin ykkösenä JA herona
  // heti sen alla (mitattu: Grön kahdesti peräkkäin). Pooli on VÄLILEHDEN
  // oma joukko: jokainen välilehti saa omat kellonaikapoimintansa.
  const poiminta = useMemo(() => poimiPoydat(typePool, nyt), [typePool, nyt])
  const poimintaIdt = useMemo(() => new Set(poiminta.poiminnat.map((r) => r.id)), [poiminta])

  const heroRest = useMemo(() => {
    // Hero on sivun käyntikortti → AINA laadukas paikka + hyvä kuva. Vaaditaan
    // kuva ja todistettu laatu (isRatedAtLeast 4 = ≥4★ & ≥50 arvostelua tai
    // Michelin/Bib) — ei nosteta huonoa kuvaa eikä matalan arvosanan pikaruokaa.
    // Lajitellaan samalla laatupisteellä kuin kärkipoiminnat; auki nyt -paikka
    // voittaa kärjen tasavertaisista, muttei koskaan tiputa laatua.
    // Hero on sivun käyntikortti, joten SYY ratkaisee tässä — ei pelkkä
    // arvosana. Ilman sitä kärkeen nousisi 99 TopMeal (4,9 / 1978) Grönin
    // (2★) sijaan: uskottava paikka, mutta ei se jolla sivun aloittaa.
    const heroScore = (r: Restaurant) =>
      (r.reasons ? reasonsWeight(r.reasons, sortToday) : 0) + restaurantQualityScore(r)
    const quality = typePool
      // Poimintaruudukossa jo näkyvät väistyvät herosta — ei samaa paikkaa
      // kahdesti peräkkäin (koskee nyt kaikkia välilehtiä).
      .filter(r => r.image && isRatedAtLeast(r, 4) && !poimintaIdt.has(r.id))
      .sort((a, b) => heroScore(b) - heroScore(a))
    const top = quality.slice(0, 12)
    return (
      top.find(r => r.openingHours && isOpenNow(r.openingHours) === true)
      ?? quality[0]
      ?? typePool.find(r => r.image)   // varapaikka: laatugate tyhjä (esim. harva tyyppi)
      ?? typePool[0]
      ?? null
    )
  }, [typePool, sortToday, poimintaIdt, restType])

  const sortedPool = useMemo(() => {
    let filtered = [...subPool]
    // Suosituimmat-landing (subCat==='all') on kuratoitu laatulista jota EI
    // suodateta — suodattimet vaikuttavat vain selausnäkymässä. Gate tehdään
    // tässä renderissä (ei vain paint-jälkeisessä nollausefektissä), jotta
    // selausnäkymästä palatessa vanha suodatintila (esim. ★4.5+) ei koskaan
    // ehdi välähtää yhtä frameä kuratoituun ruudukkoon.
    const browsing = subCat !== 'all'
    // Suosituimmat-listan suodattimet. Tähtiraja on KIRJAIMELLINEN: käyttäjä
    // sanoo "vain yli 4,7 näkyvät" ja juuri niin käy — arvostelematon paikka
    // ei läpäise rajaa, koska sen tähtiä ei tiedetä.
    if (!browsing) {
      if (topOpenNow) filtered = filtered.filter(r => r.openingHours && isOpenNow(r.openingHours) === true)
      if (topMinRating !== null) filtered = filtered.filter(r => (r.googleRating ?? 0) >= topMinRating)
    }
    if (browsing && filterOpen) filtered = filtered.filter(r => r.openingHours && isOpenNow(r.openingHours) === true)
    // Sama kirjaimellinen tähtiraja kuin Suosituimmissa. Vanhat ★4+/★4.5+
    // -portaat ja Googlen ominaisuusliput (terassi, kasvis…) poistuivat —
    // omistaja: liput "eivät pidä välttämättä paikkansa niin voivat olla
    // hämääviä" (kate ~600/3600 paikkaa).
    if (browsing && browseMinRating !== null) filtered = filtered.filter(r => (r.googleRating ?? 0) >= browseMinRating)
    if ((browsing ? filterNearby : topNearby) && userPos) {
      // Käyttäjä pyysi eksplisiittisesti lähimpiä → etäisyys voittaa
      filtered.sort((a, b) => (distMap.get(a.id) ?? Infinity) - (distMap.get(b.id) ?? Infinity))
    } else {
      // Oletus: laatu + kuva painottaen — kuvalliset vahvemmin kärkeen, mutta
      // arvosana pysyy pääasiallisena signaalina; tasapelissä arvostelumäärä
      filtered.sort((a, b) => {
        const sa = restaurantQualityScore(a) + (a.image ? IMG_WEIGHT : 0)
        const sb = restaurantQualityScore(b) + (b.image ? IMG_WEIGHT : 0)
        if (sb !== sa) return sb - sa
        // Arvostelumäärä ratkaisee vain kun uskottavuus on sama JA nollaa
        // suurempi. Nollakauhassa ovat sekä arvostelemattomat että tasan 1,0:n
        // arvosanan saaneet, eikä huonoin paikka saa nousta arvostelumäärällä
        // kaikkien tuntemattomien ohi.
        if (sa === 0) return 0
        return (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
      })
    }
    // PERUSTELLUT PAIKAT KÄRKEEN, MUTTA SEKAISIN. Yllä oleva lajittelu antaa
    // uskottavuusjärjestyksen; tämä nostaa syylliset sen eteen ja lomittaa
    // perheet, jottei sivu näytä lohkoilta (ensin kaikki Michelinit, sitten
    // kaikki 50 parasta…). Lähelläolo-suodatin on poikkeus: kun käyttäjä
    // pyytää nimenomaan lähimpiä, etäisyys saa voittaa syyn.
    // Kun käyttäjä valitsi järjestyksen itse (lähimmät tai eniten arvosteluja),
    // sekoitus väistyy. Lähimmät voittaa jos molemmat ovat päällä. Merkit
    // säilyvät korteissa silti. Suosituimmissa hero poistetaan tuplan estoksi.
    const dropHero = (list: Restaurant[]) =>
      !browsing && heroRest ? list.filter(r => r.id !== heroRest.id) : list
    if ((browsing ? filterNearby : topNearby) && userPos) return dropHero(filtered)
    if (browsing ? browseByReviews : topByReviews) {
      return [...dropHero(filtered)].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
    }
    // HERO POIS ENNEN SEKOITUSTA. Jos se poistetaan vasta ruudukkoa
    // piirrettäessä, lomitukseen jää aukko ja kaksi samaa perhettä päätyy
    // vierekkäin — mitattu: Grön (Michelin) putosi välistä, jolloin kaksi
    // uutta avausta jäi ensimmäiseksi pariksi.
    const withoutHero = subCat === 'all' && heroRest
      ? filtered.filter(r => r.id !== heroRest.id)
      : filtered
    return interleaveReasoned(
      withoutHero, (r) => r.reasons, sortToday, restaurantQualityScore,
      (r) => ({ rating: r.googleRating, reviews: r.reviewCount }),
    )
  }, [subPool, filterOpen, filterNearby, browseMinRating, browseByReviews, userPos, distMap, subCat, sortToday, heroRest, topOpenNow, topByReviews, topMinRating, topNearby])

  const groupedSortedPool = useMemo(() => groupByChain(sortedPool, distMap), [sortedPool, distMap])

  // ── AVOINNA ENSIN. Klo 21 kuratoitu kärki oli punaista Suljettu-seinää:
  // laatujärjestys ei tiennyt kellonajasta mitään. Vakaa ryhmittely (auki →
  // tuntematon → kiinni) säilyttää kuratoinnin ryhmien sisällä: päivällä
  // lähes kaikki on auki eikä mikään muutu, illalla auki olevat nousevat.
  // Käyttäjän oma järjestysvalinta (lähimmät, eniten arvosteluja) ohittaa
  // tämän — silloin järjestys on kirjaimellisesti se mitä pyydettiin.
  // Kello luetaan kerran per data-lataus: sivu ei elä kesken selauksen.
  const avoinRyhma = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of restaurants) {
      const o = isOpenNow(r.openingHours)
      m.set(r.id, o === true ? 0 : o === undefined ? 1 : 2)
    }
    return m
  }, [restaurants])
  const aikajarjestys = useCallback((items: RestItem[]) => {
    return [...items].sort((a, b) => {
      const ra = avoinRyhma.get('_isChain' in a ? a.representative.id : a.id) ?? 1
      const rb = avoinRyhma.get('_isChain' in b ? b.representative.id : b.id) ?? 1
      return ra - rb
    })
  }, [avoinRyhma])
  // Suosituimmat: kärkijoukko (60) pysyy samana, järjestys sen SISÄLLÄ on
  // aikatietoinen — kuratoitu valikoima ei köyhdy yöllä, se vain järjestyy.
  const suosituimmatNaytto = useMemo(() => {
    const karki = groupedSortedPool.slice(0, TOP_PICKS)
    return topNearby || topByReviews ? karki : aikajarjestys(karki)
  }, [groupedSortedPool, topNearby, topByReviews, aikajarjestys])
  // Selaus: koko lista aikajärjestykseen ennen sivutusta. Poikkeukset:
  //  - suosituimmat: kuratoitu kärki = sama 60 katkaisu kuin entisellä
  //    laskeutumisosiolla, järjestys sen sisällä aikatietoinen
  //  - michelin: oppaan arvojärjestys (tähdet → Bib → Green → valikoima)
  //    säilytetään — avoinna ensin -ryhmittely rikkoisi hierarkian, ja
  //    kortin merkki kertoo aukiolon muutenkin
  const selausNaytto = useMemo(() => {
    const pohja = subCat === 'suosituimmat' ? groupedSortedPool.slice(0, TOP_PICKS) : groupedSortedPool
    if (subCat === 'michelin') {
      const arvo = (item: RestItem) => {
        const r = '_isChain' in item ? item.representative : item
        if (r.michelinStars) return 3 - r.michelinStars
        if (r.bibGourmand) return 4
        if (r.greenMichelin) return 5
        return 6
      }
      return [...pohja].sort((a, b) => arvo(a) - arvo(b))
    }
    return filterNearby || browseByReviews ? pohja : aikajarjestys(pohja)
  }, [groupedSortedPool, filterNearby, browseByReviews, aikajarjestys, subCat])


  const clearFilter = useCallback(() => { setSubCat('all'); setFilterOpen(false); setFilterNearby(false); setBrowseMinRating(null); setBrowseByReviews(false); setTopOpenNow(false); setTopByReviews(false); setTopMinRating(null); setTopNearby(false) }, [])

  return (
    <main className="max-w-6xl mx-auto px-4 pt-4 pb-24 space-y-4">

      {/* Heading */}
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">HELSINKI</p>
        <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.8rem,6vw,3rem)', letterSpacing: '-0.03em' }}>
          {t('restaurants.heading')}
        </h1>
      </div>

      {/* Type tabs — always visible */}
      <TypeTabs active={restType} onChange={setRestType} />

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
            {/* Ilman ellipsiä: kolme pistettä on kartan tekstissä (map.loading_rests),
                tässä spinneri hoitaa saman viestin eikä pisteitä ole koskaan ollut. */}
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: '-0.01em' }}>{t('restaurants.loading_short')}</span>
          </div>
        </div>
      )}

      {/* Latausvirhe — ei harhaanjohtavaa tyhjää näkymää */}
      {!loading && loadError && restaurants.length === 0 && (
        <div className="rounded-2xl p-6 text-center space-y-3 my-4" style={{ background: 'rgba(255,80,80,.06)', border: '1px solid rgba(255,80,80,.2)' }}>
          <p className="text-4xl">📡</p>
          <p className="text-white font-black">{t('restaurants.error')}</p>
          <button onClick={() => window.location.reload()}
            className="rounded-xl px-5 py-3 font-black text-white"
            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {!loading && !(loadError && restaurants.length === 0) && (
        <>
          {/* ═══ ETUSIVU (subCat 'all') ═══
               JÄRJESTYS: hero → kuratoitu kärki → uutiset → kategoriat.

               Kärki oli ennen NELJÄNTENÄ, kategoriaruudukon ja uutisosion
               takana — eli kolmen ruudun päässä. Sivun tarkoitus on palvella
               kävijää joka EI TIEDÄ mitä haluaa, ja hänelle kategorialista on
               kysymys, ei vastaus. Vastaus on paikka jolla on syy: Michelin,
               Suomen 50 parasta, Vuoden ravintola, Time Out tai tuore avaus.
               Se tulee nyt heti. Kategoriat jäävät alle sitä varten, kun
               kävijä TIETÄÄ mitä hakee. Listalla on omat suodattimensa
               (tähtiraja liukusäätimellä, avoinna nyt, eniten arvosteluja) —
               omistajan pyyntö: "nämä ovat tärkeitä mitä ihmiset varmasti
               käyttävät". ═══ */}
          {subCat === 'all' && (
            <>
              {heroRest && (
                <HeroCard r={heroRest} distance={distMap.get(heroRest.id)} onShowOnMap={onShowOnMap} />
              )}

              {/* Kategoriat HETI heron alla — sama järjestys kuin etusivulla
                  (hero → kategoriat → poiminnat), omistaja 3.9.2026. */}
              <SubCatGrid restType={restType} onSelect={setSubCat} />

              {/* Pöydät nyt — kellonaikaan sidottu, päivittäin vaihtuva
                  valikoima välilehden omista paikoista, omilla otsikoillaan
                  (Illan pöydät / Illan kahvilat / Illan baarit / Yön klubit). */}
              <PoydatNyt poiminta={poiminta} nyt={nyt} restType={restType} onOpen={setSelectedRest} />

              {/* Kärkipoiminnat: ~60 parasta. Osio korvattiin KAIKILLA
                  tyypeillä Suosituimmat-kategorialla (omistaja 3.9.2026) ja
                  näytetään vain varasääntönä kun poimintarivi on tyhjä —
                  laskeutumissivu ei saa jäädä pelkäksi heroksi (esim.
                  yökerhot päiväsaikaan, kaikki kiinni → tämä näkyy). */}
              {poiminta.poiminnat.length === 0 && (
              <section className="space-y-3">
                  <h2 className="font-black text-white text-[18px]" style={{ letterSpacing: '-0.02em' }}>
                    {'⭐ '}{t('restaurants.most_popular')} {(() => {
                      const tab = TYPE_TABS.find(tt => tt.id === restType)
                      return tab ? t(tab.tKey).toLowerCase() : ''
                    })()}
                  </h2>

                  {/* Suosituimmat-listan suodattimet — sama rivi kuin
                      selausnäkymässä (SortFilterRow), oma tila. */}
                  <SortFilterRow
                    open={topOpenNow} nearby={topNearby} byReviews={topByReviews} minRating={topMinRating}
                    count={topOpenNow || topByReviews || topMinRating !== null || topNearby ? groupedSortedPool.length : null}
                    onOpen={() => setTopOpenNow(v => !v)}
                    onNearby={handleTopNearby}
                    onByReviews={() => setTopByReviews(v => !v)}
                    onMinRating={setTopMinRating}
                  />

              {groupedSortedPool.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
                    {suosituimmatNaytto.map(item =>
                      '_isChain' in item
                        ? <ChainListCard key={item.key} chain={item} onClick={setSelectedChain} />
                        : <RestListCard key={item.id} r={item} distance={distMap.get(item.id)} onShowOnMap={onShowOnMap} onOpen={setSelectedRest} />
                    )}
                  </div>
                  {groupedSortedPool.length > TOP_PICKS && (
                    <p className="text-center text-[13px] font-bold text-white/35 pt-1">
                      {t('restaurants.find_more_categories')}
                    </p>
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
              </section>
              )}

            </>
          )}

          {/* ═══ ALAKATEGORIAN PYSTYLISTA — alleviivatabit + yksipalstainen lista ═══ */}
          {subCat !== 'all' && (
            <>
              <button onClick={() => setSubCat('all')}
                className="flex items-center gap-2 text-[13.5px] font-black text-white/50 hover:text-white transition-colors -mb-1"
                style={{ letterSpacing: '-0.01em' }}>
                ← {t('common.back')}
              </button>

              <div className="flex items-center justify-between">
                <h2 className="font-black text-white text-[19px]" style={{ letterSpacing: '-0.02em' }}>
                  {(() => {
                    if (subCat === 'kaikki') {
                      const tab = TYPE_TABS.find(tt => tt.id === restType)
                      return `${t('common.all')} ${tab ? t(tab.tKey).toLowerCase() : ''}`
                    }
                    const cat = SUB_CATS[restType].find(c => c.id === subCat)
                    return `${cat?.emoji ?? ''} ${cat ? t(cat.tKey) : ''}`
                  })()}
                  <span className="text-white/30 text-[14px] font-bold"> · {selausNaytto.length} {t('restaurants.places')}</span>
                </h2>
              </div>

              <SortFilterRow
                open={filterOpen} nearby={filterNearby} byReviews={browseByReviews} minRating={browseMinRating}
                count={null}
                onOpen={handleToggleOpen} onNearby={handleToggleNearby}
                onByReviews={() => setBrowseByReviews(v => !v)} onMinRating={setBrowseMinRating}
              />

              {selausNaytto.length > 0 ? (
                <>
                  {/* Mobiilissa pystylista; leveällä 2-3 vierekkäin kuten ennen */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
                    {selausNaytto.slice(0, visibleCount).map(item =>
                      '_isChain' in item
                        ? <ChainListCard key={item.key} chain={item} onClick={setSelectedChain} />
                        : <RestListCard key={item.id} r={item} distance={distMap.get(item.id)} onShowOnMap={onShowOnMap} onOpen={setSelectedRest} />
                    )}
                  </div>
                  {visibleCount < selausNaytto.length && (
                    <button
                      onClick={() => setVisibleCount(v => v + 24)}
                      className="w-full py-3 rounded-2xl text-sm font-black text-white/50 hover:text-white/80 transition-all"
                      style={{ background: 'rgba(255,255,255,.05)' }}>
                      {t('restaurants.load_more')} ({selausNaytto.length - visibleCount} {t('restaurants.places')})
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

      {/* Ravintolapaneeli — tapahtumapaneelin kuori ja visuaalinen kieli
          (pyyhkäisysulku, historiamerkintä; omistaja 4.9.2026). */}
      <RestaurantDetailPanel
        r={selectedRest}
        tyyli={selectedRest ? getCuisineStyle(selectedRest) : undefined}
        onClose={() => setSelectedRest(null)}
        onShowOnMap={onShowOnMap}
      />
    </main>
  )
}
