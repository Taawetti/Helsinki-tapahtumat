import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchOSMCached } from '@/app/api/restaurants/route'
import { fetchEnrichedKeys } from '@/lib/venue-enrichment'


export const maxDuration = 300

function checkAuth(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? Buffer.from(process.env.ADMIN_PASSWORD).toString('base64')
    : null
  return expected && session === expected
}

// Sub-categories per OSM type — must match matchesSubCat in RestaurantsView
const VALID_SUBS: Record<string, string[]> = {
  baari:   ['cocktail', 'craft_beer', 'wine', 'sports', 'karaoke'],
  yokerho: ['klubi', 'karaoke', 'tekno', 'katto'],
  kahvila: ['brunssi', 'paahtimo', 'erikois', 'ranskalaiset', 'klassikot', 'boheemit'],
}

const BATCH = 30

interface ClassifyResult {
  venue_key: string
  sub_categories: string[]
}

async function classifyBatch(
  venues: { name: string; type: string }[]
): Promise<ClassifyResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []

  const prompt = `Classify Helsinki bars, nightclubs and cafes into sub-categories based on name.
Return ONLY a JSON array, no explanation.

Sub-categories by venue type:
- baari: cocktail, craft_beer, wine, sports, karaoke
- yokerho: klubi, karaoke, tekno, katto (rooftop/outdoor)
- kahvila: brunssi, paahtimo (roastery), erikois (specialty coffee), ranskalaiset (French patisserie), klassikot (historic/classic), boheemit (bohemian/indie)

Venues:
${venues.map((v, i) => `${i + 1}. "${v.name}" (${v.type})`).join('\n')}

Return: [{"venue_key":"name_lowercased_trimmed","sub_categories":["cat1"]}]
Rules:
- venue_key = venue name lowercased and trimmed exactly
- Only assign categories that clearly fit — if unsure, use []
- Only assign sub-categories valid for that venue type
- Multiple sub-categories allowed when clearly applicable`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    const raw = (data.content?.[0]?.text ?? '').trim()
      .replace(/^```json\n?/, '').replace(/\n?```$/, '')
    const parsed: ClassifyResult[] = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // Validate sub-categories against allowed list
    return parsed.map(r => ({
      venue_key: r.venue_key,
      sub_categories: (r.sub_categories ?? []).filter((s: string) => {
        const type = venues.find(v => v.name.toLowerCase().trim() === r.venue_key)?.type ?? ''
        return (VALID_SUBS[type] ?? []).includes(s)
      }),
    }))
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const limit: number = Math.min(body.limit ?? 150, 500)
  const dryRun: boolean = body.dryRun ?? false

  const allRestaurants = await fetchOSMCached()
  const venues = allRestaurants.filter(r =>
    r.type === 'baari' || r.type === 'yokerho' || r.type === 'kahvila'
  )

  // Skip venues already enriched with sub_categories.
  // PAGINATED: a single select caps at 1000 rows — once venue_ratings passed
  // 1000 the truncated skip set re-processed & re-charged thousands of venues
  // every batch, and the loop never finished. This fetches every done key.
  const { keys: alreadyDoneKeys } = await fetchEnrichedKeys(supabaseAdmin, 'sub_categories')

  const toProcess = venues
    .filter(r => !alreadyDoneKeys.has(r.name.toLowerCase().trim()))
    .slice(0, limit)

  const remaining =
    venues.filter(r => !alreadyDoneKeys.has(r.name.toLowerCase().trim())).length -
    toProcess.length

  let processed = 0
  let enriched = 0
  const details: { name: string; subs: string[] }[] = []

  for (let i = 0; i < toProcess.length; i += BATCH) {
    const batch = toProcess.slice(i, i + BATCH)
    const input = batch.map(r => ({ name: r.name, type: r.type }))
    const results = await classifyBatch(input)

    for (const result of results) {
      details.push({ name: result.venue_key, subs: result.sub_categories })
      if (result.sub_categories.length > 0) enriched++

      if (!dryRun) {
        await supabaseAdmin.from('venue_ratings').upsert(
          {
            venue_key: result.venue_key,
            sub_categories: result.sub_categories,
            last_updated: new Date().toISOString(),
          },
          { onConflict: 'venue_key' }
        )
      }
    }
    processed += batch.length
  }

  return NextResponse.json({
    processed,
    enriched,
    alreadyDone: alreadyDoneKeys.size,
    remaining,
    dryRun,
    details,
  })
}
