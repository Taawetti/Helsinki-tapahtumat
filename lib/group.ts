// Ryhmäpäätöskoneen jaetut tyypit + apurit (client + server).
import type { Candidate, GroupWhen, Fiilis, CandidateRole } from '@/lib/candidate'

export type GroupStatus = 'open' | 'synthesizing' | 'done'
// 'arc' = AI kutoo illan kaaren tykätyistä · 'quick' = ensimmäinen
// enemmistön ❤️ saanut kortti voittaa heti.
export type GroupMode = 'arc' | 'quick'

// Palvelimen palauttama sessiotila klientille (/api/group/[code] GET).
export interface GroupSession {
  code: string
  when: GroupWhen
  fiilis: Fiilis[]
  mode: GroupMode
  round: number                    // kasvaa rematchissa → klientit nollaavat paikallisen äänestysmuistin
  candidates: Candidate[]
  deckSize: number                 // = candidates.length (selkeys koodissa)
  status: GroupStatus
  resultPlan: GroupResult | null
  hostId: string | null
  participants: { id: string; name: string; swiped: number; done: boolean }[]
  // Per-kortti ❤️/✕-laskurit (card_id → { love, skip })
  votes: Record<string, { love: number; skip: number }>
  voteCount: number
}

// ── Tulokset ──────────────────────────────────────────────────────────────

// Yksi kaaren vaihe. Server GROUNDAA faktat (title/address/url/image/lat/lon)
// session candidates-snapshotista cardId:n perusteella — AI kirjoittaa vain
// järjestyksen ja perustelut, joten hallusinoituja paikkoja/linkkejä ei pääse tulokseen.
export interface PlanStep {
  cardId?: string
  role: string
  emoji: string
  title: string
  time?: string
  why: string
  // Groundatut faktat (jos cardId tunnistettiin):
  address?: string
  url?: string
  image?: string | null
  lat?: number
  lon?: number
  rating?: number
  badge?: string
  isFree?: boolean
  priceLevel?: number
  superMatch?: boolean             // kaikki osallistujat tykkäsivät
  travelFromPrevMin?: number       // kävelyaika edellisestä vaiheesta (haversine)
}

export interface GroupArcPlan {
  kind: 'arc'
  engine?: 'ai' | 'rules'      // 'rules' = deterministinen (0 €), 'ai' = Claude
  variant?: number             // deterministisen kiertovariantti ("kudo uudelleen")
  intro: string
  arc: PlanStep[]
  outro?: string
}

export interface GroupQuickPlan {
  kind: 'quick'
  cardId: string
  title: string                    // groundattu
  intro: string                    // esim. "Enemmistö valitsi — päätös tehty!"
  // Groundatut voittajakortin faktat:
  emoji?: string
  role?: string
  image?: string | null
  address?: string
  url?: string
  time?: string
  rating?: number
  badge?: string
  isFree?: boolean
  lat?: number
  lon?: number
  votesFor?: number
  voterCount?: number
}

export type GroupResult = GroupArcPlan | GroupQuickPlan

// Vanha tyyppialias (AI-synteesin välimuoto parse-vaiheessa).
export type GroupPlan = GroupArcPlan

// PIKAPÄÄTÖKSEN tulos groundattuna voittajakortista (faktat kannasta, ei arvailua).
export function quickPlanFromCandidate(c: Candidate, votesFor: number, voterCount: number): GroupQuickPlan {
  return {
    kind: 'quick',
    cardId: c.id,
    title: c.title,
    intro: 'Enemmistö valitsi — päätös tehty! 🎉',
    emoji: c.emoji,
    role: c.role,
    image: c.image,
    address: c.address,
    url: c.url,
    time: c.time,
    rating: c.rating,
    badge: c.badge,
    isFree: c.isFree,
    lat: c.lat,
    lon: c.lon,
    votesFor,
    voterCount,
  }
}

// ── Näyttölabelit (client) ────────────────────────────────────────────────

export const GROUP_WHEN_LABELS: Record<GroupWhen, { emoji: string; label: string }> = {
  tonight: { emoji: '🌙', label: 'Tänä iltana' },
  day:     { emoji: '☀️', label: 'Koko päivä' },
  weekend: { emoji: '🗓', label: 'Viikonloppu' },
}
export const FIILIS_LABELS: Record<Fiilis, { emoji: string; label: string }> = {
  menoa:     { emoji: '🔥', label: 'Menoa' },
  rento:     { emoji: '😌', label: 'Rento' },
  kulttuuri: { emoji: '🎭', label: 'Kulttuuri' },
  ulkoilu:   { emoji: '🌲', label: 'Ulkoilu' },
  ruoka:     { emoji: '🍽', label: 'Ruoka' },
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // ei sekoittavia (0/O, 1/I/L)
export function genCode(len = 4): string {
  let s = ''
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return s
}

// Aggregoi raa'at äänet per-kortti-laskureiksi + osallistujalistaksi edistymineen.
export function aggregateVotes(
  rows: { voter_id: string; voter_name: string | null; card_id: string; vote: string }[],
  deckSize = 0,
): {
  votes: Record<string, { love: number; skip: number }>
  participants: { id: string; name: string; swiped: number; done: boolean }[]
  voteCount: number
} {
  const votes: Record<string, { love: number; skip: number }> = {}
  const seenVoter = new Map<string, { name: string; swiped: number }>()
  for (const r of rows) {
    const v = (votes[r.card_id] ??= { love: 0, skip: 0 })
    if (r.vote === 'love') v.love++
    else v.skip++
    const cur = seenVoter.get(r.voter_id) ?? { name: r.voter_name || 'Nimetön', swiped: 0 }
    cur.swiped++
    if (r.voter_name) cur.name = r.voter_name
    seenVoter.set(r.voter_id, cur)
  }
  return {
    votes,
    participants: [...seenVoter.entries()].map(([id, p]) => ({
      id,
      name: p.name,
      swiped: p.swiped,
      done: deckSize > 0 && p.swiped >= deckSize,
    })),
    voteCount: rows.length,
  }
}

// ❤️-kortit synteesiä varten: kortit joilla vähintään yksi 'love' eikä enemmistö 'skip'.
export function lovedCards(candidates: Candidate[], votes: Record<string, { love: number; skip: number }>): Candidate[] {
  return candidates.filter(c => {
    const v = votes[c.id]
    return v && v.love > 0 && v.love >= v.skip
  })
}

// TÄYSOSUMA: kortit joita KAIKKI osallistujat (≥2) ovat äänestäneet eikä
// kukaan skipannut. Näistä tulee kaaren ankkureita + 🎉-merkki UI:ssa.
export function superMatchIds(
  votes: Record<string, { love: number; skip: number }>,
  participantCount: number,
): Set<string> {
  const out = new Set<string>()
  if (participantCount < 2) return out
  for (const [cardId, v] of Object.entries(votes)) {
    if (v.love === participantCount && v.skip === 0) out.add(cardId)
  }
  return out
}

// PIKAPÄÄTÖS: ensimmäinen kortti (pakka-järjestyksessä) jolla on tiukka
// enemmistö nykyäänestäjistä. Yhden äänestäjän sessiossa ensimmäinen ❤️ riittää.
export function majorityWinner(
  candidates: Candidate[],
  votes: Record<string, { love: number; skip: number }>,
  participantCount: number,
): Candidate | null {
  const needed = participantCount <= 1 ? 1 : Math.floor(participantCount / 2) + 1
  for (const c of candidates) {
    const v = votes[c.id]
    if (v && v.love >= needed) return c
  }
  return null
}

// ── Etäisyys ──────────────────────────────────────────────────────────────

// Haversine-metrit kahden pisteen välillä.
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Kävelyaika minuutteina: linnuntie × 1.3 (katuverkko) / 5 km/h.
// Palauttaa undefined jos pisteet puuttuvat tai ovat käytännössä samat.
export function walkMinutesBetween(
  a: { lat?: number; lon?: number },
  b: { lat?: number; lon?: number },
): number | undefined {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return undefined
  const m = haversineMeters(a.lat, a.lon, b.lat, b.lon)
  if (m < 150) return undefined // sama kortteli — ei erillistä siirtymää
  return Math.max(1, Math.round(((m * 1.3) / 5000) * 60))
}

// ROLE_META-label tyyppiturvallisena kaaren vaiheille (tuntematon rooli → fallback).
import { ROLE_META } from '@/lib/candidate'
export function roleLabel(role: string): { emoji: string; label: string } {
  return ROLE_META[role as CandidateRole] ?? { emoji: '✨', label: 'Vaihe' }
}
