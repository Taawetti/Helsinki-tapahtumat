// Ryhmäpäätöskoneen jaetut tyypit + apurit (client + server).
import type { Candidate, GroupWhen, Fiilis } from '@/lib/candidate'

export type GroupStatus = 'open' | 'synthesizing' | 'done'

// Palvelimen palauttama sessiotila klientille (/api/group/[code] GET).
export interface GroupSession {
  code: string
  when: GroupWhen
  fiilis: Fiilis[]
  candidates: Candidate[]
  status: GroupStatus
  resultPlan: GroupPlan | null
  hostId: string | null
  participants: { id: string; name: string }[]
  // Per-kortti ❤️/✕-laskurit (card_id → { love, skip })
  votes: Record<string, { love: number; skip: number }>
  voteCount: number
}

// AI:n kutoma illan kaari (result_plan).
export interface GroupPlan {
  intro: string
  arc: { role: string; emoji: string; title: string; time?: string; why: string; cardId?: string }[]
  outro?: string
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // ei sekoittavia (0/O, 1/I/L)
export function genCode(len = 4): string {
  let s = ''
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return s
}

// Aggregoi raa'at äänet per-kortti-laskureiksi + osallistujalistaksi.
export function aggregateVotes(
  rows: { voter_id: string; voter_name: string | null; card_id: string; vote: string }[],
): { votes: Record<string, { love: number; skip: number }>; participants: { id: string; name: string }[]; voteCount: number } {
  const votes: Record<string, { love: number; skip: number }> = {}
  const seenVoter = new Map<string, string>()
  for (const r of rows) {
    const v = (votes[r.card_id] ??= { love: 0, skip: 0 })
    if (r.vote === 'love') v.love++
    else v.skip++
    if (!seenVoter.has(r.voter_id)) seenVoter.set(r.voter_id, r.voter_name || 'Nimetön')
  }
  return {
    votes,
    participants: [...seenVoter.entries()].map(([id, name]) => ({ id, name })),
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
