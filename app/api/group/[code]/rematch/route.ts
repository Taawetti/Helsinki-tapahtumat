import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildGroupDeck } from '@/lib/group-deck'
import type { GroupWhen, BudgetId } from '@/lib/candidate'
import { isHostSession } from '@/lib/group-host'

// REMATCH — "jatka samalla porukalla": sama sessio (ja linkki) elää, mutta
// pakka rakennetaan uudelleen ja äänet nollataan. round+1 kertoo klienteille
// että paikalliset äänestysmuistit pitää tyhjentää. Vain aloittaja.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const hostId: string | null = typeof body.hostId === 'string' ? body.hostId.slice(0, 64) : null
  const hostSecret: string | null = typeof body.hostSecret === 'string' ? body.hostSecret.slice(0, 80) : null

  const sessionId = code.toUpperCase()
  const { data: session } = await supabaseAdmin
    .from('group_sessions')
    .select('status, when_filter, fiilis, custom_start, custom_end, area, areas, budget, host_id, host_secret, round')
    .eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Sessiota ei löydy' }, { status: 404 })
  if (!isHostSession(session, { hostId, hostSecret })) {
    return NextResponse.json({ error: 'Vain aloittaja voi aloittaa uuden kierroksen' }, { status: 403 })
  }

  const when = session.when_filter as GroupWhen
  const fiilis = (session.fiilis ?? []) as string[]
  // v3: rematch säilyttää kaikki valinnat — myös oman päivän, alueet ja budjetin
  const candidates = await buildGroupDeck(req.nextUrl.origin, when, fiilis, {
    customStart: (session.custom_start ?? null) as string | null,
    customEnd: (session.custom_end ?? null) as string | null,
    budget: (session.budget ?? 'any') as BudgetId,
    areas: ((session.areas ?? []) as string[]).length > 0
      ? (session.areas ?? []) as string[]
      : ((session.area ?? 'kaikki') !== 'kaikki' ? [session.area as string] : []),
  })
  if (candidates.length < 4) {
    return NextResponse.json({ error: 'Ei tarpeeksi ehdokkaita juuri nyt — kokeile myöhemmin uudelleen' }, { status: 503 })
  }

  // Äänet pois ensin (vierasavain CASCADE hoitaisi session poistossa, mutta
  // sessio säilyy → siivotaan käsin), sitten session nollaus + uusi pakka.
  const { error: delError } = await supabaseAdmin.from('group_votes').delete().eq('session_id', sessionId)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  const { data: updated, error } = await supabaseAdmin
    .from('group_sessions')
    .update({
      candidates,
      status: 'open',
      result_plan: null,
      round: (session.round ?? 1) + 1,
      // Pidennä elinkaarta rematchin yhteydessä — porukka on aktiivinen.
      expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', sessionId)
    .select('round')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, round: updated?.[0]?.round ?? null, count: candidates.length })
}
