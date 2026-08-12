// Demo-kaaren rakentelu etusivun "katso miltä näyttää" -kortille: oikeasta
// tämän illan datasta kudottu esimerkkikaari ILMAN sessiota. Käyttää samaa
// luottamusmoottoria kuin oikeat kaaret (group-scheduler) — demo ei koskaan
// valehtele aikatauluja enempää kuin oikea kaari.
import { buildGroupDeck } from '@/lib/group-deck'
import { buildDeterministicArc } from '@/lib/group-arc'
import type { Candidate, CandidateRole } from '@/lib/candidate'
import type { GroupArcPlan } from '@/lib/group'
import { helsinkiNow, helsinkiToday } from '@/lib/helsinki-time'

const ROLE_PRIORITY: CandidateRole[] = ['activity', 'food', 'drinks', 'program']

/** Poimii pakan parhaan kortin per rooli pisteyksen mukaan. */
function topPerRole(deck: Candidate[]): Candidate[] {
  const best = new Map<CandidateRole, Candidate>()
  for (const c of deck) {
    const cur = best.get(c.role)
    if (!cur || c._score > cur._score) best.set(c.role, c)
  }
  return ROLE_PRIORITY.map(r => best.get(r)).filter((c): c is Candidate => Boolean(c))
}

/** Rakentaa demo-kaaren nykyillan datasta. Palauttaa null jos data on
 *  liian heikkoa — kutsuja näyttää silloin ei-esimerkkiä (ei virhettä). */
export async function buildDemoArc(origin: string): Promise<GroupArcPlan | null> {
  const today = helsinkiToday()
  const now = helsinkiNow()
  const nowH = now.getHours() + now.getMinutes() / 60

  // Kevyt pakka: pelkkä tonight-ilman scenejä — nopea (kaikki rinnakkain,
  // reitti välimuistitetaan ylempänä).
  const deck = await buildGroupDeck(origin, 'tonight', [], {}).catch(() => [] as Candidate[])
  if (deck.length < 3) return null

  const loved = topPerRole(deck)
  if (loved.length < 2) return null

  // Nollapisteet riittävät: valinta on jo tehty topPerRole:ssä, moottori
  // huolehtii aikataulusta (nowH → ei menneitä aikoja).
  const votes: Record<string, { love: number; skip: number }> = {}
  return buildDeterministicArc(loved, votes, new Set(), { when: 'tonight', date: today, nowH })
}
