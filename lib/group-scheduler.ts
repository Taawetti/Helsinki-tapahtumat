// Kaaren aikataulutusmoottori (M1 "luottamusmoottori") — PUHDAS, verkkovapaa
// logiikka, fixture-testattava (scripts/test-categories.ts).
//
// Korvaa group-arc.ts:n aiemman aikataulutuksen, jossa oli kolme tuotantovikaa:
//  1) täydennysvaihe lisäsi kortteja ilman rooli-/alatyyppisuojaa → kaariin
//     tuli kaksi saunaa tai kaksi ravintolaa peräkkäin
//  2) kulkuaikaa käytettiin vain näyttämiseen, ei toteutettavuuteen →
//     seuraavaan paikkaan ei ehtinyt
//  3) kiinni koko päivän oleva paikka jäi kaareen ja "tänä iltana" -kaari
//     saattoi alkaa menneessä ajassa
//
// Moottori: kiinteäaikaiset tapahtumat ovat ankkureita; muut vaiheet
// aikataulutetaan roolikulun mukaan (tekeminen → ruoka → drinkit → ohjelma)
// kovina rajoitteina: roolin kesto + todellinen kulkuaika + 15 min puskuri,
// aukiolot (OSM), ei menneitä aikoja, loppu klo 23.30 mennessä.
import type { Candidate, CandidateRole, GroupWhen } from '@/lib/candidate'
import { walkMinutesBetween } from '@/lib/group'
import { clampToOpenHour } from '@/lib/opening-hours'

// Illan luontainen kulku. ÄLÄ muuta järjestystä kevyesti — semanttinen.
export const ROLE_ORDER: CandidateRole[] = ['activity', 'food', 'drinks', 'program']

// Roolien suunnitellut kestot (h) — siirtymän jälkeen seuraava vaihe alkaa
// vasta: edellinen alku + kesto + kulkuaika + puskuri.
export const DUR_H: Record<CandidateRole, number> = { activity: 2, food: 1.5, drinks: 1, program: 2 }

// Siirtymäpuskuri: ryhmä ei ole kone — pukeutuminen, odottelu, jonot.
export const TRAVEL_BUFFER_H = 0.25

// Kaari päättyy viimeistään tähän (hyväksytty "yön raja").
export const ARC_END_CAP_H = 23.5

// Oletuskellonajat rooleittain kun kortilla ei ole todellista aikaa.
const DEFAULT_HOUR: Record<GroupWhen, Record<CandidateRole, number>> = {
  tonight: { activity: 17, food: 18.5, drinks: 21, program: 22 },
  day:     { activity: 10, food: 12, drinks: 16, program: 18 },
  weekend: { activity: 12, food: 13.5, drinks: 17, program: 20 },
}

// "to 20.50" → 20.83 (fi-FI Intl -muoto). Palauttaa null jos ei kellonaikaa.
export function parseHour(t?: string): number | null {
  if (!t) return null
  const m = t.match(/(\d{1,2})\.(\d{2})/)
  if (!m) return null
  return Number(m[1]) + Number(m[2]) / 60
}

/** Alatyyppi duplikaattisuojaa varten: aktiviteeteilla kategoria (sauna,
 *  museo…), ravintoloilla tyyppi (baari, kahvila…), tapahtumilla 'tapahtuma'. */
export function subtypeOf(c: Candidate): string {
  return (c.tags?.[0] ?? c.type).toLowerCase()
}

/** Onko kortti KOKO kaarpäivän kiinni (OSM-aukiolotiedolla mitattuna)?
 *  Tuntematon aukiolo (ei dataa) EI ole kiinni — puuttuvasta ei rangaista. */
export function closedOnArcDay(c: Candidate, arcDay: Date): boolean {
  if (!c.openingHours) return false
  return clampToOpenHour(c.openingHours, arcDay, 12, 1) == null
}

export interface TimedStep {
  c: Candidate
  startH: number   // alkuaika tunteina (esim. 19.5)
  durH: number     // suunniteltu kesto
  fixed: boolean   // kiinteä todellinen alkamisaika (tapahtumat) — ei siirretä
}

export interface ScheduleOpts {
  when: GroupWhen
  date: string      // kaarpäivä YYYY-MM-DD
  nowH?: number     // Helsingin kellonaika tunteina, VAIN jos date == tänään
}

/** Aikatauluttaa valitut kortit kaareksi kovin rajoittein. Palauttaa vaiheet
 *  kronologisessa järjestyksessä, tai null jos mitään ei voida aikatauluttaa.
 *
 *  Säännöt:
 *  - ankkurit (fixed) pitävät aina todellisen aikansa
 *  - joustava vaihe alkaa aikaisintaan: edellinen alku + kesto + kulkuaika + puskuri
 *  - jos ankkuriin ei ehdi: joustava ketju siirtyy AIKAISEMMIN; jos ei mahdu,
 *    edellinen joustava vaihe PUTOTAAN (realistinen kaari > täysi kaari)
 *  - aukiolot (OSM) sovitetaan; kiinni koko päivän → kortti putoaa
 *  - nowH annettuna kaari ei ala menneessä (joustavat siirtyvät eteenpäin)
 *  - loppu viimeistään ARC_END_CAP_H
 */
export function scheduleSteps(cards: Candidate[], opts: ScheduleOpts): TimedStep[] | null {
  if (cards.length === 0) return null
  const arcDay = new Date(`${opts.date}T12:00:00`)

  // Aikajanan perustunnit: ohjelma-ankkuri säätelee ruokaa/drinkejä
  // (lounas päiväohjelmaan, illallinen iltaohjelmaan, jatkot jos ohjelma ≤21).
  const base = { ...DEFAULT_HOUR[opts.when] }
  const anchorH = (() => {
    const p = cards.find(c => c.role === 'program')
    return p ? parseHour(p.time) : null
  })()
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

  // Roolikulku + alkutilanne
  const ordered = [...cards].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
  const timed: TimedStep[] = ordered.map(c => {
    const realH = parseHour(c.time)
    return { c, startH: realH ?? base[c.role], durH: DUR_H[c.role], fixed: realH != null }
  })

  // Nyt-tietoisuus: joustavat vaiheet eivät voi alkaa menneessä.
  // (Ankkuri voi olla jo alkanut — se on todellisuus, ei suunnitelmavirhe.)
  if (opts.nowH != null) {
    const minStart = opts.nowH + 0.75 // ~45 min valmistautumiseen
    const firstFlex = timed.find(t => !t.fixed)
    if (firstFlex && firstFlex.startH < minStart) {
      const shift = minStart - firstFlex.startH
      for (const t of timed) if (!t.fixed) t.startH += shift
    }
  }

  // Kaskadi + aukiolot + konfliktinratkaisu. Toistetaan kunnes vakaa
  // (putoukset ja taaksepäin vedot voivat muuttaa ketjua muutaman kerran).
  for (let round = 0; round < 4; round++) {
    timed.sort((a, b) => a.startH - b.startH)
    let changed = false

    for (let i = 0; i < timed.length; i++) {
      const t = timed[i]
      if (t.fixed) continue

      const prev = i > 0 ? timed[i - 1] : null
      let h = t.startH
      if (prev) {
        const travelH = (walkMinutesBetween(prev.c, t.c) ?? 0) / 60
        h = Math.max(h, prev.startH + prev.durH + travelH + TRAVEL_BUFFER_H)
      }

      // Aukiolot: sovita päivän aukioloaikoihin (minimi kesto roolin mukaan);
      // kiinni koko päivän → pudota kortti.
      if (t.c.openingHours) {
        const minDur = t.c.role === 'food' || t.c.role === 'activity' ? 1.25 : 1
        const clamped = clampToOpenHour(t.c.openingHours, arcDay, h, minDur)
        if (clamped == null) {
          timed.splice(i, 1)
          changed = true
          break
        }
        h = clamped
      }

      // Yön raja: joustava ei saa työntyä yli 23.30 — yritä aikaisempi ikkuna,
      // muuten pudota (kaaren loppuun ei tungeta epärealistista vaihetta).
      if (h > ARC_END_CAP_H) {
        timed.splice(i, 1)
        changed = true
        break
      }

      if (Math.abs(h - t.startH) > 1e-9) { t.startH = h; changed = true }
    }

    // Ankkurikonflikti: joustava ketju työntyi ankkurin yli → vedä joustavat
    // AIKAISEMMIN niin että ankkuriin ehditään (kesto + kulku + puskuri).
    // Tämä vaihe ajetaan AINA, myös kun kaskadi ei muuttanut mitään —
    // muuten ankkurin yli menevä ketju jäisi korjaamatta.
    timed.sort((a, b) => a.startH - b.startH)
    for (let i = 1; i < timed.length; i++) {
      const anchor = timed[i]
      if (!anchor.fixed) continue
      const prev = timed[i - 1]
      if (prev.fixed) continue
      const travelH = (walkMinutesBetween(prev.c, anchor.c) ?? 0) / 60
      const latestStart = anchor.startH - travelH - TRAVEL_BUFFER_H - prev.durH
      if (prev.startH > latestStart + 1e-9) {
        // Veda ketjua taaksepäin tämän ja sitä edeltävien joustavien osalta
        const delta = prev.startH - latestStart
        for (let j = i - 1; j >= 0; j--) {
          if (timed[j].fixed) break
          timed[j].startH -= delta
        }
        // Jos ketju meni nyt-rajan tai järjen alle, pudota edellinen joustava
        const floor = opts.nowH != null ? opts.nowH + 0.25 : -Infinity
        if (prev.startH < floor || prev.startH < 8) {
          timed.splice(i - 1, 1)
        }
        changed = true
      }
    }
    if (!changed) break
  }

  timed.sort((a, b) => a.startH - b.startH)

  // Loppusiivous: jos joustava vaihe jäi kaikesta huolimatta päällekkäin
  // ankkurin kanssa (ei mahtunut aikaisemminkaan), pudota se — realistinen
  // vajaakaari on aina parempi kuin mahdoton täysi kaari.
  for (let i = timed.length - 1; i > 0; i--) {
    const anchor = timed[i]
    const prev = timed[i - 1]
    if (!anchor.fixed || prev.fixed) continue
    const travelH = (walkMinutesBetween(prev.c, anchor.c) ?? 0) / 60
    if (prev.startH + prev.durH + travelH + TRAVEL_BUFFER_H > anchor.startH) {
      timed.splice(i - 1, 1)
    }
  }

  // Lopputarkistus: jos kaksi ANKKURIA (pitäisi olla max 1 roolisuojalla)
  // menee päällekkäin, pudota myöhempi — käyttäjä ei voi olla kahdessa paikassa.
  const out: TimedStep[] = []
  for (const t of timed) {
    const prev = out[out.length - 1]
    if (t.fixed && prev?.fixed) {
      const travelH = (walkMinutesBetween(prev.c, t.c) ?? 0) / 60
      if (t.startH < prev.startH + prev.durH + travelH + TRAVEL_BUFFER_H) continue
    }
    out.push(t)
  }

  return out.length > 0 ? out : null
}

/** Laskee kaaren kokonaiskulkuaika (min, haversine-arvio) järjestyksessä. */
export function totalTravelMin(steps: TimedStep[]): number {
  let sum = 0
  for (let i = 1; i < steps.length; i++) {
    sum += walkMinutesBetween(steps[i - 1].c, steps[i].c) ?? 0
  }
  return sum
}

/** Reittioptimointi: kokeile roolisisäisiä vaihtoehtoja (max top-2/rooli
 *  äänimäärällä) ja valitse yhdistelmä, joka minimoi kokonaiskulkumajan.
 *  Äänestysjärjestys säilyy ensisijaisena — optimointi tehdään vain
 *  top-2:n sisällä, ei koko listalla. Deterministinen. */
export function optimizeForTravel(
  initial: TimedStep[],
  alternatives: Map<CandidateRole, Candidate[]>,
  opts: ScheduleOpts,
): TimedStep[] {
  let best = initial
  let bestTravel = totalTravelMin(initial)

  for (let round = 0; round < 2; round++) {
    let improved = false
    for (let i = 0; i < best.length; i++) {
      const role = best[i].c.role
      const alts = (alternatives.get(role) ?? []).filter(c => c.id !== best[i].c.id).slice(0, 2)
      for (const alt of alts) {
        const trial = best.map((t, j) =>
          j === i
            ? { c: alt, startH: t.startH, durH: t.durH, fixed: parseHour(alt.time) != null }
            : t,
        )
        // Laske aikataulu uudelleen vaihtoehdolla — huono aikataulu (putouksia)
        // tai pidempi matka ei kelpaa.
        const scheduled = scheduleSteps(trial.map(t => t.c), opts)
        if (!scheduled || scheduled.length < best.length) continue
        const travel = totalTravelMin(scheduled)
        if (travel + 5 < bestTravel) { // vähintään 5 min parannus, muuten vaivautuu
          best = scheduled
          bestTravel = travel
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return best
}
