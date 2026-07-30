import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { aggregateVotes, majorityWinner, quickPlanFromCandidate } from '@/lib/group'
import { sendGroupPush } from '@/lib/group-push'
import type { Candidate } from '@/lib/candidate'

// Yksittäinen ääni (❤️/✕). Julkinen (loppukäyttäjä), kirjoitus service-role
// -clientillä. Upsert → yksi ääni per kortti per osallistuja (voi muuttaa).
// Pikapäätös-moodissa jokaisen äänen jälkeen tarkistetaan enemmistö.
export const dynamic = 'force-dynamic'

function parseVoter(body: Record<string, unknown>) {
  const voterId = typeof body.voterId === 'string' ? body.voterId.slice(0, 64) : ''
  const voterName = typeof body.voterName === 'string' ? (body.voterName as string).trim().slice(0, 40) || null : null
  const cardId = typeof body.cardId === 'string' ? body.cardId.slice(0, 200) : ''
  return { voterId, voterName, cardId }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const { voterId, voterName, cardId } = parseVoter(body)
  const vote: string = body.vote === 'love' ? 'love' : body.vote === 'skip' ? 'skip' : ''
  if (!voterId || !cardId || !vote) return NextResponse.json({ error: 'Virheellinen ääni' }, { status: 400 })

  const sessionId = code.toUpperCase()
  // Varmista sessio + että se on vielä auki (ei äänestetä valmiin tuloksen jälkeen).
  const { data: session } = await supabaseAdmin.from('group_sessions').select('status, mode, candidates').eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Sessiota ei löydy' }, { status: 404 })
  if (session.status === 'done') return NextResponse.json({ error: 'Sessio on jo päätetty' }, { status: 409 })

  // cardId täytyy kuulua sessionin pakkaan (estää roska/keksityt kortit → vääristetyt äänet).
  const cards = (session.candidates ?? []) as Candidate[]
  if (!cards.some(c => c.id === cardId)) return NextResponse.json({ error: 'Tuntematon kortti' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('group_votes')
    .upsert(
      { session_id: sessionId, voter_id: voterId, voter_name: voterName, card_id: cardId, vote },
      { onConflict: 'session_id,voter_id,card_id' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // PIKAPÄÄTÖS: onko jokin kortti saavuttanut enemmistön? Tarkista jokaisen
  // äänen jälkeen — voittaja lukitaan atomisesti (CAS) → vain yksi kirjoittaa tuloksen.
  if (session.mode === 'quick') {
    const { data: voteRows } = await supabaseAdmin
      .from('group_votes').select('voter_id, voter_name, card_id, vote').eq('session_id', sessionId)
    const { votes, participants } = aggregateVotes(voteRows ?? [], cards.length)
    const winner = majorityWinner(cards, votes, participants.length)
    if (winner) {
      const plan = quickPlanFromCandidate(winner, votes[winner.id]?.love ?? 0, participants.length)
      const { data: locked } = await supabaseAdmin
        .from('group_sessions').update({ status: 'done', result_plan: plan })
        .eq('id', sessionId).eq('status', 'open').select('id')
      if (locked?.length) {
        // Awaitataan lähetys: serverless-instanssi voi jäätyä vastauksen jälkeen,
        // joten voittohetken ilmoituksen pitää ehtiä matkaan ennen paluuta.
        await sendGroupPush(sessionId, {
          title: '🎉 Päätös tehty!',
          body: `${winner.title} voitti äänestyksen.`,
          url: `/paatakaa/${sessionId}`,
        })
        return NextResponse.json({ ok: true, won: true })
      }
    }
  }

  return NextResponse.json({ ok: true })
}

// Äänen peruutus (undo-nappi swaippauksessa): poistaa osallistujan äänen kortilta.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const { voterId, cardId } = parseVoter(body)
  if (!voterId || !cardId) return NextResponse.json({ error: 'Virheellinen pyyntö' }, { status: 400 })

  const sessionId = code.toUpperCase()
  const { data: session } = await supabaseAdmin.from('group_sessions').select('status').eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Sessiota ei löydy' }, { status: 404 })
  if (session.status === 'done') return NextResponse.json({ error: 'Sessio on jo päätetty' }, { status: 409 })

  const { error } = await supabaseAdmin
    .from('group_votes')
    .delete()
    .eq('session_id', sessionId)
    .eq('voter_id', voterId)
    .eq('card_id', cardId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
