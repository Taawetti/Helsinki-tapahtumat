import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchOSMCached } from '@/app/api/restaurants/route'

export const maxDuration = 300

function checkAuth(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? Buffer.from(process.env.ADMIN_PASSWORD).toString('base64')
    : null
  return expected && session === expected
}

async function fetchGoogleImage(query: string): Promise<string | null> {
  const token = process.env.DATAFORSEO_TOKEN
  if (!token) return null

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
    return item?.main_image ?? null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const limit: number = Math.min(body.limit ?? 50, 100)

  // All OSM restaurants
  const osmRestaurants = await fetchOSMCached()

  // Supabase venue_keys that already have an image (real URL or '' = attempted)
  const { data: doneRows } = await supabaseAdmin
    .from('venue_ratings')
    .select('venue_key')
    .not('main_image', 'is', null)

  const doneKeys = new Set((doneRows ?? []).map((r: { venue_key: string }) => r.venue_key))

  // All OSM restaurants not yet attempted
  const toProcess = osmRestaurants
    .filter(r => !doneKeys.has(r.name.toLowerCase().trim()))
    .slice(0, limit)

  const remaining = osmRestaurants
    .filter(r => !doneKeys.has(r.name.toLowerCase().trim()))
    .length - toProcess.length

  let updated = 0
  let notFound = 0
  const samples: { name: string; image: string }[] = []

  for (const rest of toProcess) {
    const venueKey = rest.name.toLowerCase().trim()
    const query = rest.address
      ? `${rest.name} ${rest.address} Helsinki`
      : `${rest.name} Helsinki`
    const image = await fetchGoogleImage(query)
    const now = new Date().toISOString()

    // Check if the row already exists in venue_ratings.
    // If it does: UPDATE only main_image + last_updated (don't overwrite cuisine/ratings).
    // If it doesn't: INSERT with all columns so NOT NULL constraints are satisfied.
    const { data: existing } = await supabaseAdmin
      .from('venue_ratings')
      .select('venue_key')
      .eq('venue_key', venueKey)
      .maybeSingle()

    if (existing) {
      await supabaseAdmin
        .from('venue_ratings')
        .update({ main_image: image ?? '', last_updated: now })
        .eq('venue_key', venueKey)
    } else {
      await supabaseAdmin
        .from('venue_ratings')
        .insert({
          venue_key: venueKey,
          main_image: image ?? '',
          last_updated: now,
          google_rating: null,
          review_count: null,
          cuisine_categories: rest.cuisineCategories ?? [],
        })
    }

    if (image) {
      updated++
      if (samples.length < 5) samples.push({ name: rest.name, image })
    } else {
      notFound++
    }

    await new Promise(r => setTimeout(r, 1100))
  }

  return NextResponse.json({
    processed: toProcess.length,
    updated,
    notFound,
    remaining,
    samples,
  })
}
