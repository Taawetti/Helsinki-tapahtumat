// Illan kaaren generointi ILMAN AI:ta — oletusmoottori (0 €, välitön, ei koskaan
// alhaalla). AI-polku on säilytetty synthesize-reitissä valinnaisena tehosteena
// (GROUP_AI_MODE=anthropic).
//
// Periaate: faktat tulevat aina candidates-snapshotista (groundaus). Valinta on
// TIUKKA (max 1 per rooli + max 1 per alatyyppi, kiinni olevat karsitaan) ja
// aikataulutus tehdään lib/group-scheduler.ts:n kovin rajoittein (kesto +
// kulkuaika + puskuri, aukiolot, ei menneitä aikoja).
import type { Candidate, GroupWhen, CandidateRole } from '@/lib/candidate'
import type { GroupArcPlan, PlanStep } from '@/lib/group'
import { walkMinutesBetween } from '@/lib/group'
import {
  ROLE_ORDER,
  closedOnArcDay,
  optimizeForTravel,
  scheduleSteps,
  subtypeOf,
  type ScheduleOpts,
} from '@/lib/group-scheduler'
import { helsinkiToday } from '@/lib/helsinki-time'

// ── Yhteiset rakennuspalat (myös AI-polku käyttää) ────────────────────────

// AI:n palauttama välimuoto (ennen groundausta).
export interface AiStep {
  cardId?: string
  role: string
  emoji: string
  title: string
  time?: string
  why: string
}

export function candidateToStep(c: Candidate, why: string, time: string | undefined, superMatch: boolean): PlanStep {
  return {
    cardId: c.id,
    role: c.role,
    emoji: c.emoji,
    title: c.title,
    time,
    why,
    address: c.address,
    url: c.url,
    image: c.image,
    lat: c.lat,
    lon: c.lon,
    rating: c.rating,
    badge: c.badge,
    isFree: c.isFree,
    priceLevel: c.priceLevel,
    openingHours: c.openingHours,
    superMatch: superMatch || undefined,
  }
}

// Kävelysiirtymät peräkkäisten vaiheiden välille (haversine). Yli 25 min
// kävelyn kohdalla tarjotaan Reittiopas-linkki joukkoliikenteeseen.
export function withTravelTimes(steps: PlanStep[]): PlanStep[] {
  for (let i = 1; i < steps.length; i++) {
    const min = walkMinutesBetween(steps[i - 1], steps[i])
    if (min == null) continue
    steps[i].travelFromPrevMin = min
    // Summary on aina väliä edeltävän laskennan tulos — poistetaan vanha,
    // enrichTransitTimes lisää tuoreen (Digitransit) tarvittaessa.
    delete steps[i].travelFromPrevSummary
    if (min > 25) {
      const a = steps[i - 1]
      const b = steps[i]
      steps[i].travelFromPrevMode = 'transit'
      steps[i].travelFromPrevUrl =
        `https://reittiopas.hsl.fi/reitti/${a.lat},${a.lon}/${b.lat},${b.lon}`
    } else {
      steps[i].travelFromPrevMode = 'walk'
    }
  }
  return steps
}

// GROUNDAUS AI-polulle: vaiheet ilman tunnistettua cardId:tä KARSITAAN
// (hallusinaatiosuoja). Faktat snapshotista, AI antaa vain järjestyksen + perustelut.
// Roli- ja alatyyppisuoja PÄTEE MYÖS TÄÄLLÄ — AI:n ehdottamat duplikaatit
// (esim. 2 saunaa) karsitaan ensimmäiseen osumaan.
export function groundSteps(aiSteps: AiStep[], candidates: Candidate[], superIds: Set<string>): PlanStep[] {
  const byId = new Map(candidates.map(c => [c.id, c]))
  const usedRoles = new Set<string>()
  const usedSubs = new Set<string>()
  const steps: PlanStep[] = []
  for (const ai of aiSteps) {
    const c = ai.cardId ? byId.get(ai.cardId) : undefined
    if (!c) continue
    if (usedRoles.has(c.role) || usedSubs.has(subtypeOf(c))) continue
    usedRoles.add(c.role)
    usedSubs.add(subtypeOf(c))
    steps.push(candidateToStep(c, ai.why, c.time || ai.time, superIds.has(c.id)))
  }
  return withTravelTimes(steps)
}

// ── Deterministinen moottori ───────────────────────────────────────────────

const WHEN_TEXT: Record<GroupWhen, string> = { tonight: 'iltanne', day: 'päivänne', weekend: 'viikonlopunne' }

function whyFor(c: Candidate, superMatch: boolean): string {
  if (superMatch) return 'Koko porukan suosikki — tätä ei voi ohittaa! 🎉'
  if (c.isFree) return 'Ilmainen, mutta täyttä laatua.'
  if (c.badge) return `${c.badge} — taso on kunnossa.`
  if (c.rating != null && c.rating >= 4.5 && c.reviewCount) return `⭐ ${c.rating.toFixed(1)} ja ${c.reviewCount} arvostelua puhuu puolestaan.`
  if (c.rating != null && c.rating >= 4.5) return `⭐ ${c.rating.toFixed(1)} — varma valinta.`
  switch (c.role) {
    case 'activity': return 'Mukava avaus, joka virittää porukan tunnelmaan.'
    case 'food': return 'Illan ankkuri — hyvä ruoka pitää porukan kasassa.'
    case 'drinks': return 'Lasilliset ennen pääohjelmaa.'
    case 'program': return 'Illan huipennus — tätä odotettiin.'
    default: return ''
  }
}

// Kellonaika 15 min tarkkuudella: 19.49 → "klo 19.30", 19.9 → "klo 20".
function fmtHour(h: number): string {
  const q = Math.round(h * 4) / 4
  const hh = Math.floor(q)
  const mm = Math.round((q - hh) * 60)
  return mm === 0 ? `klo ${hh}` : `klo ${hh}.${String(mm).padStart(2, '0')}`
}

/** Ydin: pakotettu valinta → aikataulutus → vaiheet. Käyttävät sekä
 *  buildDeterministicArc (vapaavalintainen kaari) että swap-reitti
 *  (hostin pinnama valinta, aikataulu lasketaan aina uudelleen). */
export function arcFromSelection(
  cards: Candidate[],
  votes: Record<string, { love: number; skip: number }>,
  superIds: Set<string>,
  opts: { when: GroupWhen; variant?: number; date?: string; nowH?: number; alternatives?: Map<CandidateRole, Candidate[]> },
): GroupArcPlan | null {
  if (cards.length === 0) return null
  const variant = opts.variant ?? 0
  const date = opts.date ?? helsinkiToday()

  const sopts: ScheduleOpts = { when: opts.when, date, nowH: opts.nowH }
  let timed = scheduleSteps(cards, sopts)
  if (!timed) return null

  // Reittioptimointi roolisisäisten vaihtoehtojen sisällä (vain kun vaihtoehtoja
  // on annettu — swap-polulla hostin eksplisiittiset valinnat säilyvät sellaisenaan).
  if (opts.alternatives) {
    timed = optimizeForTravel(timed, opts.alternatives, sopts)
  }

  const steps: PlanStep[] = timed.map(t => ({
    ...candidateToStep(t.c, whyFor(t.c, superIds.has(t.c.id)), t.c.time || fmtHour(t.startH), superIds.has(t.c.id)),
    durH: t.durH,
  }))
  withTravelTimes(steps)

  const first = steps[0].title
  const last = steps[steps.length - 1].title
  const intro = steps.length === 1
    ? `Teidän valintanne: ${first}.`
    : `Teidän ${WHEN_TEXT[opts.when]}: ${first} → ${last}. ${steps.length} vaihetta porukan tykätyistä.`

  return {
    kind: 'arc',
    engine: 'rules',
    variant,
    date,
    intro,
    arc: steps,
    outro: 'Hyvää menoa — nauttikaa! 🎉',
  }
}

// Valitsee tykätyt kortit kaareksi TIUKOIN säännöin ja aikatauluttaa ne
// luottamusmoottorilla. variant > 0 kiertää roolisisäisiä valintoja
// ("kudo uudelleen" → eri yhdistelmä, edelleen 0 €).
export function buildDeterministicArc(
  loved: Candidate[],
  votes: Record<string, { love: number; skip: number }>,
  superIds: Set<string>,
  opts: { when: GroupWhen; variant?: number; date?: string; nowH?: number },
): GroupArcPlan | null {
  if (loved.length === 0) return null
  const variant = opts.variant ?? 0
  const date = opts.date ?? helsinkiToday()
  const arcDay = new Date(`${date}T12:00:00`)

  // 0. Kiinni koko kaarpäivän olevat kortit eivät voi olla kaaressa LAINKAAN
  //    (ennen: jäivät kaareen pelkällä "⚠ Kiinni"-badgeella).
  const available = loved.filter(c => !closedOnArcDay(c, arcDay))
  if (available.length === 0) return null

  // 1. Roolijonot: eniten ❤️, sitten laatupisteet
  const byRole = new Map<CandidateRole, Candidate[]>()
  for (const c of available) {
    const q = byRole.get(c.role) ?? []
    q.push(c)
    byRole.set(c.role, q)
  }
  const byLove = (a: Candidate, b: Candidate) =>
    (votes[b.id]?.love ?? 0) - (votes[a.id]?.love ?? 0) || b._score - a._score
  for (const q of byRole.values()) q.sort(byLove)

  // 2. TIIKKA valinta: max 1 per rooli + max 1 per alatyyppi (esim. 2 saunaa
  //    on aina virhe). variant kiertää roolin sisäistä jonoa aloittaen
  //    kierroksesta mutta palaa aina parhaaseen kun variant=0.
  const picked: Candidate[] = []
  const usedSub = new Set<string>()
  for (const role of ROLE_ORDER) {
    const q = byRole.get(role)
    if (!q?.length) continue
    for (let k = 0; k < q.length; k++) {
      const cand = q[(variant + k) % q.length]
      if (usedSub.has(subtypeOf(cand))) continue
      picked.push(cand)
      usedSub.add(subtypeOf(cand))
      break
    }
  }
  if (picked.length === 0) return null

  return arcFromSelection(picked, votes, superIds, { ...opts, date, alternatives: byRole })
}
