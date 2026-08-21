// Yhtenäinen "kortti" ryhmäpäätöskoneelle: Event | Restaurant | Activity → yksi
// muoto, jonka päälle swaippaus + AI-synteesi rakentuvat. Sisältää laatuportit
// (ei huonoja arvosanoja, ei kiinni olevia, ei kuvattomia geneerisiä) ja illan
// ROOLIT (🍸 drinks · 🍽 food · ✨ activity · 🎸 program). Pisteytys nojaa samoihin
// signaaleihin kuin näkymien kuratointi (RestaurantsView restaurantQualityScore /
// isRatedAtLeast, ActivitiesView localScore, HomeClient bestPicks).
import type { Event, Restaurant, Activity, ActivityCategory } from '@/lib/types'
import { NEIGHBORHOODS } from '@/lib/types'
import { isOpenNow } from '@/lib/opening-hours'
import { helsinkiDateOf } from '@/lib/helsinki-time'
import { venueHoursOverride } from '@/lib/venue-hours-overrides'
import { seedRand } from '@/lib/seed-rand'

export type CandidateType = 'event' | 'restaurant' | 'activity'
export type CandidateRole = 'drinks' | 'food' | 'activity' | 'program'
export type GroupWhen = 'tonight' | 'day' | 'weekend'
// Legacy-fiilis (vanhat sessiot) — uudet scene-id:t menevät samassa sarakkeessa.
export type Fiilis = 'menoa' | 'rento' | 'kulttuuri' | 'ulkoilu' | 'ruoka'
// Scene-id:t (v3): konkreettiset valinnat abstraktien fiilisten tilalle.
export type SceneId = 'ruoka' | 'keikka' | 'kulttuuri' | 'ulkona' | 'baarit' | 'sauna' | 'perhe' | 'ilmaista'
export type BudgetId = 'any' | 'free' | 'e' | 'ee'

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
  tags?: string[]          // scene-osumia varten: event→vibes, activity→kategoria, restaurant→tyyppi
  openingHours?: string    // OSM opening_hours (restaurant/activity) — aukiolotietoinen aikataulutus
  rating?: number
  reviewCount?: number
  isOpen?: boolean         // isOpenNow-tulos (undefined = tuntematon; ei arvattu)
  dateISO?: string         // vain tapahtumat: tapahtuman alkupäivä (YYYY-MM-DD, Helsinki) — kaarpäiväsuodatusta varten
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
// Venuet, joilla on OMA tapahtumaskraperi — niiden keikat tulevat pakkaan
// oikeina tapahtumakortteina (nimetty keikka + oikea alkamisaika). Näiden
// paikkojen geneerinen yokerho-kortti pääohjelmaroolissa on virhe: paikkaa ei
// voi ehdottaa pääohjelmaksi ilman nimettyä keikkaa (käyttäjätapaus 8/2026:
// "G Livelab klo 22.15" — ei keikan nimeä, ei oikeaa aikaa, keikkaa ei
// löytynyt). Normalisoidut nimet (lowercase, trim).
const SCRAPED_VENUE_PROGRAM_SUPPRESS = new Set([
  'g livelab',
  'juttutupa',
  'lepakkomies',
  'flying dutch',
  'kulttuuritalo',
  'post bar',
  'korjaamo',
  'malmitalo',
  'vuotalo',
  'savoy-teatteri',
  'nauramaan',
  'tavastia',
  'tavastia-klubi',
  'kuudes linja',
  'bar loose',
  'ääniwalli',
])

// isRatedAtLeast-logiikan mukaelma (RestaurantsView): Michelin/Bib korvaa
// arvostelumäärän ja puuttuvan arvosanan, muttei kynnyksen alittavaa arvosanaa.
function restaurantPasses(r: Restaurant, enforceOpen: boolean): boolean {
  // Skrapatut venuet eivät saa tulla geneerisenä pääohjelmana — niiden
  // ohjelma näkyy oikeina tapahtumakortteina tai ei lainkaan.
  if (r.type === 'yokerho' && SCRAPED_VENUE_PROGRAM_SUPPRESS.has(r.name.toLowerCase().trim())) return false
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
    tags: [r.type],
    openingHours: r.openingHours ?? undefined,
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
    tags: [a.category],
    // Kuratoidut aukiolokorjaukset yliajavat lähteen (venue-hours-overrides.ts)
    openingHours: venueHoursOverride(a.name) ?? a.openingHours ?? undefined,
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
    dateISO: helsinkiDateOf(e.startTime),
    tags: vibes,
    _score: s,
  }
}

// ── Scene- ja legacy-painotus (PAINOTTAA roolin sisällä, ei poista alatyyppiä) ──
function hasAnyTag(c: Candidate, wanted: string[]): boolean {
  return !!c.tags && wanted.some(t => c.tags!.includes(t))
}

function fiilisBoost(c: Candidate, fiilis: string[]): number {
  if (fiilis.length === 0) return 0
  let b = 0
  for (const f of fiilis) {
    // Scene-id:t (v3) — vahvempi vaikutus, koska ne ovat konkreettisia
    if (f === 'ruoka' && c.role === 'food') b += 3
    if (f === 'baarit' && c.role === 'drinks') b += 3
    if (f === 'keikka' && c.role === 'program') b += 3
    if (f === 'kulttuuri' && (hasAnyTag(c, ['teatteri', 'taide', 'museo', 'klassinen', 'galleria', 'nahtavyys']) || c.type === 'event')) b += 2.5
    if (f === 'ulkona' && hasAnyTag(c, ['uimaranta', 'puisto', 'nakopaikka', 'nahtavyys', 'markkina'])) b += 2.5
    if (f === 'sauna' && hasAnyTag(c, ['sauna'])) b += 4
    if (f === 'perhe' && hasAnyTag(c, ['lapset'])) b += 4
    // Legacy-fiilis (vanhat sessiot toimivat edelleen)
    if (f === 'menoa' && (c.role === 'program' || c.role === 'drinks')) b += 1.5
    if (f === 'rento' && (c.role === 'food' || c.role === 'activity')) b += 0.6
    if (f === 'ulkoilu' && c.role === 'activity') b += 1.2
  }
  return b
}

// Budjettisuodatin (KOVAT rajat): ravintoloilla hintataso, tapahtumilla isFree.
// Tapahtumien tarkkaa hintaa ei tiedetä → vain 'free' rajoittaa niitä.
function budgetOk(c: Candidate, budget: BudgetId): boolean {
  if (budget === 'any') return true
  if (budget === 'free') return c.isFree === true
  const maxLevel = budget === 'e' ? 2 : 3
  if (c.type === 'restaurant') return (c.priceLevel ?? 2) <= maxLevel
  return true
}

// Aluesuodatin valittujen alueiden bbox-unionilla. Koordinaatittomat kortit
// SÄILYTETÄÄN — puuttuvasta datasta ei rangaista. Tyhjä/kaikki = ei rajaa.
function areaOk(c: Candidate, areas?: string[]): boolean {
  if (!areas || areas.length === 0) return true
  if (c.lat == null || c.lon == null) return true
  for (const id of areas) {
    const bbox = NEIGHBORHOODS.find(n => n.id === id)?.bbox
    if (!bbox) continue
    const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number)
    if (c.lon >= minLon && c.lon <= maxLon && c.lat >= minLat && c.lat <= maxLat) return true
  }
  return false
}

export interface DeckInput {
  events: Event[]
  restaurants: Restaurant[]
  activities: Activity[]
  activityRatings: Map<string, { rating: number; reviewCount: number }>  // avain: nimi.toLowerCase() (act: yliajaa)
}
export interface DeckOptions {
  when: GroupWhen
  fiilis: string[]       // legacy-fiilis JA uudet scene-id:t (tietokannassa vapaamuotoisena)
  size?: number          // pakan koko (oletus 24)
  budget?: BudgetId      // v3: budjettisuodatin
  areas?: string[]       // v3.1: valitut alueet (bbox-unioni; tyhjä = ei rajaa)
  weather?: { rainExpected: boolean } | null  // sade: ulkokohteet alas, sisä ylös
  seed?: string          // siemen vaihteluun: sama siemen → sama pakka (ryhmä),
                         // eri siemen → eri pakka (uusi sessio / rematch)
  excludeIds?: Set<string>  // kortit joita EI saa ottaa (edellisen kierroksen pakka)
}

// Pieni deterministinen PRNG siemenvaihteluun — siirretty jaettuun
// lib/seed-rand.ts:ään (myös idea-deck käyttää); säilyy taaksepäinyhteensopivuus.

// Sateen vaikutukset pisteytykseen (open-meteo, ryhmäpäätöspakka)
const OUTDOOR_RAIN_CATS: ActivityCategory[] = ['uimaranta', 'puisto', 'nakopaikka', 'nahtavyys']
const INDOOR_RAIN_BOOST_CATS: ActivityCategory[] = ['museo', 'galleria', 'sauna', 'markkina']

// Takaa kirjon: jokaisesta roolista vähintään minPerRole (jos ehdokkaita on),
// loput parhaan pisteen mukaan. Interleave roolien yli → swaippaus vaihtelee.
export function buildDeck(input: DeckInput, opts: DeckOptions): Candidate[] {
  const size = opts.size ?? 24
  const budget: BudgetId = opts.budget ?? 'any'
  const enforceOpen = opts.when === 'tonight'   // vain "tänä iltana" karsii kiinniolevat nyt
  const rand = seedRand(opts.seed ?? 'paatakaa')
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
  // Menneet tapahtumat EIVÄT saa tulla pakkaan: sessio voi luoda paitsi
  // kaaren kutomisajankohdan — 30 min armo (keikkaan klo 19.05 ei enää ehdi).
  const nowMs = Date.now()
  for (const e of input.events) {
    if (new Date(e.startTime).getTime() < nowMs - 30 * 60 * 1000) continue
    if (eventPasses(e)) all.push(eventToCandidate(e))
  }

  // Fiilis/scene painottaa (soft), budjetti+alue suodattavat (hard), sää
  // säätää ulkokohteita (sade), sitten dedup titlellä.
  // SIEMEN-MAUSTE: ±8 % pisteytystä, deterministinen siemenestä — samoilla
  // syötteillä ei enää tule JOKA kerta samoja kortteja. Laatulattiat ovat jo
  // ajettu yllä; tämä vain vaihtelee mitkä kelpuutetuista pääsevät mukaan.
  const rain = opts.weather?.rainExpected === true
  const seen = new Set<string>()
  const scored = all
    .map(c => {
      let s = c._score + fiilisBoost(c, opts.fiilis)
      if (rain && c.type === 'activity' && c.tags?.some(t => OUTDOOR_RAIN_CATS.includes(t as ActivityCategory))) s -= 3.5
      if (rain && c.tags?.some(t => INDOOR_RAIN_BOOST_CATS.includes(t as ActivityCategory))) s += 0.8
      s *= 0.92 + rand() * 0.16
      return { ...c, _score: s }
    })
    .filter(c => budgetOk(c, budget) && areaOk(c, opts.areas) && (!opts.fiilis.includes('ilmaista') || c.isFree === true) && !opts.excludeIds?.has(c.id))
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

  // Scene/fiilis kasvattaa suosikkiroolin osuutta pakassa (3 korttia/kierros vs 1) —
  // PAINOTUS, ei poissulku: kaikki roolit saavat silti minPerRole-takuun.
  const roleWeight = (role: CandidateRole): number => {
    for (const f of opts.fiilis) {
      if (f === 'ruoka' && role === 'food') return 3
      if (f === 'baarit' && role === 'drinks') return 3
      if ((f === 'keikka' || f === 'menoa') && (role === 'program' || role === 'drinks')) return 3
      if ((f === 'ulkona' || f === 'ulkoilu') && role === 'activity') return 3
      if (f === 'kulttuuri' && (role === 'activity' || role === 'program')) return 3
      if ((f === 'sauna' || f === 'perhe') && role === 'activity') return 3
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

  // 3. DISCOVERY-PAIKAT: korvaa muutama hännän kortti siemen-valituilla
  //    "yllätyksillä" pistekaistan keskeltä (laatulattian läpäisseitä, ei
  //    kärkipaikkoja) — joka pakassa on aina jotain uutta, ei aina samoja.
  //    Merkitään 🎲-badgella (paitsi jos kortilla on jo arvokkaampi badge).
  const discoverySlots = picked.length >= size ? Math.min(3, Math.max(1, Math.floor(size / 8))) : 0
  if (discoverySlots > 0) {
    const inPicked = new Set(picked.map(c => c.id))
    const band = scored.slice(size, size * 4).filter(c => !inPicked.has(c.id))
    for (let s = 0; s < discoverySlots && band.length > 0; s++) {
      const idx = Math.floor(rand() * band.length)
      const [c] = band.splice(idx, 1)
      picked[picked.length - 1 - s] = { ...c, badge: c.badge ?? '🎲 Yllätys' }
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
