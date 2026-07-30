import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Session push-tilaus ("ilmoita kun kaari/voittaja valmis"). Sama validointi
// kuin /api/subscribe — mutta group_push-tauluun, joka elää ja kuolee session
// mukana (ON DELETE CASCADE). Ei osallistu päivittäiseen digest-pushiin.
export const dynamic = 'force-dynamic'

function isValidEndpoint(s: unknown): s is string {
  if (typeof s !== 'string' || s.length > 2048) return false
  try {
    return new URL(s).protocol === 'https:'
  } catch { return false }
}
function isValidKey(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= 512
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const voterId = typeof body.voterId === 'string' ? body.voterId.slice(0, 64) : ''
  const endpoint = body.endpoint
  const keys = body.keys
  if (!voterId || !isValidEndpoint(endpoint) || !isValidKey(keys?.p256dh) || !isValidKey(keys?.auth)) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const sessionId = code.toUpperCase()
  // Varmista että sessio on olemassa ja auki — ei tilauksia kuolleisiin sessioihin.
  const { data: session } = await supabaseAdmin.from('group_sessions').select('status').eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Sessiota ei löydy' }, { status: 404 })
  if (session.status === 'done') return NextResponse.json({ error: 'Sessio on jo päätetty' }, { status: 409 })

  const { error } = await supabaseAdmin.from('group_push').upsert(
    { session_id: sessionId, voter_id: voterId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: 'session_id,endpoint' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => null)
  if (!isValidEndpoint(body?.endpoint)) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })
  }

  await supabaseAdmin
    .from('group_push')
    .delete()
    .eq('session_id', code.toUpperCase())
    .eq('endpoint', body.endpoint)
  return NextResponse.json({ ok: true })
}
