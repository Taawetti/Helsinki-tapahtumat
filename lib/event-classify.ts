// Tapahtumien kategorialuokittelu — yksi totuus koko sovellukselle.
//
// Arkkitehtuuri (syväauditointi 2026-07-22): kerrokset EHDOTTAVAT, globaalit
// vetot PÄÄTTÄVÄT. Tarkkuus ennen kattavuutta: epävarma tapaus jää mieluummin
// ilman kategoriaa (näkyy silti Kaikki-syötteessä ja haussa) kuin arvataan
// väärin — paikallinen antaa anteeksi puuttuvan tapahtuman, ei väärää.
//
//   L1  Venue-kartta: vain yksikäyttöiset paikat (Tavastia ≈ aina keikka).
//       Monikäyttöpaikat (Korjaamo, Suvilahti, Stoa…) EIVÄT kuulu tänne —
//       ne tuottaisivat virheitä eivätkä poistaisi niitä.
//   L2  Lähteen rakenteiset kategoriat: täsmätoken-vastaavuus (ei osamerkki-
//       jonoja) vain ≥95 % -tarkoille kategorianimille.
//   L3  Viritetyt avainsanasäännöt (VIBES.keywords) — osamerkkijonohaku
//       otsikko+kuvaus+kategoriat-tekstiin.
//
// Globaali veto: vibe.excludeKeywords tarkistetaan KAIKKIEN kerrosten
// ehdotuksille — "Lastenkonsertti Tavastialla" saa venue-ehdotuksen keikka,
// mutta lapsi-veto voittaa ja tapahtuma menee Lapset-kategoriaan.
//
// Luokittelu ajetaan kerran /api/events-aggregaatissa (event.vibes), ja
// klientti käyttää getEventVibes-apuria joka laskee fallbackina itse
// (seed-data ja vanhat välimuistivastaukset ilman vibes-kenttää).
//
// Regressiotestit: scripts/test-categories.ts — aja `npm run test:categories`.
// Jokainen kertaalleen löydetty luokitteluvirhe lisätään sinne testinä.

import { VIBES, type Vibe, type Event } from './types'

// ── L1: Venue-kartta ─────────────────────────────────────────────────────────
// `sub` = erottuva osamerkkijono venue-nimessä (≥6 merkkiä tai selvästi
// yksiselitteinen). `exact` = koko nimen täsmäys lyhyille/riskaabelille
// nimille ('kaiku' olisi osamerkkijono kadunnimessä Kaikukatu).
// `notSub` = jos venue-nimi sisältää jonkin näistä, sääntö EI osu
// (esim. 'kiasma' osuu myös "Kiasma-teatteri" -esityslavaan).
type VenueRule = { vibes: string[]; sub?: string[]; exact?: string[]; notSub?: string[] }

// VAIN yksikäyttöiset paikat. Monikäyttötalot (Musiikkitalo: opastukset/luennot/
// avoimet harjoitukset; Kulttuuritalo: kongressit/gaalat; Tanssin talo: avoimet
// tunnit/perhetanssit/vuokraus) on TARKOITUKSELLA jätetty pois — venue ei kerro
// niiden lajia luotettavasti. Aidot keikat/esitykset niissä osuvat silti L3:n
// avainsanoihin ('konsert', 'tanssi', 'esitys').
const VENUE_RULES: VenueRule[] = [
  {
    vibes: ['keikka'],
    sub: ['tavastia', 'semifinal', 'bar loose', 'on the rocks', 'storyville', 'g livelab', 'mummotunneli'],
  },
  { vibes: ['keikka', 'underground'], sub: ['lepakkomies', 'post bar'] },
  { vibes: ['yoelama', 'underground'], sub: ['ääniwalli'], exact: ['kaiku', 'klubi kaiku'] },
  { vibes: ['yoelama'], sub: ['maxine'] },
  {
    // Vain omistautuneet draamateatterit. EI monikäyttöisiä: Tanssin talo,
    // Aleksanterin teatteri (konsertit/standup/gaalat), Kansallisooppera
    // (kierrokset) — niiden aidot esitykset osuvat L3:n 'ooppera'/'baletti'/
    // 'tanssi'/'esitys'-avainsanoihin.
    // Svenska Teatern poistettu — monikäyttöinen suuri näyttämö (kiertuekeikat,
    // standup); sen aidot esitykset osuvat L3:n esitys-avainsanoihin
    vibes: ['teatteri'],
    sub: ['kansallisteatteri', 'kaupunginteatteri', 'q-teatteri', 'kom-teatteri', 'lilla teatern', 'teatteri jurkka'],
  },
  {
    // Ateneum poistettu (Ateneum-sali = kamarikonsertit); 'kiasma' ei saa osua
    // Kiasma-teatteriin (esityslava) → notSub
    vibes: ['museo'],
    sub: ['kiasma', 'amos rex', 'kansallismuseo', 'designmuseo', 'seurasaaren ulkomuseo', 'luonnontieteellinen museo'],
    notSub: ['kiasma-teatteri'],
  },
  { vibes: ['taide'], sub: ['taidehalli'] },
]

// ── L2: Lähteen rakenteiset kategoriat ──────────────────────────────────────
// Täsmätoken (pienaakkostettu, trimmattu kategorianimi) → vibe-ehdotukset.
// Vain nimet joiden tarkkuus on ≥95 % — esim. 'musiikki' EI kuulu tänne,
// koska vauvojen lorutuokiokin kantaa sitä; 'sirkus' EI kuulu tänne, koska
// se on kesällä Circus Helsinki / Cirko -lastenleirien hallitsema (auditointi).
// Map (ei objektiliteraali) → 'constructor'/'__proto__'-nimet eivät osu
// prototyyppiketjuun eivätkä kaada luokittelua.
const SOURCE_CAT_VIBES = new Map<string, string[]>([
  ['konsertit', ['keikka']],
  ['elävä musiikki', ['keikka']],
  ['teatteri', ['teatteri']],
  ['ooppera', ['teatteri']],
  ['näyttelyt', ['taide']],
  ['festivaalit', ['festivaali']],
])

// ── Luokittelu ───────────────────────────────────────────────────────────────

type ClassifiableEvent = Pick<Event, 'title'> &
  Partial<Pick<Event, 'shortDescription' | 'categories'>> & {
    location?: { name?: string } | null
  }

/** Luokittele tapahtuma kategorioihin. Palauttaa vibe-id:t (voi olla tyhjä —
 *  epävarma jää mieluummin ilman kategoriaa kuin väärään). Puhdas funktio,
 *  toimii sekä palvelimella että selaimessa. */
// Tokenisointi: pienaakkoset, välimerkit → välilyönti (kuten dedupKey
// route.ts:ssä), tokeneiksi. Näin "Live!"/"(Live)"/"live-ilta" → token "live".
function tokenize(text: string): string[] {
  const norm = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return norm ? norm.split(' ') : []
}

// Avainsanaosuma — kolme moodia:
//   '^live'  SANANALKUOSUMA (token alkaa avainsanalla) — törmäysalttiille
//            lyhyille/englannin sanoille: '^live' osuu live/livenä/livemusiikki
//            mutta EI oliver/olive; '^fest' ei manifesti; '^punk' ei kaupunki;
//            '^kurssi' ei konkurssi; '^maraton' ei elokuvamaraton.
//   'stand up' MONISANAINEN = normalisoidun tekstin substring.
//   'konsert' YKSISANAINEN ilman ^ = substring → osuu myös suomen yhdyssanan
//            LOPPUUN (joulu·konsertti, sinfonia·konsertti, nykytanssi). Näitä
//            morfeemeja EI voi token-prefixata ilman että recall romahtaa.
// Failure-moodi (aliosuma → Kaikki-syöte) on hyväksytympi kuin väärä kategoria.
function matchesKeyword(keyword: string, tokens: string[], joined: string): boolean {
  const k = keyword.toLowerCase().trim()
  if (!k) return false
  if (k.startsWith('^')) { const kk = k.slice(1); return tokens.some((t) => t.startsWith(kk)) }
  return joined.includes(k)
}

export function classifyEvent(e: ClassifiableEvent): string[] {
  // Veto ja positiivinen matchaus katsovat SAMAA tekstiä: otsikko + kuvaus +
  // kategoriat. Venue-nimeä EI lisätä tähän (erisnimi → osamerkkijonoveto
  // pudottaisi oikeita: "Stadin yhteisötalo Saunabaari"). Venue vain L1:ssä.
  const text = [e.title, e.shortDescription ?? '', ...(e.categories ?? [])].join(' ')
  const tokens = tokenize(text)
  const joined = ` ${tokens.join(' ')} `
  const venue = (e.location?.name ?? '').toLowerCase().trim()
  const vetoed = (vibe: Vibe) => !!vibe.excludeKeywords?.some((k) => matchesKeyword(k, tokens, joined))

  const out = new Set<string>()

  // Ehdotus kerroksilta L1/L2 hyväksytään vain jos globaali veto ei osu
  const propose = (id: string) => {
    const vibe = VIBES.find((v) => v.id === id)
    if (vibe && !vetoed(vibe)) out.add(id)
  }

  // L1: venue-kartta (positiivinen venue-tunnistus + notSub-poikkeukset)
  if (venue) {
    for (const rule of VENUE_RULES) {
      if (rule.notSub?.some((s) => venue.includes(s))) continue
      if (rule.sub?.some((s) => venue.includes(s)) || rule.exact?.some((s) => venue === s)) {
        rule.vibes.forEach(propose)
      }
    }
  }

  // L2: lähteen kategoriat täsmätokeneina (Map → ei prototyyppiketju-osumia)
  for (const cat of e.categories ?? []) {
    SOURCE_CAT_VIBES.get(cat.toLowerCase().trim())?.forEach(propose)
  }

  // L3: avainsanasäännöt — sananalkuosuma JA ei veto
  for (const vibe of VIBES) {
    if (vibe.keywords.some((k) => matchesKeyword(k, tokens, joined)) && !vetoed(vibe)) out.add(vibe.id)
  }

  return [...out]
}

/** Klientin apuri: API:n laskema event.vibes jos on; muuten laske itse
 *  (SSR-seedit ja vanhat välimuistivastaukset ilman vibes-kenttää). */
export function getEventVibes(e: Event): string[] {
  return e.vibes ?? classifyEvent(e)
}
