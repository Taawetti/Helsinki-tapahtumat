// Idea-näkymän pakkamoottori — PUHDAS, fixture-testattava (scripts/test-categories.ts).
//
// Korvaa IdeaView.tsx:n aiemman logiikan (8/2026 uudistus):
//  - käsin kuratoitu 13 klassikkoa POIS (Tuomiokirkko & co joka päivä — asiakas
//    huomasi toiston; ne kuuluvat Tekemistä-välilehteen)
//  - kohderyhmäsuodatus: vauva-/perhetapahtumat (lapset) pois OLETUKSENA,
//    seniori-painotteiset (klassinen, lukupiirit) vahva alaskuopaus
//  - makumuisti (recordClick-historia) + cold-start-scenet painottavat
//  - siemen-jitteri: sama päivä+laite = sama pakka, uusi päivä = uusi
import type { Event } from './types'
import { getEventVibes } from './event-classify'
import { helsinkiDateOf } from './helsinki-time'
import { COMMUNITY_DAYTIME_REGEX } from './nightlife'
import { seedRand } from './seed-rand'

export type IdeaAudience = 'default' | 'perhe'

// Vauva/perhe-sisältö: pois oletuksena, perhe-valinnalla mukaan.
const FAMILY_VIBES = ['lapset']

// Seniori-painotteiset: alaskuopaus (ei poissulkua — kulttuuri-scenen valitsija
// haluaa klassistakin, joten rangaistus ohitetaan silloin).
const SENIOR_SKEW_VIBES = ['klassinen']
const SENIOR_SKEW_KEYWORDS = ['lukupiiri', 'seniori', 'vanhusten', 'päiväkahvit', 'ikäihmis']

// Cold-start-scenet → mitä painotetaan (vibes + kategoriasanat)
export interface IdeaSceneGroup { vibes: string[]; cats: string[] }
export const IDEA_SCENES: Record<'keikka' | 'rento' | 'liikunta' | 'kulttuuri', IdeaSceneGroup> = {
  keikka:    { vibes: ['keikka'], cats: ['musiikki', 'konsertti', 'klubi', 'live'] },
  rento:     { vibes: ['yoelama', 'baari', 'underground'], cats: ['baari', 'klubi', 'ravintolat'] },
  liikunta:  { vibes: ['urheilu'], cats: ['urheilu', 'liikunta'] },
  kulttuuri: { vibes: ['teatteri', 'taide', 'klassinen'], cats: ['teatteri', 'taide', 'näyttely', 'museo', 'ooppera', 'sinfonia'] },
}
export type IdeaSceneId = keyof typeof IDEA_SCENES

export function audienceOk(e: Event, audience: IdeaAudience): boolean {
  if (audience === 'perhe') return true
  return !getEventVibes(e).some(v => FAMILY_VIBES.includes(v))
}

export function seniorSkew(e: Event): boolean {
  if (getEventVibes(e).some(v => SENIOR_SKEW_VIBES.includes(v))) return true
  const hay = `${e.title} ${e.categories.join(' ')}`.toLowerCase()
  return SENIOR_SKEW_KEYWORDS.some(s => hay.includes(s))
}

function sceneMatch(e: Event, scenes: IdeaSceneId[]): IdeaSceneId | null {
  if (!scenes.length) return null
  const vibes = getEventVibes(e)
  const cats = e.categories.map(c => c.toLowerCase())
  for (const s of scenes) {
    const g = IDEA_SCENES[s]
    if (vibes.some(v => g.vibes.includes(v)) || cats.some(c => g.cats.some(gc => c.includes(gc)))) return s
  }
  return null
}

export function minutesUntilStart(startTime: string, nowMs: number): number {
  return Math.round((new Date(startTime).getTime() - nowMs) / 60000)
}

export interface IdeaPrefs {
  scenes?: IdeaSceneId[]               // cold-start-valinnat
  categoryScores?: Record<string, number> // makumuisti (recordClick-historia)
  demoted?: string[]                   // "ei tällaista" (vibe/kategoria, lowercase)
  audience?: IdeaAudience              // 'perhe' = perhetapahtumat mukaan
}

export interface IdeaScored {
  event: Event
  score: number
  minutesUntil?: number
  reason: string | null
}

export interface IdeaDeckOpts extends IdeaPrefs {
  seed: string        // `${today}-${deviceId}` → sama päivä+laite = sama pakka
  size?: number
  nowMs?: number      // injektoitava testeissä
  today?: string      // injektoitava testeissä (YYYY-MM-DD)
}

function baseScore(e: Event, nowMs: number): number {
  let s = 0
  if (e.image) s += 3
  const desc = e.shortDescription || e.description || ''
  if (desc.length > 80) s += 2
  else if (desc.length > 15) s += 1
  if (e.isFree) s += 1
  const d = new Date(e.startTime)
  const now = new Date(nowMs)
  if (d.toDateString() === now.toDateString() && d.getHours() >= 17) s += 1
  return s
}

const SCENE_REASON: Record<IdeaSceneId, string> = {
  keikka: 'Valitsit keikat — tämä on sinua varten',
  rento: 'Rento ilta — valintasi mukaan',
  liikunta: 'Liikunnallista tekemistä — valintasi mukaan',
  kulttuuri: 'Kulttuuriasiaa — valintasi mukaan',
}

/** Luo Idea-pakan: vain TÄMÄN päivän tapahtumat (ei päättyneitä), kohderyhmä-
 *  suodatus, makumuisti+scenet+seniori-painotus, siemen-jitteri, bandit-järjestys
 *  (pian alkavat kärkeen). Paluutyyppi kertoo myös selitteen kortille. */
export function buildIdeaDeck(events: Event[], opts: IdeaDeckOpts): IdeaScored[] {
  const size = opts.size ?? 50
  const nowMs = opts.nowMs ?? Date.now()
  const today = opts.today ?? helsinkiDateOf(new Date(nowMs).toISOString())
  const rand = seedRand(opts.seed)
  const scenes = opts.scenes ?? []
  const catScores = opts.categoryScores ?? {}
  const demoted = new Set((opts.demoted ?? []).map(d => d.toLowerCase()))
  const audience = opts.audience ?? 'default'

  return events
    // Vain tänään + ei päättyneitä (3 h käynnissä-sääntö, sama kuin ennen)
    .filter(e => {
      if (helsinkiDateOf(e.startTime) !== today) return false
      const startTs = new Date(e.startTime).getTime()
      if (startTs > nowMs) return true
      if (e.endTime) return new Date(e.endTime).getTime() >= nowMs
      return nowMs - startTs < 3 * 60 * 60 * 1000
    })
    .filter(e => audienceOk(e, audience))
    .filter(e => (e.shortDescription?.length ?? 0) > 15 || (e.description?.length ?? 0) > 15)
    .map(e => {
      const vibes = getEventVibes(e)
      const cats = e.categories.map(c => c.toLowerCase())
      let s = baseScore(e, nowMs)

      // Makumuisti: aiempi tykkääminen kategorian mukaan
      const taste = cats.reduce((acc, c) => acc + (catScores[c] ?? 0), 0)
      const hasTaste = taste > 0.5
      if (hasTaste) s += Math.min(taste, 3) * 1.5

      // Cold-start-scene: osuva scene nostaa selvästi (+2.5)
      const scene = sceneMatch(e, scenes)
      if (scene) s += 2.5

      // Seniori-painotus: alaskuopaus PAITSI jos käyttäjä valitsi kulttuuri-scenen
      const senior = seniorSkew(e) && !scenes.includes('kulttuuri')
      if (senior) s -= 3

      // Yhteisötalojen/leikkipuistojen päiväohjelma: alaskuopaus oletuksena
      // (mitattu 24.8.: maanantain kaupunkiohjelma valtasi pakan kärjen).
      // Perhe-yleisölle nämä ovat juuri oikeaa sisältöä → ei sakkoa.
      if (audience !== 'perhe' && COMMUNITY_DAYTIME_REGEX.test(`${e.title} ${e.shortDescription ?? ''}`)) s -= 3

      // "Ei tällaista" -demotiot (vibe tai kategoria osuu demotoituun)
      const isDemoted = vibes.some(v => demoted.has(v)) || cats.some(c => demoted.has(c))
      if (isDemoted) s -= 4

      // Siemen-jitteri ±8 % (deterministinen: sama päivä+laite = sama pakka)
      s *= 0.92 + rand() * 0.16

      const mins = minutesUntilStart(e.startTime, nowMs)

      // Selite kortille — rehellisin signaali ensisijaisena
      let reason: string | null = null
      if (hasTaste) reason = 'Sopii makuusi aiempien valintojesi perusteella'
      else if (scene) reason = SCENE_REASON[scene]
      else if (mins >= 0 && mins <= 90) reason = 'Alkaa pian'
      else if (e.isFree) reason = 'Ilmainen'

      return { event: e, score: s, minutesUntil: mins >= 0 ? mins : undefined, reason }
    })
    // Bandit: pian (≤3 h) alkavat kärkeen, sitten muut; kaistan sisällä pisteet
    .sort((a, b) => {
      const bandA = a.minutesUntil !== undefined && a.minutesUntil <= 180 ? 0 : 1
      const bandB = b.minutesUntil !== undefined && b.minutesUntil <= 180 ? 0 : 1
      return bandA - bandB || b.score - a.score
    })
    .slice(0, size)
}
