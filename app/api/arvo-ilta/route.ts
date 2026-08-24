// "Arvo valmis ilta" — palikoista koottu ilta (Idea-välilehti).
// TIUKKA LUPAUS (omistaja 24.8.2026: "keikan pitää olla keikka, baarin
// baari, ravintolan ravintola"): jokainen valittu palikka on tasan yksi
// sen tyyppinen pysäkki suunnitelmassa. Valinta tehdään buildSceneArcilla
// (palikka → pysäkki), EI roolimoottorin geneerisellä roolijonolla — se
// tuotti "Baarit-palikasta" saunan ja ravintolan (mitattu vika).
// Aikataulutus on sama testattu luottamusmoottori: aukiolot suunnitellulle
// päivälle, tapahtumien oikeat ajat ankkureina, kulkuajat, yön raja 23.30,
// ja rehellinen null + puuttuvan palikan nimi kun iltaa ei voi toteuttaa.
//
// Deterministisyys: siemen = palikat+päivä+variantti → sama arvonta antaa
// saman illan ja "arvo uudelleen" (variant+1) uuden. Pysäkin uudelleen-
// arvonta (excludeIds) vaihtaa sen pysäkin; pakka on korttikohtaisen
// hash-jitterin ansiosta vakaa (lib/candidate.ts), ei jaettua rand-jonoa.

import { NextRequest, NextResponse } from 'next/server'
import { buildGroupDeck } from '@/lib/group-deck'
import { buildSceneArc } from '@/lib/group-arc'
import { resolveArcTarget, type ArvoWhen } from '@/lib/arvo-ilta'
import type { SceneId } from '@/lib/candidate'

export const maxDuration = 60

const VALID_WHEN: ArvoWhen[] = ['tonight', 'day', 'weekend']
// Palikkoina kelpaavat vain tyypit joille on tiukka vastine pakassa.
// 'perhe' poistettu (omistaja: ei oleteta mitä perhe haluaa), 'ilmaista'
// ei ole pysäkki vaan budjettirajaus (budget: 'free').
const VALID_SLOTS: SceneId[] = ['ruoka', 'keikka', 'kulttuuri', 'sauna', 'baarit', 'ulkona']
const VALID_BUDGET = ['any', 'free', 'e', 'ee']

export async function POST(req: NextRequest) {
  let body: {
    scenes?: unknown; when?: unknown; budget?: unknown
    variant?: unknown; excludeIds?: unknown; date?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  const scenes = Array.isArray(body.scenes)
    ? [...new Set(body.scenes.filter((s): s is SceneId => VALID_SLOTS.includes(s as SceneId)))].slice(0, 4)
    : []
  if (scenes.length === 0) return NextResponse.json({ error: 'scenes required' }, { status: 400 })
  const when = VALID_WHEN.includes(body.when as ArvoWhen) ? (body.when as ArvoWhen) : 'tonight'
  const budget = VALID_BUDGET.includes(body.budget as string) ? (body.budget as 'any' | 'free' | 'e' | 'ee') : 'any'
  // Kokonaisluku pakolla: murtoluku-variant indeksoisi ehdokaslistaa ohi ja
  // kaataisi moottorin (mitattu vastakkaistarkastuksessa).
  const variant = Math.min(30, Math.max(0, Math.trunc(Number(body.variant)) || 0))
  const excludeIds = Array.isArray(body.excludeIds)
    ? new Set(body.excludeIds.filter((x): x is string => typeof x === 'string').slice(-40))
    : undefined

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

  // Siemen sitoo pakan palikoihin+päivään+varianttiin — EI kellonaikaan,
  // jotta pysäkin uudelleenarvonta (sama variant, excludeIds) pitää muut
  // ennallaan. Isompi pakka (40): tiukat palikkasuodattimet tarvitsevat
  // vaihtoehtoja korjaussilmukalle.
  const seed = `arvo-${[...scenes].sort().join('-')}-${target.date}-${variant}`
  const deck = await buildGroupDeck(origin, target.when, scenes, { budget, excludeIds, seed, size: 40 })
  if (deck.length === 0) {
    return NextResponse.json({ plan: null, date: target.date, reason: 'empty-deck', missing: [] })
  }

  const tryDay = (date: string, nowH: number | undefined) =>
    buildSceneArc(deck, scenes, { when: target.when, variant, date, nowH })

  let date = target.date
  let result = tryDay(date, target.nowH)

  // Lauantai-ilta liian pitkällä → kokeile sunnuntaita (tuleva päivä, ei nowH).
  if (!result.plan && target.fallbackDate) {
    date = target.fallbackDate
    result = tryDay(date, undefined)
  }

  // 'too-late' vain kun kello oli AINOA kokeiltu rajoite — jos su-fallback
  // ajettiin ilman kelloa ja sekin epäonnistui, syy oli data, ei kello.
  const lateWasOnlyReason = target.nowH !== undefined && target.nowH >= 20.5 && !target.fallbackDate
  return NextResponse.json({
    plan: result.plan,
    date,
    reason: result.plan ? null : (result.missing.length > 0 ? 'missing-scenes' : lateWasOnlyReason ? 'too-late' : 'no-arc'),
    missing: result.missing,
  })
}
