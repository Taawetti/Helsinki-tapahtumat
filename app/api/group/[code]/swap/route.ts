import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { aggregateVotes, lovedCards, superMatchIds } from '@/lib/group'
import type { GroupArcPlan } from '@/lib/group'
import { arcFromSelection } from '@/lib/group-arc'
import { isHostSession } from '@/lib/group-host'
import { helsinkiNow, helsinkiToday } from '@/lib/helsinki-time'
import type { Candidate, GroupWhen } from '@/lib/candidate'

// VAIHDA ASKEL — deterministinen korvaus ilman AI:ta: korvaa kaaren yhden
// vaiheen saman roolin toiseksi parhaalla tykätyllä kortilla JA laskee koko
// kaaren aikataulun uudelleen luottamusmoottorilla (M1: vaihto ei voi enää
// rikkoa siirtymiä tai jättää mennyttä aikaa). Toistuvat painallukset kiertävät
// vaihtoehtoja. Vain aloittaja. Faktat groundataan candidates-snapshotista.
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
    .select('status, mode, candidates, result_plan, host_id, host_secret, when_filter')
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

  // Pakotettu valinta: kaaren nykyiset kortit, vaihdettu kohdallaan.
  // (Kortit joita ei enää löydy snapshotista putoavat pois — ne eivät ole
  // enää pätevää dataa.)
  const byId = new Map(candidates.map(c => [c.id, c]))
  const forced: Candidate[] = []
  for (let i = 0; i < plan.arc.length; i++) {
    if (i === stepIndex) { forced.push(next); continue }
    const cid = plan.arc[i].cardId
    const c = cid ? byId.get(cid) : undefined
    if (c) forced.push(c)
  }

  // Koko kaaren aikataulu UUDELLEEN moottorilla: siirtymät, puskurit,
  // aukiolot ja nyt-raja lasketaan aina puhtaasti. Ei eksplisiittistä
  // reittioptimointia — hostin valinnat säilyvät sellaisinaan.
  const when = session.when_filter as GroupWhen
  const date = plan.date ?? helsinkiToday()
  const nowH = date === helsinkiToday()
    ? helsinkiNow().getHours() + helsinkiNow().getMinutes() / 60
    : undefined
  const rescheduled = arcFromSelection(forced, votes, superIds, { when, date, nowH, variant: plan.variant })
  if (!rescheduled) {
    return NextResponse.json({ error: 'Korvausta ei saada aikataulutettua järkevästi — kokeile toista askelta' }, { status: 400 })
  }
  // Hostin eksplisiittinen valinta ei saa kadota hiljaa: jos korvauskortti
  // putosi aikataulusta (kiinni / ei mahdu), kerro se selvästi 400:na —
  // älä tallenna kaarta, jossa hostin askel on vain kadonnut.
  if (!rescheduled.arc.some(s => s.cardId === next.id)) {
    return NextResponse.json({ error: `"${next.title}" ei mahdu kaaren aikatauluun (kiinni tai liian myöhään) — kokeile toista vaihtoehtoa` }, { status: 400 })
  }

  // Hostin perustelu säilyy (moottori kirjoittaa oman intronsa; käytetään sitä).
  const newPlan: GroupArcPlan = { ...plan, arc: rescheduled.arc, intro: rescheduled.intro }
  const { error } = await supabaseAdmin
    .from('group_sessions').update({ result_plan: newPlan }).eq('id', sessionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ plan: newPlan })
}
