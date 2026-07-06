import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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

  // Get all venues in Supabase without an image yet (no cuisine filter)
  const { data: targets, error: targetErr } = await supabaseAdmin
    .from('venue_ratings')
    .select('venue_key')
    .is('main_image', null)
    .limit(limit)

  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 })

  // Count remaining after this batch
  const { count: remaining } = await supabaseAdmin
    .from('venue_ratings')
    .select('venue_key', { count: 'exact', head: true })
    .is('main_image', null)

  const toProcess = targets ?? []
  let updated = 0
  let notFound = 0
  const samples: { name: string; image: string }[] = []

  for (const row of toProcess) {
    const query = `${row.venue_key} Helsinki`
    const image = await fetchGoogleImage(query)

    if (image) {
      await supabaseAdmin
        .from('venue_ratings')
        .update({ main_image: image })
        .eq('venue_key', row.venue_key)
      updated++
      if (samples.length < 5) samples.push({ name: row.venue_key, image })
    } else {
      // Mark as attempted by setting a placeholder so we don't retry forever
      await supabaseAdmin
        .from('venue_ratings')
        .update({ main_image: '' })
        .eq('venue_key', row.venue_key)
      notFound++
    }

    await new Promise(r => setTimeout(r, 1100))
  }

  return NextResponse.json({
    processed: toProcess.length,
    updated,
    notFound,
    remaining: Math.max(0, (remaining ?? 0) - toProcess.length),
    samples,
  })
}
