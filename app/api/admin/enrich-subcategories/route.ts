import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchOSMCached } from '@/app/api/restaurants/route'
import { fetchEnrichedKeys } from '@/lib/venue-enrichment'
import { requireAdmin } from '@/lib/admin-auth'

export const maxDuration = 300

// Sub-categories per OSM type — must match matchesSubCat in RestaurantsView
const VALID_SUBS: Record<string, string[]> = {
  baari:   ['cocktail', 'craft_beer', 'wine', 'sports', 'karaoke'],
  yokerho: ['klubi', 'karaoke', 'tekno', 'katto'],
  kahvila: ['brunssi', 'paahtimo', 'erikois', 'ranskalaiset', 'klassikot', 'boheemit'],
}

/** Leiman hyväksymiseen vaadittava näyttö paikan nimestä — sama säännöstö
 *  kuin scripts/korjaa-alakategoriat.ts -kertakorjauksessa. LLM:n arvaus ei
 *  riitä (mitattu 4.9.2026: 144 "cocktail"-leimaa todisteella 17; erikois-
 *  kahviloissa bubble tea -ketjuja). Leimat joilla ei ole tekstitodistetta
 *  lainkaan (klassikot, boheemit) eivät synny LLM-ajosta enää ollenkaan —
 *  ne elävät kertakorjauksen instituutiovahvistuksella (arvostelumassa). */
const SUB_TODISTEET: Record<string, RegExp | null> = {
  cocktail:     /cocktail|coctail|mixolog|drinkkibaari/i,
  craft_beer:   /panimo|brewery|brewing|taproom|olutbaari|olutravintola|olutsali|oluthuone|bierhaus|biergarten|beer bar|beer house|brewpub|craft beer/i,
  wine:         /viinibaari|wine bar|vinoteca|viinibistro|champagne/i,
  sports:       /urheilubaari|sports? bar/i,
  karaoke:      /karaoke/i,
  brunssi:      /brunssi|brunch/i,
  paahtimo:     /paahtimo|roaster|roastery|coffee roas/i,
  erikois:      /specialty|speciality|espresso ?ba|single.?origin|pour.?over|aeropress|kahvibaari/i,
  ranskalaiset: /patisserie|pâtisserie|boulangerie|konditoria|croissant|ranskalai|french caf/i,
  klassikot:    null, // ei tekstitodistetta olemassa → LLM ei saa jakaa
  boheemit:     null,
  klubi:        /yökerho|nightclub|night ?club|klubi|live club|disco/i,
  tekno:        /tekno|techno/i,
  katto:        /kattobaari|kattoterassi|rooftop|roof ?top|sky ?(bar|room)/i,
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
        const venue = venues.find(v => v.name.toLowerCase().trim() === r.venue_key)
        const type = venue?.type ?? ''
        if (!(VALID_SUBS[type] ?? []).includes(s)) return false
        // Kuratoitu leima vaatii näytön paikan nimestä — pelkkä LLM:n arvaus
        // ei kelpaa (ks. SUB_TODISTEET). null-todisteiset leimat (klassikot,
        // boheemit) eivät synny tästä ajosta lainkaan.
        const todiste = SUB_TODISTEET[s]
        if (todiste === null) return false
        if (todiste) return todiste.test(venue?.name ?? r.venue_key)
        return true
      }),
    }))
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) return authError
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
