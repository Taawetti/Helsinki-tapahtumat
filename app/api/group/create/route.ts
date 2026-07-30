import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildGroupDeck } from '@/lib/group-deck'
import type { GroupWhen, Fiilis } from '@/lib/candidate'
import { genCode } from '@/lib/group'
import type { GroupMode } from '@/lib/group'

// Pakan siementäminen hakee /api/events (quick), /api/restaurants, /api/activities
// ja /api/venue-ratings — voi kestää sekunteja.
export const maxDuration = 60

const VALID_FIILIS: Fiilis[] = ['menoa', 'rento', 'kulttuuri', 'ulkoilu', 'ruoka']

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const when: GroupWhen = (['tonight', 'day', 'weekend'] as const).includes(body.when) ? body.when : 'tonight'
  const fiilis: Fiilis[] = Array.isArray(body.fiilis) ? body.fiilis.filter((f: unknown): f is Fiilis => VALID_FIILIS.includes(f as Fiilis)) : []
  const mode: GroupMode = body.mode === 'quick' ? 'quick' : 'arc'
  const hostId: string | null = typeof body.hostId === 'string' ? body.hostId.slice(0, 64) : null

  const candidates = await buildGroupDeck(req.nextUrl.origin, when, fiilis)

  if (candidates.length < 4) {
    return NextResponse.json({ error: 'Ei tarpeeksi ehdokkaita juuri nyt — kokeile eri ajankohtaa' }, { status: 503 })
  }

  // Luo uniikki koodi (retry törmäyksessä — harvinaista 32^4 ≈ 1M avaruudessa).
  let code = ''
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = genCode(4)
    const { data: existing } = await supabaseAdmin.from('group_sessions').select('id').eq('id', candidate).maybeSingle()
    if (!existing) { code = candidate; break }
  }
  if (!code) return NextResponse.json({ error: 'Koodin luonti epäonnistui, yritä uudelleen' }, { status: 500 })

  const { error } = await supabaseAdmin.from('group_sessions').insert({
    id: code,
    when_filter: when,
    fiilis,
    mode,
    candidates,
    status: 'open',
    host_id: hostId,
  })
  if (error) return NextResponse.json({ error: `Session luonti epäonnistui: ${error.message}` }, { status: 500 })

  return NextResponse.json({ code, count: candidates.length, mode })
}
