// "Arvo valmis ilta" — yhden painalluksen ilta-arvonta (Idea-välilehti).
// Ryhmäpäätöskoneen seuraaja: SAMA testattu kaarimoottori (buildDeterministicArc
// + scheduleSteps: aukiolot suunnitellulle päivälle, oikeat tapahtuma-ajat
// ankkureina, kävelyajat, yön raja 23.30, null kun iltaa ei voi toteuttaa),
// mutta ILMAN sessioita, linkkejä ja äänestystä — tulos heti.
//
// Deterministisyys: siemen = kaava+päivä+variantti → sama arvonta antaa saman
// illan ja "arvo uudelleen" (variant+1) uuden. Pysäkin uudelleenarvonta
// (excludeIds) vaihtaa sen pysäkin; SEURAAVAT pysäkit voivat sopeutua uuteen
// sijaintiin (reittioptimointi valitsee esim. baarin uuden ravintolan
// läheltä — testin 8 lukitsema käytös). Pakka itsessään on vakaa:
// korttikohtainen hash-jitter (lib/candidate.ts), ei jaettua rand-jonoa.

import { NextRequest, NextResponse } from 'next/server'
import { buildGroupDeck } from '@/lib/group-deck'
import { buildDeterministicArc, withTravelTimes } from '@/lib/group-arc'
import { resolveArcTarget, type ArvoWhen } from '@/lib/arvo-ilta'
import type { GroupArcPlan } from '@/lib/group'

export const maxDuration = 60

const VALID_WHEN: ArvoWhen[] = ['tonight', 'day', 'weekend']
const VALID_BUDGET = ['any', 'free', 'e', 'ee']

export async function POST(req: NextRequest) {
  let body: {
    scenes?: unknown; when?: unknown; budget?: unknown
    maxSteps?: unknown; variant?: unknown; excludeIds?: unknown; formulaId?: unknown; date?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  const scenes = Array.isArray(body.scenes)
    ? body.scenes.filter((s): s is string => typeof s === 'string' && s.length <= 20).slice(0, 5)
    : []
  if (scenes.length === 0) return NextResponse.json({ error: 'scenes required' }, { status: 400 })
  const when = VALID_WHEN.includes(body.when as ArvoWhen) ? (body.when as ArvoWhen) : 'tonight'
  const budget = VALID_BUDGET.includes(body.budget as string) ? (body.budget as 'any' | 'free' | 'e' | 'ee') : 'any'
  const maxSteps = Math.min(4, Math.max(2, Math.trunc(Number(body.maxSteps)) || 3))
  // Kokonaisluku pakolla: murtoluku-variant indeksoisi roolijonoa ohi ja
  // kaataisi moottorin (mitattu vastakkaistarkastuksessa).
  const variant = Math.min(30, Math.max(0, Math.trunc(Number(body.variant)) || 0))
  const excludeIds = Array.isArray(body.excludeIds)
    ? new Set(body.excludeIds.filter((x): x is string => typeof x === 'string').slice(-40))
    : undefined
  const formulaId = typeof body.formulaId === 'string' ? body.formulaId.slice(0, 30) : 'oma'

  const target = resolveArcTarget(when, new Date())
  // Pysäkin uudelleenarvonta lähettää näkyvän suunnitelman päivän — sama
  // siemen ja sama päivä silloinkin, kun kello on ehtinyt yli keskiyön
  // ensimmäisen arvonnan jälkeen. Muuten yksi nopanpainallus vaihtaisi
  // hiljaa koko illan seuraavalle päivälle.
  if (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    const clock = resolveArcTarget('tonight', new Date())   // Helsinki-tänään + kello
    const span = (new Date(`${body.date}T12:00:00Z`).getTime() - new Date(`${clock.date}T12:00:00Z`).getTime()) / 86_400_000
    if (span >= 0 && span <= 14) {
      target.date = body.date
      target.nowH = body.date === clock.date ? clock.nowH : undefined
      target.fallbackDate = undefined
    }
  }
  const origin = req.nextUrl.origin

  // Siemen sitoo pakan kaavaan+päivään+varianttiin — EI kellonaikaan, jotta
  // pysäkin uudelleenarvonta (sama variant, excludeIds) pitää muut ennallaan.
  const seed = `arvo-${formulaId}-${target.date}-${variant}`
  const deck = await buildGroupDeck(origin, target.when, scenes, { budget, excludeIds, seed })
  if (deck.length === 0) {
    return NextResponse.json({ plan: null, date: target.date, reason: 'empty-deck' })
  }

  // Ei ääniä: roolijonot järjestyvät puhtaalla pakkalaadulla (_score).
  const tryDay = (date: string, nowH: number | undefined): GroupArcPlan | null =>
    buildDeterministicArc(deck, {}, new Set(), { when: target.when, variant, date, nowH, maxSteps })

  let date = target.date
  let plan = tryDay(date, target.nowH)

  // Lauantai-ilta liian pitkällä → kokeile sunnuntaita (tuleva päivä, ei nowH).
  if (!plan && target.fallbackDate) {
    date = target.fallbackDate
    plan = tryDay(date, undefined)
  }

  if (plan) {
    withTravelTimes(plan.arc)
    // Moottorin intro/outro on kirjoitettu ryhmälle ("porukan tykätyistä") —
    // soolokäytössä ne korvataan neutraalilla nimiketjulla.
    plan.intro = plan.arc.map((s) => s.title).join(' → ')
    plan.outro = undefined
  }

  // 'too-late' vain kun kello oli AINOA kokeiltu rajoite — jos su-fallback
  // ajettiin ilman kelloa ja sekin epäonnistui, syy oli data, ei kello.
  const lateWasOnlyReason = target.nowH !== undefined && target.nowH >= 20.5 && !target.fallbackDate
  return NextResponse.json({
    plan,
    date,
    reason: plan ? null : (lateWasOnlyReason ? 'too-late' : 'no-arc'),
  })
}
