// Yhtenäinen "kortti" ryhmäpäätöskoneelle: Event | Restaurant | Activity → yksi
// muoto, jonka päälle swaippaus + AI-synteesi rakentuvat. Sisältää laatuportit
// (ei huonoja arvosanoja, ei kiinni olevia, ei kuvattomia geneerisiä) ja illan
// ROOLIT (🍸 drinks · 🍽 food · ✨ activity · 🎸 program). Pisteytys nojaa samoihin
// signaaleihin kuin näkymien kuratointi (RestaurantsView restaurantQualityScore /
// isRatedAtLeast, ActivitiesView localScore, HomeClient bestPicks).
import type { Event, Restaurant, Activity, ActivityCategory } from '@/lib/types'
import { isOpenNow } from '@/lib/opening-hours'

export type CandidateType = 'event' | 'restaurant' | 'activity'
export type CandidateRole = 'drinks' | 'food' | 'activity' | 'program'
export type GroupWhen = 'tonight' | 'day' | 'weekend'
export type Fiilis = 'menoa' | 'rento' | 'kulttuuri' | 'ulkoilu' | 'ruoka'

export interface Candidate {
  id: string
  type: CandidateType
  role: CandidateRole
  title: string
  why: string
  emoji: string
  image: string | null
  address?: string
  lat?: number
  lon?: number
  url?: string
  badge?: string
  time?: string
  isFree?: boolean
  priceLevel?: number      // 1–4
  rating?: number
  reviewCount?: number
  isOpen?: boolean         // isOpenNow-tulos (undefined = tuntematon; ei arvattu)
  _score: number           // sisäinen järjestys, ei UI:hin
}

export const ROLE_META: Record<CandidateRole, { emoji: string; label: string }> = {
  drinks:   { emoji: '🍸', label: 'Drinkit' },
  food:     { emoji: '🍽', label: 'Ruoka' },
  activity: { emoji: '✨', label: 'Tekeminen' },
  program:  { emoji: '🎸', label: 'Pääohjelma' },
}

const ACT_EMOJI: Record<ActivityCategory, string> = {
  sauna: '🧖', museo: '🏛', nahtavyys: '📸', galleria: '🎨', nakopaikka: '🌆',
  uimaranta: '🏖', puisto: '🌳', markkina: '🛍', urheilu: '⚽', muu: '📍',
}
// Ulkokohteet ilman aukioloa lasketaan aina auki (sama sääntö kuin ActivitiesView).
const OUTDOOR_ALWAYS_OPEN: ActivityCategory[] = ['uimaranta', 'puisto', 'nakopaikka', 'nahtavyys']
// Kuratoitavat aktiviteettikategoriat (aito kohde, ei geneerinen kenttä/puisto).
const ACT_CURATED: ActivityCategory[] = ['sauna', 'museo', 'galleria', 'nakopaikka', 'uimaranta', 'markkina', 'nahtavyys']
const ACT_TOURIST_DEMOTE = /^(suomenlinna|(helsingin )?tuomiokirkko|uspenskin katedraali|temppeliaukion kirkko|senaatintori|(vanha )?kauppatori)$/i

function trimWhy(s: string | null | undefined, max = 130): string {
  if (!s) return ''
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean
}

// Bayes-kutistettu arvosanapiste (sama prior kuin RestaurantsView: 50 @ 4.2).
function bayes(rating: number | undefined, reviews: number | undefined, m = 50, prior = 4.2): number {
  if (rating == null) return 0
  const v = reviews ?? 0
  return (v * rating + m * prior) / (v + m)
}

// ── Restaurant → Candidate ────────────────────────────────────────────────
function restaurantRole(r: Restaurant): CandidateRole {
  if (r.type === 'baari') return 'drinks'
  if (r.type === 'yokerho') return 'program'
  return 'food' // ravintola | kahvila | pikaruoka | muu
}
function restaurantEmoji(r: Restaurant): string {
  if (r.type === 'baari') return '🍸'
  if (r.type === 'yokerho') return '🎉'
  if (r.type === 'kahvila') return '☕'
  return '🍽'
}
// isRatedAtLeast-logiikan mukaelma (RestaurantsView): Michelin/Bib korvaa
// arvostelumäärän ja puuttuvan arvosanan, muttei kynnyksen alittavaa arvosanaa.
function restaurantPasses(r: Restaurant, enforceOpen: boolean): boolean {
  const award = !!(r.michelinStars || r.bibGourmand || r.michelinRecommended)
  // Auki-portti vain kun kyse on TÄSTÄ hetkestä (tonight). 'day'/'weekend' ovat
  // laajempia ikkunoita → nykyhetken kiinniolo ei saa karsia (avautuu myöhemmin).
  if (enforceOpen && isOpenNow(r.openingHours) === false) return false
  if (r.googleRating != null) {
    if (r.googleRating < 4.0) return false                  // näkyvä huono arvosana → pois
    if ((r.reviewCount ?? 0) < 50 && !award) return false   // liian harva arvostelu ilman tunnustusta
  } else if (!award) {
    return false                                            // ei arvosanaa eikä tunnustusta → pois
  }
  return !!(r.image || award)                                // vaadi kuva tai tunnustus (visuaalinen pakka)
}
function restaurantToCandidate(r: Restaurant): Candidate {
  const award = r.michelinStars ? 0.6 : (r.bibGourmand || r.michelinRecommended) ? 0.35 : 0
  const badge = r.michelinStars ? `${'⭐'.repeat(r.michelinStars)} Michelin`
    : r.bibGourmand ? 'Bib Gourmand'
    : r.michelinRecommended ? 'Michelin' : undefined
  return {
    id: `r-${r.id}`,
    type: 'restaurant',
    role: restaurantRole(r),
    title: r.name,
    why: trimWhy(r.blurb || r.description),
    emoji: restaurantEmoji(r),
    image: r.image,
    address: r.address || undefined,
    lat: r.lat, lon: r.lon,
    url: r.www || undefined,
    badge,
    priceLevel: r.priceRange,
    rating: r.googleRating,
    reviewCount: r.reviewCount,
    isOpen: isOpenNow(r.openingHours),
    _score: bayes(r.googleRating, r.reviewCount) + award + (r.image ? 0.25 : 0),
  }
}

// ── Activity → Candidate ──────────────────────────────────────────────────
function activityPasses(a: Activity, rating: { rating: number; reviewCount: number } | undefined, enforceOpen: boolean): boolean {
  if (enforceOpen) {
    const openRaw = isOpenNow(a.openingHours)
    const open = openRaw === undefined && OUTDOOR_ALWAYS_OPEN.includes(a.category) ? true : openRaw
    if (open === false) return false
  }
  // Kelpoisuus: aito kuratoitava kategoria TAI kuva TAI arvosana (kuten ActivitiesView).
  return ACT_CURATED.includes(a.category) || !!a.image || !!rating
}
function activityToCandidate(a: Activity, rating?: { rating: number; reviewCount: number }): Candidate {
  const ACT_CAT_WEIGHT: Record<ActivityCategory, number> = {
    sauna: 5, nakopaikka: 5, uimaranta: 4, galleria: 4, markkina: 4, museo: 3, nahtavyys: 2, puisto: 1, urheilu: 0.5, muu: 1,
  }
  let s = ACT_CAT_WEIGHT[a.category] ?? 1
  if (a.image) s += 3
  if (rating) s += (bayes(rating.rating, rating.reviewCount, 20) - 4.0) * 1.5
  if (ACT_TOURIST_DEMOTE.test(a.name)) s -= 4
  const openRaw = isOpenNow(a.openingHours)
  return {
    id: `a-${a.id}`,
    type: 'activity',
    role: 'activity',
    title: a.name,
    why: trimWhy(a.description),
    emoji: ACT_EMOJI[a.category] ?? '📍',
    image: a.image,
    address: a.address || undefined,
    lat: a.lat, lon: a.lon,
    url: a.www || undefined,
    badge: a.fee === false ? 'Ilmainen' : undefined,
    isFree: a.fee === false,
    rating: rating?.rating,
    reviewCount: rating?.reviewCount,
    isOpen: openRaw === undefined && OUTDOOR_ALWAYS_OPEN.includes(a.category) ? true : openRaw,
    _score: s,
  }
}

// ── Event → Candidate ─────────────────────────────────────────────────────
function eventPasses(e: Event): boolean {
  // Visuaalinen pakka: vaadi kuva + edes vähän kuvausta (ei tyhjiä rivejä).
  return !!e.image && (e.shortDescription || e.description || '').trim().length > 20
}
function eventToCandidate(e: Event): Candidate {
  const vibes = e.vibes ?? []
  let s = 3
  if (vibes.includes('festivaali') || e.source === 'festivals') s += 3
  if (vibes.includes('keikka')) s += 2.5
  if (vibes.includes('yoelama') || vibes.includes('underground')) s += 2
  if (vibes.includes('teatteri') || vibes.includes('taide') || vibes.includes('standup') || vibes.includes('klassinen')) s += 1.5
  if (e.isFree) s += 0.5
  let time: string | undefined
  try {
    const d = new Date(e.startTime)
    time = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
  } catch { time = undefined }
  return {
    id: `e-${e.id}`,
    type: 'event',
    role: 'program',
    title: e.title,
    why: trimWhy(e.shortDescription || e.description),
    emoji: vibes.includes('keikka') ? '🎸' : vibes.includes('festivaali') ? '🎪' : vibes.includes('teatteri') ? '🎭' : '🎫',
    image: e.image,
    address: e.location?.streetAddress || e.location?.name || undefined,
    lat: e.location?.lat, lon: e.location?.lon,
    url: e.ticketUrl || e.infoUrl || undefined,
    badge: e.isFree ? 'Ilmainen' : undefined,
    time,
    isFree: e.isFree,
    _score: s,
  }
}

// ── Fiilis-painotus (PAINOTTAA roolin sisällä, ei koskaan poista alatyyppiä) ──
function fiilisBoost(c: Candidate, fiilis: Fiilis[]): number {
  if (fiilis.length === 0) return 0
  let b = 0
  for (const f of fiilis) {
    if (f === 'ruoka' && c.role === 'food') b += 2
    if (f === 'menoa' && (c.role === 'program' || c.role === 'drinks')) b += 1.5
    if (f === 'rento' && (c.role === 'food' || c.role === 'activity')) b += 0.6
    if (f === 'kulttuuri' && c.type === 'event') b += 1.2
    if (f === 'kulttuuri' && c.type === 'activity') b += 1.2   // museot/galleriat ovat activity-roolissa
    if (f === 'ulkoilu' && c.role === 'activity') b += 1.2
  }
  return b
}

export interface DeckInput {
  events: Event[]
  restaurants: Restaurant[]
  activities: Activity[]
  activityRatings: Map<string, { rating: number; reviewCount: number }>  // avain: nimi.toLowerCase() (act: yliajaa)
}
export interface DeckOptions {
  when: GroupWhen
  fiilis: Fiilis[]
  size?: number          // pakan koko (oletus 24)
}

// Takaa kirjon: jokaisesta roolista vähintään minPerRole (jos ehdokkaita on),
// loput parhaan pisteen mukaan. Interleave roolien yli → swaippaus vaihtelee.
export function buildDeck(input: DeckInput, opts: DeckOptions): Candidate[] {
  const size = opts.size ?? 24
  const enforceOpen = opts.when === 'tonight'   // vain "tänä iltana" karsii kiinniolevat nyt
  const all: Candidate[] = []

  for (const r of input.restaurants) {
    if (restaurantPasses(r, enforceOpen)) all.push(restaurantToCandidate(r))
  }
  for (const a of input.activities) {
    const key = a.name.toLowerCase().trim()
    // VAIN act:-avain — paljas nimi voisi osua ravintolan arvosanaan (nimitörmäys).
    const rt = input.activityRatings.get(`act:${key}`)
    if (activityPasses(a, rt, enforceOpen)) all.push(activityToCandidate(a, rt))
  }
  for (const e of input.events) {
    if (eventPasses(e)) all.push(eventToCandidate(e))
  }

  // Fiilis painottaa (soft), sitten dedup titlellä
  const seen = new Set<string>()
  const scored = all
    .map(c => ({ ...c, _score: c._score + fiilisBoost(c, opts.fiilis) }))
    .sort((x, y) => y._score - x._score)
    .filter(c => {
      const k = c.title.toLowerCase().trim()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

  // Ryhmittele rooleihin ja takaa kirjo
  const byRole: Record<CandidateRole, Candidate[]> = { drinks: [], food: [], activity: [], program: [] }
  for (const c of scored) byRole[c.role].push(c)

  const roles: CandidateRole[] = ['food', 'drinks', 'activity', 'program']
  const minPerRole = Math.max(2, Math.floor(size / (roles.length * 2)))
  const picked: Candidate[] = []
  const cursor: Record<CandidateRole, number> = { drinks: 0, food: 0, activity: 0, program: 0 }

  // Fiilis kasvattaa suosikkiroolin osuutta pakassa (2 korttia/kierros vs 1) —
  // PAINOTUS, ei poissulku: kaikki roolit saavat silti minPerRole-takuun.
  const roleWeight = (role: CandidateRole): number => {
    for (const f of opts.fiilis) {
      if (f === 'ruoka' && role === 'food') return 2
      if (f === 'menoa' && (role === 'program' || role === 'drinks')) return 2
      if (f === 'ulkoilu' && role === 'activity') return 2
      if (f === 'kulttuuri' && (role === 'activity' || role === 'program')) return 2
    }
    return 1
  }

  // 1. Takaa minPerRole jokaiselle roolille (kirjo) — mutta älä ylitä kokoa
  for (const role of roles) {
    for (let i = 0; i < minPerRole && cursor[role] < byRole[role].length && picked.length < size; i++) {
      picked.push(byRole[role][cursor[role]++])
    }
  }
  // 2. Täytä loput painotetulla round-robinilla (fiilis-suosikit useammin)
  let progress = true
  while (picked.length < size && progress) {
    progress = false
    for (const role of roles) {
      if (picked.length >= size) break
      const take = roleWeight(role)
      for (let k = 0; k < take && picked.length < size && cursor[role] < byRole[role].length; k++) {
        picked.push(byRole[role][cursor[role]++])
        progress = true
      }
    }
  }

  // Interleave: järjestä niin että peräkkäiset kortit ovat eri roolia (vaihtelu)
  picked.sort((a, b) => b._score - a._score)
  const queues: Record<CandidateRole, Candidate[]> = { drinks: [], food: [], activity: [], program: [] }
  for (const c of picked) queues[c.role].push(c)
  const out: Candidate[] = []
  let any = true
  while (any) {
    any = false
    for (const role of roles) {
      const q = queues[role]
      if (q.length) { out.push(q.shift()!); any = true }
    }
  }
  return out
}
