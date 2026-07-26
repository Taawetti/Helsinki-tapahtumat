import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Yksittäinen ääni (❤️/✕). Julkinen (loppukäyttäjä), kirjoitus service-role
// -clientillä. Upsert → yksi ääni per kortti per osallistuja (voi muuttaa).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const voterId: string = typeof body.voterId === 'string' ? body.voterId.slice(0, 64) : ''
  const voterName: string | null = typeof body.voterName === 'string' ? body.voterName.trim().slice(0, 40) || null : null
  const cardId: string = typeof body.cardId === 'string' ? body.cardId.slice(0, 200) : ''
  const vote: string = body.vote === 'love' ? 'love' : body.vote === 'skip' ? 'skip' : ''
  if (!voterId || !cardId || !vote) return NextResponse.json({ error: 'Virheellinen ääni' }, { status: 400 })

  const sessionId = code.toUpperCase()
  // Varmista sessio + että se on vielä auki (ei äänestetä valmiin kaaren jälkeen).
  const { data: session } = await supabaseAdmin.from('group_sessions').select('status, candidates').eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Sessiota ei löydy' }, { status: 404 })
  if (session.status === 'done') return NextResponse.json({ error: 'Sessio on jo päätetty' }, { status: 409 })

  // cardId täytyy kuulua sessionin pakkaan (estää roska/keksityt kortit → vääristetyt äänet).
  const cards = (session.candidates ?? []) as { id: string }[]
  if (!cards.some(c => c.id === cardId)) return NextResponse.json({ error: 'Tuntematon kortti' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('group_votes')
    .upsert(
      { session_id: sessionId, voter_id: voterId, voter_name: voterName, card_id: cardId, vote },
      { onConflict: 'session_id,voter_id,card_id' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
