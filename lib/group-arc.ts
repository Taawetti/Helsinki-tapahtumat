// Illan kaaren generointi ILMAN AI:ta — oletusmoottori (0 €, välitön, ei koskaan
// alhaalla). AI-polku on säilytetty synthesize-reitissä valinnaisena tehosteena
// (GROUP_AI_MODE=anthropic).
//
// Periaate: faktat tulevat aina candidates-snapshotista (groundaus), koodi vain
// 1) valitsee ja järjestää kortit roolipohjalla + äänillä, 2) kirjoittaa
// suomenkieliset tekstit valmiista pohjista kortin faktoilla.
import type { Candidate, GroupWhen, CandidateRole } from '@/lib/candidate'
import type { GroupArcPlan, PlanStep } from '@/lib/group'
import { walkMinutesBetween } from '@/lib/group'

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
    superMatch: superMatch || undefined,
  }
}

// Kävelysiirtymät peräkkäisten vaiheiden välille (haversine).
export function withTravelTimes(steps: PlanStep[]): PlanStep[] {
  for (let i = 1; i < steps.length; i++) {
    const min = walkMinutesBetween(steps[i - 1], steps[i])
    if (min != null) steps[i].travelFromPrevMin = min
  }
  return steps
}

// GROUNDAUS AI-polulle: vaiheet ilman tunnistettua cardId:tä KARSITAAN
// (hallusinaatiosuoja). Faktat snapshotista, AI antaa vain järjestyksen + perustelut.
export function groundSteps(aiSteps: AiStep[], candidates: Candidate[], superIds: Set<string>): PlanStep[] {
  const byId = new Map(candidates.map(c => [c.id, c]))
  const steps: PlanStep[] = []
  for (const ai of aiSteps) {
    const c = ai.cardId ? byId.get(ai.cardId) : undefined
    if (!c) continue
    steps.push(candidateToStep(c, ai.why, c.time || ai.time, superIds.has(c.id)))
  }
  return withTravelTimes(steps)
}

// ── Deterministinen moottori ───────────────────────────────────────────────

// Illan luontainen kulku: tekeminen → ruoka → drinkit → pääohjelma.
const ROLE_ORDER: CandidateRole[] = ['activity', 'food', 'drinks', 'program']

// Oletuskellonajat rooleittain kun kortilla ei ole todellista aikaa (tapahtumat).
const DEFAULT_HOUR: Record<GroupWhen, Record<CandidateRole, number>> = {
  tonight: { activity: 18, food: 19, drinks: 21, program: 22 },
  day:     { activity: 11, food: 13, drinks: 15, program: 17 },
  weekend: { activity: 14, food: 17, drinks: 19, program: 21 },
}

const WHEN_TEXT: Record<GroupWhen, string> = { tonight: 'iltanne', day: 'päivänne', weekend: 'viikonlopunne' }

// "to 20.50" → 20.83 (fi-FI Intl -muoto). Palauttaa null jos ei kellonaikaa.
function parseHour(t?: string): number | null {
  if (!t) return null
  const m = t.match(/(\d{1,2})\.(\d{2})/)
  if (!m) return null
  return Number(m[1]) + Number(m[2]) / 60
}

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

// Valitsee ja järjestää tykätyt kortit kaareksi. variant > 0 kiertää
// roolisisäisiä valintoja ("kudo uudelleen" → eri yhdistelmä, edelleen 0 €).
export function buildDeterministicArc(
  loved: Candidate[],
  votes: Record<string, { love: number; skip: number }>,
  superIds: Set<string>,
  opts: { when: GroupWhen; variant?: number },
): GroupArcPlan | null {
  if (loved.length === 0) return null
  const variant = opts.variant ?? 0

  // 1. Roolijonot: eniten ❤️, sitten laatupisteet
  const byRole = new Map<CandidateRole, Candidate[]>()
  for (const c of loved) {
    const q = byRole.get(c.role) ?? []
    q.push(c)
    byRole.set(c.role, q)
  }
  const byLove = (a: Candidate, b: Candidate) =>
    (votes[b.id]?.love ?? 0) - (votes[a.id]?.love ?? 0) || b._score - a._score
  for (const q of byRole.values()) q.sort(byLove)

  // 2. Yksi kortti per rooli pohjajärjestyksessä; variant kiertää jonoa
  const picked: Candidate[] = []
  for (const role of ROLE_ORDER) {
    const q = byRole.get(role)
    if (!q?.length) continue
    picked.push(q[variant % q.length])
  }

  // 3. Täydennys parhailla käyttämättömillä (max 5 vaihetta) — ei kuitenkaan
  //    enempää kuin tykättyjä on
  const used = new Set(picked.map(c => c.id))
  const maxSteps = Math.min(5, loved.length)
  const fillers = loved.filter(c => !used.has(c.id)).sort(byLove)
  for (const c of fillers) {
    if (picked.length >= maxSteps) break
    picked.push(c)
    used.add(c.id)
  }

  // 4. Pohjajärjestys roolien mukaan (saman roolin sisällä äänijärjestys säilyy)
  picked.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))

  // 5. Kellonajat: todelliset ajat voittavat aina; oletukset sovitetaan
  //    pääohjelman TODELLISEN ajan mukaan, jottei esim. drinks ole myöhemmin
  //    kuin 20.50 alkava keikka.
  const hours = { ...DEFAULT_HOUR[opts.when] }
  const programCard = picked.find(c => c.role === 'program')
  const anchorH = programCard ? parseHour(programCard.time) : null
  if (anchorH != null) {
    hours.drinks = Math.max(1, Math.floor(anchorH) - 1)
    hours.food = Math.min(hours.food, Math.max(1, Math.floor(anchorH) - 2))
    hours.activity = Math.min(hours.activity, Math.max(1, hours.food - 1))
  }

  // 6. Vaiheet + faktat + kävelyajat
  const steps: PlanStep[] = picked.map(c =>
    candidateToStep(c, whyFor(c, superIds.has(c.id)), c.time || `klo ${hours[c.role]}`, superIds.has(c.id)),
  )
  withTravelTimes(steps)

  const first = picked[0].title
  const last = picked[picked.length - 1].title
  const intro = picked.length === 1
    ? `Teidän valintanne: ${first}.`
    : `Teidän ${WHEN_TEXT[opts.when]}: ${first} → ${last}. ${picked.length} vaihetta porukan tykätyistä.`

  return {
    kind: 'arc',
    engine: 'rules',
    variant,
    intro,
    arc: steps,
    outro: 'Hyvää menoa — nauttikaa! 🎉',
  }
}
