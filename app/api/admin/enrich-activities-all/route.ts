import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchActivitiesCached } from '@/app/api/activities/route'
import { googleTimetableToOsm } from '@/lib/google-hours'
import { fetchEnrichedKeys } from '@/lib/venue-enrichment'
import { requireAdmin } from '@/lib/admin-auth'

export const maxDuration = 300

// Only the "interesting" categories worth a Google lookup (the 509 the
// "Helsinkiläisten suosikit" grid + category tabs actually show). Parks/sports
// fields/misc have no useful Google business profile, so we don't pay for them.
const CURATED = new Set(['sauna', 'nakopaikka', 'uimaranta', 'galleria', 'museo', 'markkina', 'nahtavyys'])

// One my_business_info lookup returns the WHOLE Google profile. We keep the raw
// item (google_raw) so nothing is ever lost, and pull the fields the UI uses
// today into their own columns. Hours go through googleTimetableToOsm so they
// stay in the OSM format isOpenNow expects (same contract as restaurants).
type Fetched =
  | {
      status: 'ok'
      found: boolean
      rating: number | null
      reviewCount: number | null
      priceLevel: string | null
      mainImage: string | null
      hoursOsm: string | null
      description: string | null
      raw: Record<string, unknown> | null
    }
  | { status: 'error' }

async function fetchBusiness(query: string): Promise<Fetched> {
  const token = process.env.DATAFORSEO_TOKEN
  if (!token) return { status: 'error' }

  let data: { tasks?: { status_code?: number; result?: { items?: Record<string, unknown>[] }[] }[] }
  try {
    const res = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/live', {
      method: 'POST',
      headers: { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: query,
        location_name: 'Helsinki,Helsinki,Uusimaa,Finland',
        language_name: 'Finnish',
      }]),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) return { status: 'error' }
    data = await res.json()
  } catch {
    return { status: 'error' }
  }

  // 20000 = Ok; 40102 = "No Search Results" — a normal not-in-Google outcome,
  // NOT an error. Anything else (auth/rate-limit/malformed) → error → retryable.
  const task = data?.tasks?.[0]
  if (!task || (task.status_code !== 20000 && task.status_code !== 40102)) return { status: 'error' }

  const item = task.result?.[0]?.items?.[0] as
    | {
        rating?: { value?: number; votes_count?: number }
        price_level?: string
        main_image?: string
        work_time?: unknown
        description?: string
      }
    | undefined

  return {
    status: 'ok',
    found: !!item,
    rating: item?.rating?.value ?? null,
    reviewCount: item?.rating?.votes_count ?? null,
    priceLevel: item?.price_level ?? null,
    mainImage: item?.main_image ?? null,
    hoursOsm: item?.work_time ? googleTimetableToOsm(item.work_time) : null,
    description: typeof item?.description === 'string' && item.description.trim() ? item.description.trim() : null,
    raw: (item as Record<string, unknown>) ?? null,
  }
}

/**
 * Activity enrichment — one my_business_info call per venue → stores rating,
 * reviews, price, image, Google opening hours, description AND the raw Google
 * profile (google_raw), under an `act:<name>` key, marked by `enriched_at`.
 *
 * Money-safety (mirrors the audited restaurant enrichment):
 * - `enriched_at` is stamped on EVERY looked-up venue (found or not / error),
 *   so no venue is ever looked up — or billed — twice.
 * - The skip-set is PAGINATED (fetchEnrichedKeys), so it can't truncate at 1000
 *   and re-charge everything past that (the old runaway bug).
 * - A whole batch of failed lookups → 502 so the caller stops instead of looping.
 * - A write error aborts with 500 before more spend.
 * - Scoped to CURATED categories only.
 *
 * POST body: { limit?: number (default 12, max 12), dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) return authError
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })
  if (!process.env.DATAFORSEO_TOKEN) {
    return NextResponse.json({ error: 'DATAFORSEO_TOKEN puuttuu tältä ympäristöltä' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const limit: number = Math.max(1, Math.min(body.limit ?? 12, 12))
  const dryRun: boolean = body.dryRun ?? false

  const activities = await fetchActivitiesCached()

  // Paginated skip-set on enriched_at (shared with restaurants; act: rows are
  // matched by their prefixed key). Error → migration not run.
  const { keys: doneKeys, error: skipErr } = await fetchEnrichedKeys(supabaseAdmin, 'enriched_at')
  if (skipErr) {
    return NextResponse.json(
      { error: 'venue_ratings.enriched_at puuttuu — aja sql/add-venue-enrichment-columns.sql ensin' },
      { status: 500 },
    )
  }

  // Varmista google_raw-sarake ENNEN maksullisia kutsuja — muuten ensimmäinen
  // aalto (jopa 4 hakua) maksettaisiin ennen kuin upsert kaatuu puuttuvaan
  // sarakkeeseen. Tämä on ilmainen DB-luku, ei DataForSEO-kutsu.
  const { error: rawErr } = await supabaseAdmin.from('venue_ratings').select('google_raw').limit(1)
  if (rawErr) {
    return NextResponse.json(
      { error: 'venue_ratings.google_raw puuttuu — aja sql/add-venue-google-raw.sql ensin' },
      { status: 500 },
    )
  }

  // Candidates: curated categories, de-duped by act: key, not already done.
  const seen = new Set<string>()
  const candidates = activities.filter((a) => {
    if (!CURATED.has(a.category)) return false
    const k = `act:${a.name.toLowerCase().trim()}`
    if (!a.name.trim() || doneKeys.has(k) || seen.has(k)) return false
    seen.add(k)
    return true
  })
  const toProcess = candidates.slice(0, limit)
  const remaining = candidates.length - toProcess.length

  let okTasks = 0
  let withData = 0
  let notInGoogle = 0
  let errors = 0
  const errorKeys: string[] = []
  const samples: { name: string; status: string }[] = []

  const CONCURRENCY = 4
  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const wave = toProcess.slice(i, i + CONCURRENCY)
    const fetched = await Promise.all(wave.map(async (act) => {
      const query = act.address ? `${act.name} ${act.address} Helsinki` : `${act.name} Helsinki`
      return { act, f: await fetchBusiness(query) }
    }))

    for (const { act, f } of fetched) {
      if (f.status === 'error') {
        errors++
        errorKeys.push(`act:${act.name.toLowerCase().trim()}`)
        continue
      }

      okTasks++
      if (!dryRun) {
        const now = new Date().toISOString()
        const row: Record<string, unknown> = {
          venue_key: `act:${act.name.toLowerCase().trim()}`,
          enriched_at: now,
          last_updated: now,
          google_rating: f.rating,
          review_count: f.reviewCount,
          price_level: f.priceLevel,
          google_hours: f.hoursOsm,
          google_hours_updated: now,
          google_raw: f.raw,
        }
        // Only write these when present, so a null can't wipe a prior value.
        if (f.mainImage) row.main_image = f.mainImage
        if (f.description) row.description = f.description
        const { error } = await supabaseAdmin.from('venue_ratings').upsert(row, { onConflict: 'venue_key' })
        if (error) {
          return NextResponse.json(
            { error: `Tallennus epäonnistui: ${error.message} (ajoitko sql/add-venue-google-raw.sql?)`, withData, notInGoogle, errors },
            { status: 500 },
          )
        }
      }

      if (f.found) {
        withData++
        if (samples.length < 8) {
          samples.push({ name: act.name, status: `⭐${f.rating ?? '–'}${f.mainImage ? ' 📸' : ''}${f.hoursOsm ? ' 🕐' : ''}` })
        }
      } else {
        notInGoogle++
      }
    }
  }

  // Whole batch failed → systemic (bad token / outage). Stamp nothing and halt.
  if (toProcess.length > 0 && okTasks === 0) {
    return NextResponse.json(
      { error: 'Kaikki Google-haut epäonnistuivat — tarkista DATAFORSEO_TOKEN / verkko', errors },
      { status: 502 },
    )
  }

  // Batch had successes → per-venue failures are quirks; mark them done so they
  // aren't re-billed and can't stall the queue at the front.
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
    stored: withData,
    notInGoogle,
    errors,
    remaining,
    alreadyDone: doneKeys.size,
    dryRun,
    samples,
  })
}
