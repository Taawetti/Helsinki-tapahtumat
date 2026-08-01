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
import { clampToOpenHour } from '@/lib/opening-hours'

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
// Ikkunat on valittu realistisiksi: ruoka lounaaksi päivällä, illalliseksi illalla.
const DEFAULT_HOUR: Record<GroupWhen, Record<CandidateRole, number>> = {
  tonight: { activity: 17, food: 18.5, drinks: 21, program: 22 },
  day:     { activity: 10, food: 12, drinks: 16, program: 18 },
  weekend: { activity: 12, food: 13.5, drinks: 17, program: 20 },
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
  opts: { when: GroupWhen; variant?: number; date?: string },
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

  // 5. Kellonajat REALISTISIKSI:
  //    - tapahtumat pitävät aina todellisen aikansa (ankkuri, ei koskaan siirretä)
  //    - ruoka on LOUNAS (11.30–13.30) kun pääohjelma on päivällä, ILLALLINEN
  //      (17–19.30) kun ohjelma on illalla
  //    - drinks vasta ruuan jälkeen — tai ohjelman jälkeen ("jatkot"), jos
  //      ohjelma alkaa ≤21
  //    - lopuksi vaiheet laitetaan KRONOLOGISEEN järjestykseen, jottei
  //      kaaren järjestys ja kellonajat voi koskaan olla ristiriidassa.
  const base = { ...DEFAULT_HOUR[opts.when] }
  const programCard = picked.find(c => c.role === 'program')
  const anchorH = programCard ? parseHour(programCard.time) : null
  if (anchorH != null) {
    if (anchorH <= 17) {
      base.food = Math.min(Math.max(anchorH - 3.5, 11.5), 13.5)
      base.drinks = Math.min(Math.max(anchorH + 2, 18), 22)
    } else {
      base.food = Math.min(Math.max(anchorH - 2.5, 17), 19.5)
      base.drinks = anchorH <= 21 ? Math.min(anchorH + 2, 23.5) : anchorH - 1
    }
    base.activity = Math.min(base.activity, base.food - 2)
  }

  // Minimiväli edellisestä vaiheesta roolin mukaan (sauna ~2h, ruoka ~1.5h…)
  const GAP: Record<CandidateRole, number> = { activity: 2, food: 1.5, drinks: 1, program: 2 }
  // Aukiolotietoinen aikataulutus: ravintolat/aktiviteetit, joilla on
  // opening_hours-data, sovitetaan päivän aukioloaikoihin (esim. ei saunaa
  // klo 21 jos se sulkeutuu 20). Session todellinen päivä ratkaisee viikonpäivän.
  const arcDay = opts.date ? new Date(`${opts.date}T12:00:00`) : null
  const timed: { c: Candidate; h: number }[] = []
  let prevH: number | null = null
  let prevRole: CandidateRole | null = null
  for (const c of picked) {
    const realH = parseHour(c.time)
    let h = realH ?? base[c.role]
    if (realH == null && prevH != null && prevRole != null) {
      // Väli = roolin kesto + KÄVELYAIKA edellisestä paikasta — kaaren ajat
      // eivät voi olla ristiriidassa siirtymien kanssa.
      const prevC = timed[timed.length - 1]?.c
      const travelH = prevC ? (walkMinutesBetween(prevC, c) ?? 0) / 60 : 0
      h = Math.max(h, prevH + GAP[prevRole] + travelH)
    }
    if (realH == null && c.openingHours && arcDay) {
      const minDur = c.role === 'food' || c.role === 'activity' ? 1.25 : 1
      const clamped = clampToOpenHour(c.openingHours, arcDay, h, minDur)
      if (clamped != null) h = clamped
      // kiinni koko päivän → pidä oletus (ei parempaakaan vaihtoehtoa)
    }
    h = Math.min(h, 23.5)
    timed.push({ c, h })
    prevH = h
    prevRole = c.role
  }
  // Kronologinen loppujärjestys — kaari seuraa aina kelloa, ei roolipohjaa
  timed.sort((a, b) => a.h - b.h)

  const fmtHour = (h: number): string =>
    h % 1 >= 0.5 ? `klo ${Math.floor(h)}.30` : `klo ${Math.floor(h)}`

  // 6. Vaiheet + faktat + kävelyajat
  const steps: PlanStep[] = timed.map(({ c, h }) =>
    candidateToStep(c, whyFor(c, superIds.has(c.id)), c.time || fmtHour(h), superIds.has(c.id)),
  )
  withTravelTimes(steps)

  const first = timed[0].c.title
  const last = timed[timed.length - 1].c.title
  const intro = picked.length === 1
    ? `Teidän valintanne: ${first}.`
    : `Teidän ${WHEN_TEXT[opts.when]}: ${first} → ${last}. ${picked.length} vaihetta porukan tykätyistä.`

  return {
    kind: 'arc',
    engine: 'rules',
    variant,
    date: opts.date,
    intro,
    arc: steps,
    outro: 'Hyvää menoa — nauttikaa! 🎉',
  }
}
