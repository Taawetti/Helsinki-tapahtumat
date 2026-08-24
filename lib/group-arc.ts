// Illan kaaren generointi ILMAN AI:ta — oletusmoottori (0 €, välitön, ei koskaan
// alhaalla). AI-polku on säilytetty synthesize-reitissä valinnaisena tehosteena
// (GROUP_AI_MODE=anthropic).
//
// Periaate: faktat tulevat aina candidates-snapshotista (groundaus). Valinta on
// TIUKKA (max 1 per rooli + max 1 per alatyyppi, kiinni olevat karsitaan) ja
// aikataulutus tehdään lib/group-scheduler.ts:n kovin rajoittein (kesto +
// kulkuaika + puskuri, aukiolot, ei menneitä aikoja).
import type { Candidate, GroupWhen, CandidateRole, SceneId } from '@/lib/candidate'
import type { GroupArcPlan, PlanStep } from '@/lib/group'
import { walkMinutesBetween } from '@/lib/group'
import {
  ROLE_ORDER,
  closedOnArcDay,
  optimizeForTravel,
  parseHour,
  scheduleSteps,
  subtypeOf,
  totalTravelMin,
  type ScheduleOpts,
  type TimedStep,
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
    case 'activity': return 'Mukava avaus, joka virittää illan tunnelmaan.'
    case 'food': return 'Illan ankkuri — hyvä ruoka kantaa pitkälle.'
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

// ── Palikkakaari (Arvo valmis ilta) ────────────────────────────────────────
// TIUKKA LUPAUS: palikka = pysäkki. "Baarit" ei koskaan tuota saunaa eikä
// ravintolaa — roolimoottorin geneerinen ROLE_ORDER-valinta (alla) EI päde
// tähän polkuun. (Mitattu vika 24.8.2026: pelkkä Baarit-palikka antoi
// Löylyn + ravintolan, koska roolit valittiin ROLE_ORDER-listasta eikä
// käyttäjän palikoista. Omistaja: "keikan pitää olla keikka, baarin baari,
// ravintolan ravintola".)

// Illan kanoninen palikkajärjestys aikatauluttajan syötteeksi (stabiili sort
// säilyttää saman roolin sisäisen järjestyksen — kaksi activity-palikkaa
// aikataulutetaan tässä järjestyksessä).
export const SCENE_SLOT_ORDER: SceneId[] = ['ulkona', 'kulttuuri', 'sauna', 'ruoka', 'keikka', 'baarit']

const sceneTag = (c: Candidate, wanted: string[]) => !!c.tags && wanted.some(t => c.tags!.includes(t))

// Mihin kortteihin kukin palikka saa osua. Tagit: ravintoloilla r.type,
// aktiviteeteilla a.category, tapahtumilla vibes (lib/candidate.ts).
// Kahvila EI kelpaa Ruoka-palikkaan (illallislupaus), geneerinen yökerho-
// venue EI kelpaa Keikka-palikkaan (ei nimettyä keikkaa → ei lupausta siitä
// mitä siellä sinä iltana on) — vain oikeat tapahtumat kelpaavat.
export const SCENE_MATCH: Partial<Record<SceneId, (c: Candidate) => boolean>> = {
  ruoka:     c => c.type === 'restaurant' && c.role === 'food' && sceneTag(c, ['ravintola']),
  baarit:    c => c.type === 'restaurant' && c.role === 'drinks',
  sauna:     c => c.type === 'activity' && sceneTag(c, ['sauna']),
  ulkona:    c => c.type === 'activity' && sceneTag(c, ['uimaranta', 'puisto', 'nakopaikka', 'nahtavyys']),
  kulttuuri: c =>
    (c.type === 'activity' && sceneTag(c, ['museo', 'galleria'])) ||
    (c.type === 'event' && sceneTag(c, ['teatteri', 'taide', 'museo', 'klassinen', 'standup'])),
  // Keikka on musiikki EDELLÄ: teatteri-viben kantava sekaesitys (tanssi-
  // esitykset, puhetilaisuudet musiikkiesityksin — mitattu: "United for
  // Ukraine" sai keikka-viben LinkedEventsin 'musiikki'-kategoriatokenista)
  // kuuluu Kulttuuri-palikkaan, ei keikaksi.
  keikka:    c => c.type === 'event' && sceneTag(c, ['keikka', 'yoelama', 'underground', 'klassinen']) && !sceneTag(c, ['teatteri']),
}

export interface SceneArcResult {
  plan: GroupArcPlan | null
  /** Palikat joille ei löytynyt toteutettavaa pysäkkiä — UI nimeää ne
   *  rehellisesti sen sijaan että pudottaisi hiljaa. */
  missing: SceneId[]
}

/** Rakentaa illan käyttäjän palikoista: jokainen palikka = tasan yksi sen
 *  tyyppinen pysäkki, aikataulutus samalla luottamusmoottorilla (aukiolot,
 *  tapahtumien oikeat ajat ankkureina, kulkuajat, yön raja). Jos jokin
 *  palikka ei toteudu, palautetaan null + palikan nimi — EI vajaata tai
 *  vääräntyyppistä suunnitelmaa. */
export function buildSceneArc(
  deck: Candidate[],
  slots: SceneId[],
  opts: { when: GroupWhen; variant?: number; date?: string; nowH?: number },
): SceneArcResult {
  const variant = opts.variant ?? 0
  const date = opts.date ?? helsinkiToday()
  const arcDay = new Date(`${date}T12:00:00`)
  const nowH = opts.nowH
  const sopts: ScheduleOpts = { when: opts.when, date, nowH }

  const ordered = [...new Set(slots)]
    .filter((s): s is SceneId => !!SCENE_MATCH[s])
    .sort((a, b) => SCENE_SLOT_ORDER.indexOf(a) - SCENE_SLOT_ORDER.indexOf(b))
  if (ordered.length === 0) return { plan: null, missing: [] }

  // Samat kovat portit kuin roolimoottorissa: kiinni koko kaarpäivän, väärän
  // päivän tapahtuma ja jo alkanut tapahtuma eivät kelpaa mihinkään palikkaan.
  const available = deck.filter(c => {
    if (closedOnArcDay(c, arcDay)) return false
    if (c.type === 'event') {
      if (c.dateISO && c.dateISO !== date) return false
      if (nowH != null) {
        const h = parseHour(c.time)
        if (h != null && h < nowH) return false
      }
    }
    return true
  })

  // Palikkakohtaiset ehdokaslistat — pisteet pakasta (korttikohtainen jitter
  // mukana), paras ensin. Tyhjä lista = palikka ei toteudu tänään, kerrotaan heti.
  const lists = ordered.map(s => available.filter(SCENE_MATCH[s]!).sort((a, b) => b._score - a._score))
  const gateMissing = ordered.filter((_, i) => lists[i].length === 0)
  if (gateMissing.length > 0) return { plan: null, missing: gateMissing }

  // Valinta + korjaussilmukka. variant kiertää aloituskohtaa (arvo uudelleen
  // → eri yhdistelmä). Jos aikatauluttaja pudottaa pysäkin (aukiolo/yön raja/
  // ankkurikonflikti), kokeillaan SEN palikan seuraavaa ehdokasta — palikka ei
  // koskaan katoa hiljaa. Ehdokkaiden loppuminen → rehellinen missing.
  const cursors = ordered.map(() => 0)
  const pickAt = (i: number) => lists[i][(variant + cursors[i]) % lists[i].length]
  let timed: TimedStep[] | null = null
  let picks: Candidate[] = []
  for (let attempt = 0; attempt < 16 && !timed; attempt++) {
    picks = []
    const usedIds = new Set<string>()
    const usedTitles = new Set<string>()
    let exhausted: SceneId | null = null
    for (let i = 0; i < ordered.length; i++) {
      // Sama kortti voi osua kahteen palikkaan (klassinen konsertti on sekä
      // keikka- että kulttuurilistalla) — kelataan duplikaatin yli.
      while (cursors[i] < lists[i].length) {
        const c = pickAt(i)
        if (!usedIds.has(c.id) && !usedTitles.has(c.title.toLowerCase().trim())) break
        cursors[i]++
      }
      if (cursors[i] >= lists[i].length) { exhausted = ordered[i]; break }
      const c = pickAt(i)
      usedIds.add(c.id)
      usedTitles.add(c.title.toLowerCase().trim())
      picks.push(c)
    }
    if (exhausted) return { plan: null, missing: [exhausted] }

    const t = scheduleSteps(picks, sopts)
    if (t && t.length === picks.length) { timed = t; break }

    const survived = new Set((t ?? []).map(x => x.c.id))
    const failIdx = picks.findIndex(c => !survived.has(c.id))
    if (failIdx < 0) return { plan: null, missing: [] }
    cursors[failIdx]++
    if (cursors[failIdx] >= lists[failIdx].length) return { plan: null, missing: [ordered[failIdx]] }
  }
  if (!timed) return { plan: null, missing: [] }

  // Reittiparannus PALIKAN SISÄLLÄ: kokeile 2 seuraavaksi parasta samasta
  // palikasta; hyväksy vain jos koko setti aikatauluttuu täysimittaisena ja
  // kokonaiskävely lyhenee ≥5 min (sama kynnys kuin roolimoottorissa).
  // Roolimoottorin optimizeForTravel EI kelpaa tähän: se vaihtaa ROOLIN
  // sisällä, jolloin sauna voisi vaihtua puistoksi (molemmat activity).
  let bestTravel = totalTravelMin(timed)
  for (let i = 0; i < picks.length; i++) {
    const othersIds = new Set(picks.filter((_, j) => j !== i).map(c => c.id))
    const othersTitles = new Set(picks.filter((_, j) => j !== i).map(c => c.title.toLowerCase().trim()))
    const alts = lists[i]
      .filter(c => c.id !== picks[i].id && !othersIds.has(c.id) && !othersTitles.has(c.title.toLowerCase().trim()))
      .slice(0, 2)
    for (const alt of alts) {
      const trial = picks.map((c, j) => (j === i ? alt : c))
      const t = scheduleSteps(trial, sopts)
      if (!t || t.length !== trial.length) continue
      const travel = totalTravelMin(t)
      if (travel + 5 < bestTravel) { picks = trial; timed = t; bestTravel = travel }
    }
  }

  const steps: PlanStep[] = timed.map(t => ({
    ...candidateToStep(t.c, whyFor(t.c, false), t.c.time || fmtHour(t.startH), false),
    durH: t.durH,
  }))
  withTravelTimes(steps)

  return {
    plan: {
      kind: 'arc',
      engine: 'rules',
      variant,
      date,
      intro: steps.map(s => s.title).join(' → '),
      arc: steps,
      outro: undefined,
    },
    missing: [],
  }
}

// Valitsee tykätyt kortit kaareksi TIUKOIN säännöin ja aikatauluttaa ne
// luottamusmoottorilla. variant > 0 kiertää roolisisäisiä valintoja
// ("kudo uudelleen" → eri yhdistelmä, edelleen 0 €).
// opts.maxSteps: montako vaihetta kaareen (isännän valinta, oletus 4 = kaikki
// roolit) — roolit valitaan äänimmäärän mukaan, tasatilanteessa illan kulkujärjestys.
export function buildDeterministicArc(
  loved: Candidate[],
  votes: Record<string, { love: number; skip: number }>,
  superIds: Set<string>,
  opts: { when: GroupWhen; variant?: number; date?: string; nowH?: number; maxSteps?: number },
): GroupArcPlan | null {
  if (loved.length === 0) return null
  const variant = opts.variant ?? 0
  const date = opts.date ?? helsinkiToday()
  const arcDay = new Date(`${date}T12:00:00`)

  // 0. Kovat portit ENNEN valintaa:
  //    - kiinni koko kaarpäivän olevat kortit eivät voi olla kaaressa LAINKAAN
  //    - JO ALKANUT tapahtuma (kaari tänään + kellonaika mennyt) pois — sessio
  //      voi luoda pakkaa ennen kaaren kutomista (käyttäjätapaus 8/2026)
  //    - tapahtuma VAARALLA PÄIVÄLLÄ (monipäiväinen sessio) pois — kaari on
  //      aina yhden päivän, dateISO todistaa tapahtuman oikean päivän
  const nowH = opts.nowH
  const available = loved.filter(c => {
    if (closedOnArcDay(c, arcDay)) return false
    if (c.type === 'event') {
      if (c.dateISO && c.dateISO !== date) return false
      if (nowH != null) {
        const h = parseHour(c.time)
        if (h != null && h < nowH) return false
      }
    }
    return true
  })
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
  //    on aina virhe), ja korkeintaan maxSteps roolia — valittuna ne, joissa
  //    on eniten ❤️ (tasatilanteessa illan luontainen kulku ratkaisee).
  //    variant kiertää roolin sisäistä jonoa aloittaen kierroksesta mutta
  //    palaa aina parhaaseen kun variant=0.
  const maxSteps = Math.max(1, Math.min(6, opts.maxSteps ?? ROLE_ORDER.length))
  const roleLoves = (role: CandidateRole) =>
    (byRole.get(role) ?? []).reduce((sum, c) => sum + (votes[c.id]?.love ?? 0), 0)
  const rolesPicked = ROLE_ORDER
    .filter(r => (byRole.get(r)?.length ?? 0) > 0)
    .sort((a, b) => roleLoves(b) - roleLoves(a) || ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
    .slice(0, maxSteps)

  const picked: Candidate[] = []
  const usedSub = new Set<string>()
  for (const role of rolesPicked) {
    const q = byRole.get(role)!
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
