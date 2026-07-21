import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchOSMCached } from '@/app/api/restaurants/route'
import { googleTimetableToOsm } from '@/lib/google-hours'
import { googleCategoriesToCuisine } from '@/app/api/admin/enrich-restaurant-cuisines/route'
import { fetchEnrichedKeys } from '@/lib/venue-enrichment'

export const maxDuration = 300

function checkAuth(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? Buffer.from(process.env.ADMIN_PASSWORD).toString('base64')
    : null
  return expected && session === expected
}

// One DataForSEO my_business_info lookup returns rating, reviews, categories,
// image AND opening hours together — so ONE call enriches everything. Running
// separate passes paid 2-3× for the same lookup and let them poison each
// other's skip markers (image pass wrote google_rating:null → ratings pass
// skipped those → 92% of restaurants had no rating). This unifies them.
type Fetched =
  | {
      status: 'ok'
      found: boolean
      rating: number | null
      reviewCount: number | null
      priceLevel: string | null
      cuisineCats: string[]
      mainImage: string | null
      hoursOsm: string | null
    }
  | { status: 'error' }

async function fetchBusiness(query: string): Promise<Fetched> {
  const token = process.env.DATAFORSEO_TOKEN
  if (!token) return { status: 'error' }

  let data: {
    tasks?: { status_code?: number; result?: { items?: Record<string, unknown>[] }[] }[]
  }
  try {
    const res = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/live', {
      method: 'POST',
      headers: { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: query,
        location_name: 'Helsinki,Helsinki,Uusimaa,Finland',
        language_name: 'Finnish',
      }]),
      // Live lookups are slow scrapes — measured ~25-26 s even on success,
      // and under concurrency the provider queues requests so the tail runs
      // longer. (A 10 s timeout aborted EVERY call; 40 s still lost ~30%.)
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) return { status: 'error' }
    data = await res.json()
  } catch {
    return { status: 'error' }
  }

  // 20000 = Ok; 40102 = "No Search Results" — a normal not-in-Google outcome
  // (measured live), NOT an error. Anything else (auth, rate limit, malformed)
  // is an error → NOT marked done → retryable.
  const task = data?.tasks?.[0]
  if (!task || (task.status_code !== 20000 && task.status_code !== 40102)) return { status: 'error' }

  const item = task.result?.[0]?.items?.[0] as
    | {
        rating?: { value?: number; votes_count?: number }
        price_level?: string
        category?: string
        additional_categories?: string[]
        main_image?: string
        work_time?: unknown
      }
    | undefined

  const cats: string[] = []
  if (item?.category) cats.push(item.category)
  if (Array.isArray(item?.additional_categories)) cats.push(...item.additional_categories)

  return {
    status: 'ok',
    found: !!item,
    rating: item?.rating?.value ?? null,
    reviewCount: item?.rating?.votes_count ?? null,
    priceLevel: item?.price_level ?? null,
    cuisineCats: googleCategoriesToCuisine(cats),
    mainImage: item?.main_image ?? null,
    hoursOsm: item?.work_time ? googleTimetableToOsm(item.work_time) : null,
  }
}

/**
 * Unified restaurant enrichment: one my_business_info call per venue → stores
 * rating, reviews, cuisine, image and Google opening hours together, marked by
 * a single `enriched_at` stamp.
 *
 * Money-safety (see the deep-audit notes in the PR):
 * - `enriched_at` is stamped on EVERY successfully-looked-up venue (data found
 *   or not), so no venue is ever looked up — or billed — twice.
 * - The skip-set is PAGINATED (fetchEnrichedKeys), so it can't truncate at 1000
 *   and re-charge everything past that (the old runaway bug).
 * - If a whole batch's lookups all fail (bad token / outage), returns 502 so the
 *   caller stops immediately instead of looping.
 * - A write error (e.g. missing column) aborts with 500 before more spend.
 * - Chains are de-duped by name (they share one venue_ratings row).
 *
 * POST body: { limit?: number (default 25, max 50), dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  // Fail fast & loud on a missing token — otherwise every venue would just
  // read "virhe" with no hint that the env var isn't set on this deployment.
  if (!process.env.DATAFORSEO_TOKEN) {
    return NextResponse.json({ error: 'DATAFORSEO_TOKEN puuttuu tältä ympäristöltä (Vercel → Settings → Environment Variables)' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  // Lookups take ~26-40 s each under load; waves of 4 concurrent.
  // 12/batch = 3 waves ≈ 90-120 s typical, worst (all hit the 60 s timeout)
  // 3×60 = 180 s — safely under maxDuration 300. Cap at 12 so an already-open
  // admin tab still sending limit:18 stays within budget too.
  const limit: number = Math.min(body.limit ?? 12, 12)
  const dryRun: boolean = body.dryRun ?? false

  const osm = await fetchOSMCached()

  // Paginated skip-set on the single unified marker. Errors → migration not run.
  const { keys: doneKeys, error: skipErr } = await fetchEnrichedKeys(supabaseAdmin, 'enriched_at')
  if (skipErr) {
    return NextResponse.json(
      { error: 'venue_ratings.enriched_at puuttuu — aja sql/add-venue-enrichment-columns.sql ensin' },
      { status: 500 },
    )
  }

  // De-dupe by venue_key (chains share one row) and drop already-done venues.
  const seen = new Set<string>()
  const candidates = osm.filter((r) => {
    const k = r.name.toLowerCase().trim()
    if (!k || doneKeys.has(k) || seen.has(k)) return false
    seen.add(k)
    return true
  })
  const toProcess = candidates.slice(0, limit)
  const remaining = candidates.length - toProcess.length

  let okTasks = 0
  let withData = 0
  let notInGoogle = 0
  let errors = 0
  const errorKeys: string[] = [] // looked-up-but-failed → stamped done if the batch wasn't a total wipeout
  const results: { name: string; status: string }[] = []

  // Waves of 4 concurrent lookups: each takes ~26-40 s, so sequential
  // processing would spend ~22 h on the full backfill. Six in flight queued
  // at the provider and ~30% timed out; four keeps the tail under the 60 s
  // budget. DB writes happen after each wave, sequentially.
  const CONCURRENCY = 4
  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const wave = toProcess.slice(i, i + CONCURRENCY)
    const fetched = await Promise.all(wave.map(async (rest) => {
      const query = rest.address ? `${rest.name} ${rest.address} Helsinki` : `${rest.name} Helsinki`
      return { rest, f: await fetchBusiness(query) }
    }))

    for (const { rest, f } of fetched) {
      if (f.status === 'error') {
        errors++
        errorKeys.push(rest.name.toLowerCase().trim())
        results.push({ name: rest.name, status: 'virhe' })
        continue
      }

      okTasks++
      if (!dryRun) {
        const now = new Date().toISOString()
        const row: Record<string, unknown> = {
          venue_key: rest.name.toLowerCase().trim(),
          enriched_at: now,
          last_updated: now,
          google_rating: f.rating,
          review_count: f.reviewCount,
          price_level: f.priceLevel,
          // OSM cuisine wins; else Google-derived; else [] (so the column is non-null)
          cuisine_categories: rest.cuisineCategories.length > 0 ? rest.cuisineCategories : f.cuisineCats,
          google_hours: f.hoursOsm,
          google_hours_updated: now,
        }
        // Only write main_image when Google actually returned one — otherwise
        // omit it so onConflict-update PRESERVES an image a previous pass stored
        // (writing '' here would wipe ~900 existing restaurant images).
        if (f.mainImage) row.main_image = f.mainImage
        const { error } = await supabaseAdmin.from('venue_ratings').upsert(row, { onConflict: 'venue_key' })
        if (error) {
          return NextResponse.json(
            { error: `Tallennus epäonnistui: ${error.message}`, withData, notInGoogle, errors },
            { status: 500 },
          )
        }
      }

      if (f.found) { withData++; results.push({ name: rest.name, status: `⭐${f.rating ?? '–'}${f.mainImage ? ' 📸' : ''}${f.hoursOsm ? ' 🕐' : ''}` }) }
      else { notInGoogle++; results.push({ name: rest.name, status: 'ei Googlessa' }) }
    }
  }

  // Whole batch failed → systemic (bad token / outage). Stamp NOTHING and halt,
  // so a broken token can't silently mark everything done with no data.
  if (toProcess.length > 0 && okTasks === 0) {
    return NextResponse.json(
      { error: 'Kaikki Google-haut epäonnistuivat — tarkista DATAFORSEO_TOKEN / verkko', errors },
      { status: 502 },
    )
  }

  // Batch had successes → the failures are per-venue quirks, not systemic.
  // Mark them done (no data) so they're never re-looked-up/re-billed and can't
  // cluster at the front of the queue and stall the whole run. To retry them
  // later: UPDATE venue_ratings SET enriched_at=NULL WHERE google_hours IS NULL
  //         AND google_rating IS NULL (and re-run).
  if (!dryRun && errorKeys.length > 0) {
    const now = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('venue_ratings')
      .upsert(errorKeys.map((k) => ({ venue_key: k, enriched_at: now, last_updated: now })), { onConflict: 'venue_key' })
    if (error) {
      return NextResponse.json({ error: `Tallennus epäonnistui: ${error.message}`, withData, notInGoogle, errors }, { status: 500 })
    }
  }

  return NextResponse.json({
    processed: toProcess.length,
    stored: withData,      // venues Google had data for
    notInGoogle,           // looked up, Google had no listing
    errors,                // per-venue failures (marked done to keep the run moving)
    remaining,
    alreadyDone: doneKeys.size,
    dryRun,
    results,
  })
}
