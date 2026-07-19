import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchOSMCached } from '@/app/api/restaurants/route'
import { googleTimetableToOsm } from '@/lib/google-hours'

export const maxDuration = 300

function checkAuth(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? Buffer.from(process.env.ADMIN_PASSWORD).toString('base64')
    : null
  return expected && session === expected
}

// Fetch Google opening hours for one venue and convert to an OSM string.
// Returns null when Google has no usable timetable (caller keeps OSM).
async function fetchGoogleHours(query: string): Promise<string | null> {
  const token = process.env.DATAFORSEO_TOKEN
  if (!token) return null
  try {
    const res = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/live', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: query,
        location_name: 'Helsinki,Helsinki,Uusimaa,Finland',
        language_name: 'Finnish',
      }]),
    })
    const data = await res.json()
    const item = data?.tasks?.[0]?.result?.[0]?.items?.[0]
    if (!item) return null
    return googleTimetableToOsm(item.work_time)
  } catch {
    return null
  }
}

/**
 * Backfills venue_ratings.google_hours from Google (DataForSEO) for restaurants
 * that don't have it yet. Resumable (skips rows where google_hours is already
 * set), batched via `limit`, dry-runnable. Costs ~$0.006 per NEW venue.
 *
 * POST body: { limit?: number (default 50, max 200), dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const limit: number = Math.min(body.limit ?? 50, 200)
  const dryRun: boolean = body.dryRun ?? false

  const osmRestaurants = await fetchOSMCached()

  // Skip venues already PROCESSED — keyed on google_hours_updated (set on every
  // processed venue, hours or not) so no-hours venues aren't re-fetched (and
  // re-charged) forever. If this query errors, the migration hasn't run yet.
  const { data: existingRows, error: skipErr } = await supabaseAdmin
    .from('venue_ratings')
    .select('venue_key')
    .not('google_hours_updated', 'is', null)
  if (skipErr) {
    return NextResponse.json(
      { error: 'venue_ratings.google_hours_updated puuttuu — aja sql/add-venue-google-hours.sql ensin' },
      { status: 500 },
    )
  }
  const doneKeys = new Set((existingRows ?? []).map((r: { venue_key: string }) => r.venue_key))

  // De-dupe by venue_key up front: chains share one row (venue_key = name), so
  // processing every outlet would re-charge for the same key and let one
  // outlet's hours overwrite the others'. One representative per name.
  const seenKeys = new Set<string>()
  const candidates = osmRestaurants.filter((r) => {
    const k = r.name.toLowerCase().trim()
    if (doneKeys.has(k) || seenKeys.has(k)) return false
    seenKeys.add(k)
    return true
  })
  const toProcess = candidates.slice(0, limit)
  const remaining = candidates.length - toProcess.length

  const results: { name: string; status: string }[] = []
  let stored = 0
  let noHours = 0

  for (const rest of toProcess) {
    const query = rest.address ? `${rest.name} ${rest.address} Helsinki` : `${rest.name} Helsinki`
    const osm = await fetchGoogleHours(query)
    const venueKey = rest.name.toLowerCase().trim()

    if (!dryRun) {
      // Always stamp google_hours_updated so the venue is skipped next run,
      // whether or not Google had hours. Abort loudly on a write error (e.g.
      // missing column) instead of silently reporting fake progress.
      const { error: upsertErr } = await supabaseAdmin.from('venue_ratings').upsert({
        venue_key: venueKey,
        ...(osm ? { google_hours: osm } : {}),
        google_hours_updated: new Date().toISOString(),
      }, { onConflict: 'venue_key' })
      if (upsertErr) {
        return NextResponse.json({ error: `Tallennus epäonnistui: ${upsertErr.message}`, stored, noHours }, { status: 500 })
      }
    }

    if (osm) { stored++; results.push({ name: rest.name, status: osm }) }
    else { noHours++; results.push({ name: rest.name, status: '—' }) }

    // DataForSEO basic plan ≈ 1 req/s
    await new Promise((r) => setTimeout(r, 1100))
  }

  return NextResponse.json({
    processed: toProcess.length,
    stored,
    noHours,
    alreadyDone: doneKeys.size,
    remaining,
    dryRun,
    results,
  })
}
