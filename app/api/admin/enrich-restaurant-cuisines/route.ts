import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchOSMCached } from '@/app/api/restaurants/route'
import { createHmac } from 'crypto'

// ── Auth ─────────────────────────────────────────────────────

function checkAuth(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? createHmac('sha256', process.env.ADMIN_PASSWORD).update('admin-session').digest('hex')
    : null
  return expected && session === expected
}

// ── Google category → our cuisine category ───────────────────

const GOOGLE_TO_CUISINE: [RegExp, string][] = [
  [/japanese|sushi|ramen|izakaya|yakitori|tempura|tonkatsu|udon|soba|teppanyaki/i,  'japanese'],
  [/indian|curry|tandoori|biryani|nepalese|nepali|pakistani|bangladeshi|sri.?lankan|himalayan/i, 'indian'],
  [/thai|vietnamese|korean|chinese|asian|wok|pan.?asian|dim.?sum|malaysian|indonesian|cantonese|szechuan|burmese/i, 'asian'],
  [/pizza|pizzeria/i,                                                                 'pizza'],
  [/italian|pasta|trattoria|ristorante|osteria/i,                                     'italian'],
  [/kebab|turkish|middle.?eastern|arabic|shawarma|falafel|lebanese|persian|halal/i,   'kebab'],
  [/burger|hamburger|american/i,                                                       'burger'],
  [/mexican|tex.?mex|latin.?american|taco/i,                                           'mexican'],
  [/mediterranean|greek|spanish|tapas|portuguese/i,                                    'mediterranean'],
  [/french|bistro|brasserie/i,                                                          'french'],
  [/seafood|fish.?restaurant|lobster/i,                                                 'seafood'],
  [/steak|steakhouse|grill/i,                                                           'steak'],
  [/nordic|scandinavian|finnish/i,                                                      'nordisk'],
  [/vegetarian|vegan/i,                                                                 'veggie'],
]

function googleCategoriesToCuisine(cats: string[]): string[] {
  const result = new Set<string>()
  for (const cat of cats) {
    for (const [regex, cuisine] of GOOGLE_TO_CUISINE) {
      if (regex.test(cat)) {
        result.add(cuisine)
        break
      }
    }
  }
  return [...result]
}

// ── DataForSEO lookup ────────────────────────────────────────

interface GoogleData {
  categories: string[]
  rating: number | null
  reviewCount: number | null
}

async function fetchGoogleData(query: string): Promise<GoogleData> {
  const token = process.env.DATAFORSEO_TOKEN
  if (!token) return { categories: [], rating: null, reviewCount: null }

  try {
    const res = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/live', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        keyword: query,
        location_name: 'Helsinki,Helsinki,Uusimaa,Finland',
        language_name: 'Finnish',
      }]),
    })

    const data = await res.json()
    const item = data?.tasks?.[0]?.result?.[0]?.items?.[0]
    if (!item) return { categories: [], rating: null, reviewCount: null }

    const cats: string[] = []
    if (item.category) cats.push(item.category)
    if (Array.isArray(item.additional_categories)) cats.push(...item.additional_categories)

    return {
      categories: cats,
      rating: item.rating?.value ?? null,
      reviewCount: item.rating?.votes_count ?? null,
    }
  } catch {
    return { categories: [], rating: null, reviewCount: null }
  }
}

// ── Route handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const limit: number = Math.min(body.limit ?? 50, 200)
  const dryRun: boolean = body.dryRun ?? false

  // Load all OSM restaurants
  const osmRestaurants = await fetchOSMCached()

  // Load already-processed venue keys from Supabase (cuisine_categories IS NOT NULL)
  const { data: existingRows } = await supabaseAdmin
    .from('venue_ratings')
    .select('venue_key, cuisine_categories')
    .not('cuisine_categories', 'is', null)

  const alreadyDoneKeys = new Set((existingRows ?? []).map((r: { venue_key: string }) => r.venue_key))

  // Process all restaurants not yet in Supabase — get ratings for everyone,
  // cuisine categories only for those OSM + name inference couldn't identify.
  const toProcess = osmRestaurants
    .filter(r => !alreadyDoneKeys.has(r.name.toLowerCase().trim()))
    .slice(0, limit)

  const remaining = osmRestaurants
    .filter(r => !alreadyDoneKeys.has(r.name.toLowerCase().trim()))
    .length - toProcess.length

  const results: { name: string; found: string[]; status: string }[] = []
  let enriched = 0
  let notFound = 0

  for (const rest of toProcess) {
    const query = `${rest.name} Helsinki`
    const { categories: googleCats, rating, reviewCount } = await fetchGoogleData(query)
    const cuisineCats = googleCategoriesToCuisine(googleCats)

    const venueKey = rest.name.toLowerCase().trim()

    if (!dryRun) {
      // Only overwrite cuisine_categories if OSM + name inference had nothing
      const upsertData: Record<string, unknown> = {
        venue_key: venueKey,
        google_rating: rating,
        review_count: reviewCount,
        last_updated: new Date().toISOString(),
      }
      upsertData.cuisine_categories = rest.cuisineCategories.length > 0
        ? rest.cuisineCategories
        : cuisineCats.length > 0 ? cuisineCats : []
      await supabaseAdmin.from('venue_ratings').upsert(upsertData, { onConflict: 'venue_key' })
    }

    if (cuisineCats.length > 0) enriched++
    else notFound++

    results.push({
      name: rest.name,
      found: googleCats,
      status: cuisineCats.length > 0 ? `${cuisineCats.join(', ')}${rating ? ` ⭐${rating}` : ''}` : rating ? `⭐${rating}` : '—',
    })

    // Rate limit — DataForSEO allows ~1 req/s on basic plan
    await new Promise(r => setTimeout(r, 1100))
  }

  return NextResponse.json({
    processed: toProcess.length,
    enriched,
    notFound,
    alreadyDone: alreadyDoneKeys.size,
    remaining,
    dryRun,
    results,
  })
}
