import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchOSMCached } from '@/app/api/restaurants/route'
import { googleTimetableToOsm } from '@/lib/google-hours'
import { googleCategoriesToCuisine } from '@/lib/cuisine'
import { fetchEnrichedKeys } from '@/lib/venue-enrichment'
import { requireAdmin } from '@/lib/admin-auth'
import { kotiutaKuva } from '@/lib/kuvavarasto'

export const maxDuration = 300

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
      description: string | null
      raw: Record<string, unknown> | null
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
        description?: string
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
    description: typeof item?.description === 'string' && item.description.trim() ? item.description.trim() : null,
    // Koko Google-profiili talteen (attribuutit, tähtijakauma, ruuhka-ajat,
    // varauslinkki ym.) — kuten aktiviteeteilla. Ei enää heitetä rikasta kerrosta.
    raw: (item as Record<string, unknown>) ?? null,
  }
}

/**
 * Comprehensive restaurant RE-enrichment: one my_business_info call per venue →
 * stores the FULL Google profile (google_raw: attributes, reservation link,
 * rating distribution, popular times, place_topics) plus refreshed rating,
 * reviews, cuisine, image and opening hours. Targets the curated keep-set only
 * — restaurants proven good (rating >4.0 & ≥50 reviews) whose rich layer wasn't
 * kept on the first pass.
 *
 * Money-safety (see the deep-audit notes in the PR):
 * - `google_raw` is the done-marker: written on EVERY looked-up keep-set venue
 *   (real profile when found, {} when Google had nothing), so no venue is ever
 *   looked up — or billed — twice. Candidate set = keep-set AND google_raw NULL.
 * - The candidate query is PAGINATED + .order('venue_key'), so it can't truncate
 *   at 1000 and re-charge everything past that (the old runaway bug).
 * - The rating floor scopes spend to exactly the keep-set (~1393 venues).
 * - If a whole batch's lookups all fail (bad token / outage), returns 502 so the
 *   caller stops immediately instead of looping.
 * - A write error (e.g. missing column) aborts with 500 before more spend.
 * - Chains are de-duped by name (they share one venue_ratings row).
 *
 * POST body: { limit?: number (default 12, max 12), dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) return authError
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
  // Math.max(1, …) estää negatiivisen limitin: pelkkä Math.min(-50,12)=-50 →
  // candidates.slice(0,-50) käsittelisi lähes KOKO keep-joukon yhdellä kutsulla
  // ohittaen 12-katon. Floor karsii desimaalit.
  const limit: number = Math.max(1, Math.min(Math.floor(body.limit ?? 12), 12))
  const dryRun: boolean = body.dryRun ?? false

  const osm = await fetchOSMCached()

  // ── Ehdokasjoukko (kuratoitu keep-joukko) — kootaan KAHDESTA signaalista:
  //  1) Arvosana: venue_ratings-rivit joilla google_rating >4.0 & ≥50 arvostelua
  //     (todistetusti hyvät) — haetaan sivutettuna alle.
  //  2) OSM-laatuleima: award (Michelin/Bib/suositeltu) TAI finedining. Nämä
  //     priimapaikat (esim. Savoy, Nokka, Nolla, Kuurna) ovat AWARD_SUPPLEMENTS-
  //     listalla eikä niillä ole vielä venue_ratings-riviä/arvosanaa lainkaan →
  //     pelkkä arvosanasuodatin missaisi ne. Signaali luetaan OSM-Restaurant-
  //     oliosta (michelinStars/bibGourmand/michelinRecommended/description).
  //
  // google_raw on done-merkki: doneKeys = rivit joilla google_raw jo on → niitä
  // ei haeta/veloiteta toiste. MOLEMMAT haut SIVUTETTU + .order('venue_key'):
  // ilman deterministististä järjestystä setti katkeaa 1000 rivin kohdalla ja jo
  // maksettu venue putoaa → karkaava DataForSEO-lasku (fetchEnrichedKeysin
  // estämä bugi). act:-rivit karsiutuvat luonnostaan OSM-leikkauksessa.
  const { keys: doneKeys, error: doneErr } = await fetchEnrichedKeys(supabaseAdmin, 'google_raw')
  if (doneErr) {
    return NextResponse.json({ error: `google_raw-skip-setin haku epäonnistui: ${doneErr}` }, { status: 500 })
  }
  const ratingTargetKeys = new Set<string>()
  {
    const PAGE = 1000
    for (let page = 0; ; page++) {
      const { data, error } = await supabaseAdmin
        .from('venue_ratings')
        .select('venue_key')
        .gt('google_rating', 4.0)
        .gte('review_count', 50)
        .is('google_raw', null)
        .order('venue_key')
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (error) {
        return NextResponse.json({ error: `Keep-joukon haku epäonnistui: ${error.message}` }, { status: 500 })
      }
      if (!data || data.length === 0) break
      for (const row of data as { venue_key: string }[]) ratingTargetKeys.add(row.venue_key)
      if (data.length < PAGE) break
    }
  }

  // De-dupe by venue_key (chains share one row); keep venues still MISSING
  // google_raw that are keep-worthy: proven rating OR award OR finedining.
  const seen = new Set<string>()
  const candidates = osm.filter((r) => {
    const k = r.name.toLowerCase().trim()
    if (!k || seen.has(k)) return false
    seen.add(k)
    if (doneKeys.has(k)) return false                                   // google_raw jo → valmis
    const award = !!(r.michelinStars || r.bibGourmand || r.michelinRecommended)
    const finedining = r.description === 'finedining'
    return ratingTargetKeys.has(k) || award || finedining
  })
  const toProcess = candidates.slice(0, limit)
  const remaining = candidates.length - toProcess.length

  // dryRun = ILMAINEN esikatselu: ei yhtään DataForSEO-hakua (ei kuluja).
  // Kertoo tasan montako keep-joukon ravintolaa nappi käsittelisi + arvion.
  if (dryRun) {
    const awardOrFine = candidates.filter(
      (r) => r.michelinStars || r.bibGourmand || r.michelinRecommended || r.description === 'finedining',
    )
    return NextResponse.json({
      dryRun: true,
      candidatesThisCall: toProcess.length,    // käsiteltäisiin tällä kutsulla (≤ limit)
      totalCandidates: candidates.length,      // koko ehdokasjoukko (ennen käsittelyä)
      remainingAfterThisCall: remaining,
      ratingKeepSet: ratingTargetKeys.size,    // arvosanaperusteinen osajoukko
      awardOrFinedining: awardOrFine.length,   // award/finedining-signaalilla mukaan (vaikka ei arvosanaa)
      awardOrFineSample: awardOrFine.slice(0, 12).map((r) => r.name),
      estimatedCostUsd: +(candidates.length * 0.0054).toFixed(2),
      sample: toProcess.slice(0, 8).map((r) => r.name),
    })
  }

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
          // OSM cuisine wins; else Google-derived; else [] (so the column is non-null)
          cuisine_categories: rest.cuisineCategories.length > 0 ? rest.cuisineCategories : f.cuisineCats,
        }
        // KRIITTINEN (re-rikastus): kirjoita arvosana/arvostelut/hinta/aukiolot/kuva/
        // kuvaus VAIN kun Google palautti arvon. Muuten ohimennyt query-miss
        // (found=false tai puuttuva kenttä) NOLLAISI priiman jo tallennetun datan
        // — esim. Savoy 4.8/500 → null/null — ja koska google_raw={} leimaa sen
        // valmiiksi, paikka putoaisi keep-joukosta pysyvästi köyhtyneenä.
        if (f.rating != null) row.google_rating = f.rating
        if (f.reviewCount != null) row.review_count = f.reviewCount
        if (f.priceLevel) row.price_level = f.priceLevel
        if (f.hoursOsm) { row.google_hours = f.hoursOsm; row.google_hours_updated = now }
        // Kuva kotiutetaan HETI omaan varastoon — Googlen osoite lahoaa
        // viikoissa (lib/kuvavarasto). Epäonnistuessa tuore lainalinkki varalle.
        if (f.mainImage) row.main_image = (await kotiutaKuva(row.venue_key as string, f.mainImage)) ?? f.mainImage
        if (f.description) row.description = f.description
        // google_raw on re-rikastuksen done-merkki → kirjoitetaan AINA: raaka
        // Google-profiili kun paikka löytyi, muuten {} ("tarkistettu, ei dataa")
        // jottei venue palaa ehdokasjoukkoon ja veloitu uudestaan. Uudelleen-
        // haku myöhemmin: UPDATE venue_ratings SET google_raw=NULL WHERE
        // google_raw = '{}'::jsonb (ja aja nappi uudestaan).
        row.google_raw = f.raw ?? {}
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
  // Mark them done (google_raw={} = "attempted, no data") so they're never
  // re-looked-up/re-billed and can't cluster at the front of the candidate set
  // and stall the whole run. To retry them later: UPDATE venue_ratings SET
  // google_raw=NULL WHERE google_raw = '{}'::jsonb (and re-run).
  if (!dryRun && errorKeys.length > 0) {
    const now = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('venue_ratings')
      .upsert(errorKeys.map((k) => ({ venue_key: k, enriched_at: now, last_updated: now, google_raw: {} })), { onConflict: 'venue_key' })
    if (error) {
      return NextResponse.json({ error: `Tallennus epäonnistui: ${error.message}`, withData, notInGoogle, errors }, { status: 500 })
    }
  }

  // Systeeminen nolladatan katkaisija: jos KOKO (täysi) erä onnistui teknisesti
  // mutta EI tuottanut yhtään dataa ja jokainen oli "ei Googlessa", kyse on
  // lähes varmasti systeemisestä estosta/konfiguraatiovirheestä (provider muutti
  // location_name/language-formaattia tai Google soft-blokkaa). Kuratoidun keep-
  // joukon (todistetusti hyvät + award/finedining) pitäisi lähes aina löytyä.
  // Merkitään varoitus → admin-loop pysähtyy ennen kuin koko joukko valuu tyhjänä.
  const systemicWarning =
    okTasks > 0 && withData === 0 && notInGoogle === toProcess.length && toProcess.length >= 8
      ? 'Erä ei tuottanut yhtään dataa (kaikki "ei Googlessa") — mahdollinen esto/konfiguraatiovirhe. Ajo pysäytetty.'
      : null

  return NextResponse.json({
    processed: toProcess.length,
    stored: withData,      // venues Google had data for
    notInGoogle,           // looked up, Google had no listing
    errors,                // per-venue failures (marked done to keep the run moving)
    remaining,
    keepSetPending: candidates.length,  // keep-worthy paikkoja ilman google_raw:ta (OSM-täsmääviä)
    systemicWarning,
    dryRun,
    results,
  })
}
