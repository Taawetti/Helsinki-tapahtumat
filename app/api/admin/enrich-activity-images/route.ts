import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchActivitiesCached } from '@/app/api/activities/route'

export const maxDuration = 300

// Skip parks — they have no Google Business profiles
const SKIP_CATEGORIES = new Set(['puisto'])

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
      headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: query,
        location_name: 'Helsinki,Helsinki,Uusimaa,Finland',
        language_name: 'Finnish',
      }]),
    })
    const data = await res.json()
    return data?.tasks?.[0]?.result?.[0]?.items?.[0]?.main_image ?? null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const limit: number = Math.min(body.limit ?? 50, 100)

  const allActivities = await fetchActivitiesCached()
  const eligible = allActivities.filter(a => !SKIP_CATEGORIES.has(a.category))

  // Already attempted (real image or '' = tried)
  const { data: doneRows } = await supabaseAdmin
    .from('venue_ratings')
    .select('venue_key')
    .like('venue_key', 'act:%')
    .not('main_image', 'is', null)

  const doneKeys = new Set((doneRows ?? []).map((r: { venue_key: string }) => r.venue_key))

  const toProcess = eligible
    .filter(a => !doneKeys.has(`act:${a.name.toLowerCase().trim()}`))
    .slice(0, limit)

  const remaining = eligible
    .filter(a => !doneKeys.has(`act:${a.name.toLowerCase().trim()}`))
    .length - toProcess.length

  let updated = 0
  let notFound = 0
  const samples: { name: string; image: string }[] = []

  for (const act of toProcess) {
    const venueKey = `act:${act.name.toLowerCase().trim()}`
    const query = act.address
      ? `${act.name} ${act.address} Helsinki`
      : `${act.name} Helsinki`
    const image = await fetchGoogleImage(query)

    await supabaseAdmin
      .from('venue_ratings')
      .upsert({
        venue_key: venueKey,
        main_image: image ?? '',
        last_updated: new Date().toISOString(),
      }, { onConflict: 'venue_key' })

    if (image) {
      updated++
      if (samples.length < 5) samples.push({ name: act.name, image })
    } else {
      notFound++
    }

    await new Promise(r => setTimeout(r, 1100))
  }

  return NextResponse.json({ processed: toProcess.length, updated, notFound, remaining, samples })
}
