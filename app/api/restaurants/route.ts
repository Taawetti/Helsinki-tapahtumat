import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import type { Restaurant } from '@/lib/types'
import {
  MICHELIN_STARS,
  BIB_GOURMAND,
  GREEN_MICHELIN,
  RESTAURANT_OF_YEAR,
} from '@/lib/restaurant-awards'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────

interface OSMElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// ── Cuisine mapping ───────────────────────────────────────

// Maps lowercase OSM cuisine values to category IDs used by the UI filter
const OSM_TO_CATEGORY: Record<string, string> = {
  'nordic': 'nordisk', 'scandinavian': 'nordisk', 'finnish': 'nordisk',
  'new nordic': 'nordisk', 'modern european': 'nordisk',
  'japanese': 'japanese', 'sushi': 'japanese', 'ramen': 'japanese',
  'izakaya': 'japanese', 'tonkatsu': 'japanese', 'udon': 'japanese',
  'pizza': 'pizza',
  'italian': 'italian', 'pasta': 'italian', 'sicilian': 'italian',
  'burger': 'burger', 'american': 'burger', 'bbq': 'burger',
  'asian': 'asian', 'chinese': 'asian', 'thai': 'asian', 'vietnamese': 'asian',
  'korean': 'asian', 'taiwanese': 'asian', 'noodle': 'asian', 'pan asian': 'asian',
  'malaysian': 'asian', 'singaporean': 'asian', 'indonesian': 'asian', 'burmese': 'asian',
  'kebab': 'kebab', 'turkish': 'kebab', 'middle eastern': 'kebab',
  'arabic': 'kebab', 'persian': 'kebab', 'lebanese': 'kebab', 'shawarma': 'kebab',
  'indian': 'indian', 'bangladeshi': 'indian', 'nepali': 'indian', 'pakistani': 'indian',
  'sri lankan': 'indian',
  'mediterranean': 'mediterranean', 'greek': 'mediterranean', 'spanish': 'mediterranean',
  'portuguese': 'mediterranean', 'catalan': 'mediterranean', 'french': 'french',
  'vegetarian': 'veggie', 'vegan': 'veggie', 'plant based': 'veggie',
  'seafood': 'seafood', 'fish': 'seafood', 'fish and chips': 'seafood', 'sashimi': 'seafood',
  'coffee shop': 'cafe', 'cake': 'cafe', 'dessert': 'cafe',
  'ice cream': 'cafe', 'bakery': 'cafe', 'brunch': 'cafe',
  'steak': 'steak', 'steak house': 'steak', 'argentinian': 'steak', 'grill': 'steak',
  'mexican': 'mexican', 'tex mex': 'mexican', 'latin american': 'mexican',
}

function parseCuisines(raw: string): string[] {
  if (!raw) return []
  return raw.split(';').map(c => c.trim().replace(/_/g, ' ')).filter(Boolean)
}

function parseCuisineCategories(raw: string): string[] {
  if (!raw) return []
  const cats = new Set<string>()
  for (const c of raw.split(';')) {
    const key = c.trim().replace(/_/g, ' ').toLowerCase()
    const cat = OSM_TO_CATEGORY[key]
    if (cat) cats.add(cat)
  }
  return [...cats]
}

// Infer cuisine category from restaurant name when OSM has no cuisine tag.
// Ordered from most specific to least to avoid false positives.
function inferCuisineFromName(name: string): string[] {
  const n = name.toLowerCase()

  // Japanese
  if (/sushi|ramen|izakaya|yakitori|tempura|tonkatsu|bento|udon|soba|wasabi|gyoza|nigiri|sashimi|teppanyak|sukiyaki|matcha|gaijin|kabuki/.test(n)) return ['japanese']

  // Indian / Nepali / Pakistani / Sri Lankan
  if (/nepal|nepalilainen|nepalese|india(?!n lake)|intia|intialainen|pakistan|banglad|curry\b|tikka|masala|tandoori|biryani|bollywood|maharaja|himalaya|namaste|mantra\b|punjab|mughal|vindaloo|korma|samosa|dosa|naan\b|chapati|raita/.test(n)) return ['indian']

  // Thai / Southeast Asian
  if (/\bthai\b|thailand|thaimaalainen|pad.?thai|tom.?yum|som.?tam|\blaos\b|vietnamese|vietnam|pho\b|banh.?mi|bun.?bo|farang/.test(n)) return ['asian']

  // Chinese / Korean / other Asian
  if (/chinese|kiinalainen|china\b|dim.?sum|peking|beijing|sichuan|szechuan|cantonese|kung.?pao|mandarin|korea|korealainen|bibimbap|bulgogi|kimchi|seoul|golden.?dragon|jade.?garden|wonton|noodle.?house/.test(n)) return ['asian']

  // Pizza (before Italian to catch "pizza" in name)
  if (/\bpizza\b|pizzeria/.test(n)) return ['pizza']

  // Italian
  if (/\btrattoria\b|\bristorante\b|\bosteria\b|\bpasta\b|lasagn|italialainen|\bgelato\b|\bpesto\b|bruschetta|cannoli|tiramisu|prosciutto|antipasto/.test(n)) return ['italian']

  // Kebab / Turkish / Middle Eastern
  if (/kebab|döner|doner|shawarma|gyros|falafel|turkish|turkkilainen|istanbul|ankara|beirut|libanon|arabic|persia|hummus/.test(n)) return ['kebab']

  // Burger
  if (/burger|hamburgeri|hamburger/.test(n)) return ['burger']

  // Mexican
  if (/mexic|meksiko|\btaco\b|burrito|quesadilla|nacho|cantina|habanero|jalapeño/.test(n)) return ['mexican']

  // Mediterranean / Greek / Spanish
  if (/greek|kreikk|\bhellas\b|taverna|spain|espanja|tapas|paella|iberic|mediterran|välimeri|moussaka/.test(n)) return ['mediterranean']

  // French
  if (/\bbistro\b|brasserie|patisserie|pâtisserie|ranskalainen|\bboulangerie\b|crêperie/.test(n)) return ['french']

  // Seafood
  if (/\bfish\b|kalatalо|kalasto|seafood|lobster|hummer|oyster|shrimp|kalastajatorppa|fisker/.test(n)) return ['seafood']

  // Steak
  if (/steakhouse|steak.?house|pihviravintola/.test(n)) return ['steak']

  // Nordic / Finnish
  if (/nordic|pohjoismainen|skandinaavinen|suomalainen|husmanskost/.test(n)) return ['nordisk']

  // Veggie / Vegan
  if (/\bvegan\b|vegaani|kasvisravintola|vegetarian|plant.?based/.test(n)) return ['veggie']

  return []
}

// ── Price range helpers ───────────────────────────────────

function parsePriceRange(tags?: Record<string, string>): 1 | 2 | 3 | 4 | undefined {
  const raw = tags?.price_level ?? tags?.['check_in:price_range']
  if (raw) {
    const n = parseInt(raw)
    if (n >= 1 && n <= 4) return n as 1 | 2 | 3 | 4
  }
  // Infer from amenity type and cuisine
  const amenity = tags?.amenity
  const cuisine = (tags?.cuisine ?? '').toLowerCase()
  if (amenity === 'fast_food' || amenity === 'food_court') return 1
  if (cuisine.includes('kebab') || cuisine.includes('pizza')) return 1
  if (amenity === 'cafe') return 2
  return undefined
}

// ── Opening hours ─────────────────────────────────────────

function isOpenNow(hours: string): boolean | undefined {
  if (!hours) return undefined
  if (hours === '24/7') return true
  try {
    const now = new Date()
    const dayIdx = now.getDay() // 0=Sun, 1=Mon … 6=Sat
    const cur = now.getHours() * 60 + now.getMinutes()

    // Day abbreviation → day indices
    const D: Record<string, number[]> = {
      Mo: [1], Tu: [2], We: [3], Th: [4], Fr: [5], Sa: [6], Su: [0],
    }
    function expandRange(spec: string): number[] {
      if (D[spec]) return D[spec]
      const m = spec.match(/^([A-Z][a-z])-([A-Z][a-z])$/)
      if (m) {
        const keys = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
        const a = keys.indexOf(m[1]), b = keys.indexOf(m[2])
        if (a >= 0 && b >= 0) {
          const result: number[] = []
          for (let i = a; i <= b; i++) result.push(D[keys[i]][0])
          return result
        }
      }
      return []
    }

    for (const part of hours.split(';')) {
      const m = part.trim().match(/^([\w-]+(?:,[\w-]+)*)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/)
      if (!m) continue
      const daySpec = m[1], fromStr = m[2], toStr = m[3]
      const days = daySpec.split(',').flatMap(expandRange)
      if (!days.includes(dayIdx)) continue
      const [fh, fm] = fromStr.split(':').map(Number)
      const [th, tm] = toStr.split(':').map(Number)
      const from = fh * 60 + fm
      const to = th * 60 + tm
      if (cur >= from && cur <= (to < from ? to + 1440 : to)) return true
    }
    return false
  } catch {
    return undefined
  }
}

// ── Awards enrichment ─────────────────────────────────────

// Normalize for fuzzy matching: lowercase, strip punctuation, collapse spaces
function normName(n: string): string {
  return n.toLowerCase().replace(/[^a-zäöå0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Match OSM name against an award key using strict normalized equality.
// Substring matching ("bar palace".includes("palace")) causes false awards — don't use it.
function awardMatch(osmName: string, awardKey: string): boolean {
  return normName(osmName) === normName(awardKey)
}

function enrichWithAwards(name: string, result: Partial<Restaurant>): void {
  const starsKey = Object.keys(MICHELIN_STARS).find(k => awardMatch(name, k))
  const stars = starsKey ? MICHELIN_STARS[starsKey] : undefined
  if (stars) {
    result.michelinStars = stars
    result.priceRange = 4
    result.featured = true
    const awards = result.awards ?? []
    awards.push(`${stars === 1 ? '⭐' : stars === 2 ? '⭐⭐' : '⭐⭐⭐'} Michelin ${stars === 1 ? 'tähti' : 'tähteä'} 2025`)
    result.awards = awards
  }
  const bibKey = [...BIB_GOURMAND].find(k => awardMatch(name, k))
  if (bibKey) {
    result.bibGourmand = true
    result.featured = true
    const awards = result.awards ?? []
    awards.push('😊 Bib Gourmand 2025')
    result.awards = awards
  }
  const greenKey = [...GREEN_MICHELIN].find(k => awardMatch(name, k))
  if (greenKey) {
    result.greenMichelin = true
    const awards = result.awards ?? []
    awards.push('🌿 Michelin Green Star')
    result.awards = awards
  }
  for (const [year, winner] of Object.entries(RESTAURANT_OF_YEAR)) {
    if (awardMatch(name, winner)) {
      const awards = result.awards ?? []
      awards.push(`🏆 Vuoden ravintola ${year}`)
      result.awards = awards
      result.featured = true
    }
  }
}

// ── OpenStreetMap Overpass ────────────────────────────────
// Helsinki+Espoo+Vantaa bounding box (south,west,north,east)

const OSM_BBOX = '60.09,24.58,60.41,25.26'
const OSM_QUERY = `[out:json][timeout:30][bbox:${OSM_BBOX}];(node["amenity"~"^(restaurant|cafe|bar|pub|fast_food|food_court|biergarten)$"]["name"];way["amenity"~"^(restaurant|cafe|bar|pub|fast_food|food_court|biergarten)$"]["name"];);out center;`

const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const OSM_HEADERS = {
  'User-Agent': 'Helsinki-Tapahtumat/1.0 (https://github.com/Taawetti/Helsinki-tapahtumat)',
  'Accept': 'application/json',
}

function osmAmenityToType(amenity?: string): Restaurant['type'] {
  switch (amenity) {
    case 'cafe': return 'kahvila'
    case 'bar': case 'pub': case 'biergarten': return 'baari'
    case 'fast_food': case 'food_court': return 'pikaruoka'
    case 'restaurant': return 'ravintola'
    default: return 'muu'
  }
}

function osmAddress(tags?: Record<string, string>): string {
  if (!tags) return ''
  const street = tags['addr:street'] ?? ''
  const num = tags['addr:housenumber'] ?? ''
  return street ? `${street}${num ? ` ${num}` : ''}` : ''
}

async function _fetchOSM(): Promise<Restaurant[]> {
  const url = `?data=${encodeURIComponent(OSM_QUERY)}`

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror + url, {
        headers: OSM_HEADERS,
        signal: AbortSignal.timeout(35000),
      })
      if (!res.ok) continue

      const data: { elements: OSMElement[] } = await res.json()
      const results: Restaurant[] = []

      for (const el of data.elements ?? []) {
        const name = el.tags?.name || el.tags?.['name:fi'] || ''
        if (!name) continue
        const lat = el.type === 'node' ? el.lat : el.center?.lat
        const lon = el.type === 'node' ? el.lon : el.center?.lon
        if (!lat || !lon) continue

        const cuisineRaw = el.tags?.cuisine ?? ''
        const osmCats = parseCuisineCategories(cuisineRaw)
        const cuisineCategories = osmCats.length > 0 ? osmCats : inferCuisineFromName(name)
        const partial: Partial<Restaurant> = {
          id: `osm-${el.type[0]}${el.id}`,
          name,
          description: cuisineRaw.replace(/_/g, ' '),
          cuisines: parseCuisines(cuisineRaw),
          cuisineCategories,
          address: osmAddress(el.tags),
          city: el.tags?.['addr:city'] ?? '',
          lat,
          lon,
          image: null,
          www: el.tags?.website ?? el.tags?.url ?? el.tags?.['contact:website'] ?? null,
          phone: el.tags?.phone ?? el.tags?.['contact:phone'] ?? null,
          email: el.tags?.email ?? el.tags?.['contact:email'] ?? null,
          instagram: el.tags?.['contact:instagram'] ?? null,
          type: osmAmenityToType(el.tags?.amenity),
          priceRange: parsePriceRange(el.tags),
          openingHours: el.tags?.opening_hours ?? undefined,
          awards: [],
          outdoorSeating: el.tags?.outdoor_seating === 'yes' || undefined,
          takeaway: el.tags?.takeaway === 'yes' || el.tags?.takeaway === 'only' || undefined,
        }

        enrichWithAwards(name, partial)

        results.push(partial as Restaurant)
      }

      // Images are handled by Twemoji illustrations in the UI — no Wikipedia fetch needed here.

      console.log(`[restaurants] OSM: ${results.length} results from ${mirror}`)
      return results
    } catch (err) {
      console.warn(`[restaurants] OSM mirror ${mirror} failed:`, (err as Error).message)
    }
  }

  console.error('[restaurants] All OSM mirrors failed')
  return []
}

// ── Supplement restaurants (not in OSM as restaurant node) ───────────────

function applySupplements(results: Restaurant[]): Restaurant[] {
  // Palace exists in OSM only as a hotel (tourism=hotel), not as amenity=restaurant
  const haspalace = results.some(r => awardMatch(r.name, 'Palace'))
  if (!haspalace) {
    const p: Partial<Restaurant> = {
      id: 'supplement-palace',
      name: 'Palace',
      description: 'finedining',
      cuisines: ['finedining'],
      cuisineCategories: ['nordisk'],
      address: 'Eteläranta 10',
      city: 'Helsinki',
      lat: 60.16617,
      lon: 24.95266,
      image: null,
      www: 'https://palacerestaurant.fi',
      phone: '+358 9 1345 6780',
      email: null,
      instagram: null,
      type: 'ravintola',
      priceRange: 4,
      openingHours: undefined,
      awards: [],
      outdoorSeating: undefined,
      takeaway: undefined,
    }
    enrichWithAwards('Palace', p)
    results.push(p as Restaurant)
  }
  return results
}

// ── Cached wrapper ────────────────────────────────────────

export const fetchOSMCached = unstable_cache(
  async () => applySupplements(await _fetchOSM()),
  ['restaurants-osm-v9'],
  { revalidate: 86400, tags: ['restaurants'] }
)

export const fetchPKCached = async () => [] as Restaurant[]

// ── Supabase cuisine enrichment (1 h cache) ───────────────
// Fills in cuisine categories for restaurants OSM + name inference couldn't identify.

interface RestaurantEnrichment {
  cuisineCategories?: string[]
  googleRating?: number
  reviewCount?: number
}

async function _fetchRestaurantEnrichment(): Promise<Record<string, RestaurantEnrichment>> {
  if (!supabase) return {}
  const { data } = await supabase
    .from('venue_ratings')
    .select('venue_key, cuisine_categories, google_rating, review_count')
  const map: Record<string, RestaurantEnrichment> = {}
  for (const row of data ?? []) {
    const entry: RestaurantEnrichment = {}
    if (Array.isArray(row.cuisine_categories) && row.cuisine_categories.length > 0) {
      entry.cuisineCategories = row.cuisine_categories
    }
    if (row.google_rating) entry.googleRating = row.google_rating
    if (row.review_count) entry.reviewCount = row.review_count
    if (Object.keys(entry).length > 0) map[row.venue_key] = entry
  }
  return map
}

const fetchCuisineEnrichmentCached = unstable_cache(
  _fetchRestaurantEnrichment,
  ['restaurant-enrichment-v2'],
  { revalidate: 3600 }
)

// ── Route handler ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() ?? ''
  const category = req.nextUrl.searchParams.get('category') ?? ''
  const type = req.nextUrl.searchParams.get('type') ?? ''
  const priceMax = parseInt(req.nextUrl.searchParams.get('priceMax') ?? '0') || 0
  const featured = req.nextUrl.searchParams.get('featured') === '1'

  const [osmList, enrichmentMap] = await Promise.all([
    fetchOSMCached(),
    fetchCuisineEnrichmentCached(),
  ])

  // Apply Supabase enrichment: cuisine categories (for unidentified) + Google ratings (for all)
  const restaurants_enriched = osmList.map(r => {
    const enriched = enrichmentMap[r.name.toLowerCase().trim()]
    if (!enriched) return r
    const updates: Partial<typeof r> = {}
    if (r.cuisineCategories.length === 0 && enriched.cuisineCategories) {
      updates.cuisineCategories = enriched.cuisineCategories
    }
    if (enriched.googleRating) updates.googleRating = enriched.googleRating
    if (enriched.reviewCount) updates.reviewCount = enriched.reviewCount
    return Object.keys(updates).length > 0 ? { ...r, ...updates } : r
  })

  let restaurants = restaurants_enriched

  if (featured) {
    restaurants = restaurants.filter(r => r.featured)
  }
  if (category && category !== 'all') {
    if (category === 'awarded') {
      restaurants = restaurants.filter(r => r.featured)
    } else {
      restaurants = restaurants.filter(r => r.cuisineCategories.includes(category))
    }
  }
  if (type && type !== 'all') {
    restaurants = restaurants.filter(r => r.type === type)
  }
  if (priceMax > 0) {
    restaurants = restaurants.filter(r => !r.priceRange || r.priceRange <= priceMax)
  }
  if (q) {
    restaurants = restaurants.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    )
  }

  restaurants.sort((a, b) => {
    // Michelin first, then featured, then by data completeness
    const starsA = a.michelinStars ?? 0, starsB = b.michelinStars ?? 0
    if (starsA !== starsB) return starsB - starsA
    const featA = a.featured ? 1 : 0, featB = b.featured ? 1 : 0
    if (featA !== featB) return featB - featA
    const score = (r: Restaurant) =>
      (r.address ? 2 : 0) + (r.www ? 1 : 0) + (r.phone ? 1 : 0) + (r.description ? 1 : 0)
    return score(b) - score(a)
  })

  // Build cuisine category distribution for the frontend
  const categoryCount: Record<string, number> = {}
  for (const r of restaurants_enriched) {
    for (const cat of r.cuisineCategories) {
      categoryCount[cat] = (categoryCount[cat] ?? 0) + 1
    }
  }

  return NextResponse.json({
    restaurants,
    total: restaurants.length,
    categoryCount,
  })
}
