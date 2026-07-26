import { NextRequest, NextResponse } from 'next/server'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { aggregateVotes } from '@/lib/group'
import type { GroupSession, GroupStatus, GroupPlan } from '@/lib/group'
import type { Candidate, GroupWhen, Fiilis } from '@/lib/candidate'

// Pollattava sessiotila (selain hakee ~2-3 s välein). Anon-luku palvelimella.
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!isSupabaseConfigured() || !supabase) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const { data: session, error } = await supabase
    .from('group_sessions')
    .select('id, when_filter, fiilis, candidates, status, result_plan, host_id')
    .eq('id', code.toUpperCase())
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: 'Sessiota ei löydy' }, { status: 404 })

  const { data: voteRows } = await supabase
    .from('group_votes')
    .select('voter_id, voter_name, card_id, vote')
    .eq('session_id', code.toUpperCase())

  const { votes, participants, voteCount } = aggregateVotes(voteRows ?? [])

  const payload: GroupSession = {
    code: session.id,
    when: session.when_filter as GroupWhen,
    fiilis: (session.fiilis ?? []) as Fiilis[],
    candidates: (session.candidates ?? []) as Candidate[],
    status: session.status as GroupStatus,
    resultPlan: (session.result_plan ?? null) as GroupPlan | null,
    hostId: session.host_id ?? null,
    participants,
    votes,
    voteCount,
  }
  return NextResponse.json(payload)
}
