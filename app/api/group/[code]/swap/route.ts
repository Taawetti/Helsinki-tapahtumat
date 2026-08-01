import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { aggregateVotes, lovedCards, superMatchIds } from '@/lib/group'
import type { GroupArcPlan, PlanStep } from '@/lib/group'
import { withTravelTimes } from '@/lib/group-arc'
import { isHostSession } from '@/lib/group-host'
import type { Candidate } from '@/lib/candidate'

// VAIHDA ASKEL — deterministinen korvaus ilman AI:ta: korvaa kaaren yhden
// vaiheen saman roolin toiseksi parhaalla tykätyllä kortilla. Toistuvat painallukset
// kiertävät vaihtoehtoja (seuraava rankatun listan kortti nykyisen jälkeen).
// Vain aloittaja. Faktat groundataan candidates-snapshotista kuten synteesissä.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const hostId: string | null = typeof body.hostId === 'string' ? body.hostId.slice(0, 64) : null
  const hostSecret: string | null = typeof body.hostSecret === 'string' ? body.hostSecret.slice(0, 80) : null
  const stepIndex: number = typeof body.stepIndex === 'number' ? body.stepIndex : -1

  const sessionId = code.toUpperCase()
  const { data: session } = await supabaseAdmin
    .from('group_sessions')
    .select('status, mode, candidates, result_plan, host_id, host_secret')
    .eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Sessiota ei löydy' }, { status: 404 })
  if (!isHostSession(session, { hostId, hostSecret })) {
    return NextResponse.json({ error: 'Vain aloittaja voi muokata kaarta' }, { status: 403 })
  }
  const plan = session.result_plan as GroupArcPlan | null
  if (session.status !== 'done' || session.mode !== 'arc' || !plan || plan.kind !== 'arc') {
    return NextResponse.json({ error: 'Ei muokattavaa kaarta' }, { status: 409 })
  }
  if (stepIndex < 0 || stepIndex >= plan.arc.length) {
    return NextResponse.json({ error: 'Virheellinen vaihe' }, { status: 400 })
  }

  const candidates = (session.candidates ?? []) as Candidate[]
  const current = plan.arc[stepIndex]

  const { data: voteRows } = await supabaseAdmin
    .from('group_votes').select('voter_id, voter_name, card_id, vote').eq('session_id', sessionId)
  const { votes, participants } = aggregateVotes(voteRows ?? [], candidates.length)

  // Vaihtoehdot: sama rooli + tykätty, rankattuna (eniten ❤️, sitten laatupisteet).
  // Rotaatio: etsitään rankatulta listalta nykyistä SEURAAVA kortti joka ei jo ole
  // kaaressa — toistuvat painallukset kiertävät kaikki vaihtoehdot järjestyksessä.
  const inArc = new Set(plan.arc.map(s => s.cardId).filter(Boolean))
  const ranked = lovedCards(candidates, votes)
    .filter(c => c.role === current.role)
    .sort((a, b) => (votes[b.id]?.love ?? 0) - (votes[a.id]?.love ?? 0) || b._score - a._score)

  const curIdx = ranked.findIndex(c => c.id === current.cardId) // -1 = nykyinen ei enää tykätty-listalla → alota alusta
  let next: Candidate | undefined
  for (let k = 1; k <= ranked.length; k++) {
    const cand = ranked[(curIdx + k) % ranked.length]
    if (!inArc.has(cand.id)) { next = cand; break }
  }

  if (!next) {
    return NextResponse.json({ error: 'Ei vaihtoehtoja tälle roolille — tykätkää lisää tai kudokaa uudelleen' }, { status: 400 })
  }
  const superIds = superMatchIds(votes, participants.length)

  const newStep: PlanStep = {
    cardId: next.id,
    role: next.role,
    emoji: next.emoji,
    title: next.title,
    time: next.time,
    why: current.why, // AI:n perustelu ei koske uutta paikkaa → korvataan alla
    address: next.address,
    url: next.url,
    image: next.image,
    lat: next.lat,
    lon: next.lon,
    rating: next.rating,
    badge: next.badge,
    isFree: next.isFree,
    priceLevel: next.priceLevel,
    openingHours: next.openingHours,
    superMatch: superIds.has(next.id) || undefined,
  }
  // Perustelu pitää vaihtaa koskemaan uutta paikkaa — käytä kortin omaa why-tekstiä.
  newStep.why = next.why || current.why

  const arc = plan.arc.slice()
  arc[stepIndex] = newStep

  // Laske siirtymät uudelleen koko kaarelle (vaihto vaikuttaa naapureihin).
  // withTravelTimes hoitaa myös walk/transit-moodin ja Reittiopas-linkit.
  for (let i = 0; i < arc.length; i++) {
    arc[i] = { ...arc[i] }
    delete arc[i].travelFromPrevMin
    delete arc[i].travelFromPrevMode
    delete arc[i].travelFromPrevUrl
    delete arc[i].travelFromPrevSummary
  }
  withTravelTimes(arc)

  const newPlan: GroupArcPlan = { ...plan, arc }
  const { error } = await supabaseAdmin
    .from('group_sessions').update({ result_plan: newPlan }).eq('id', sessionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ plan: newPlan })
}
