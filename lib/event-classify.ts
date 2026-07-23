// Tapahtumien kategorialuokittelu — yksi totuus koko sovellukselle.
//
// Arkkitehtuuri (syväauditointi 2026-07-22..23): kerrokset EHDOTTAVAT, globaalit
// vetot PÄÄTTÄVÄT. Tarkkuus ennen kattavuutta: epävarma tapaus jää mieluummin
// ilman kategoriaa (näkyy silti Kaikki-syötteessä ja haussa) kuin arvataan
// väärin — paikallinen antaa anteeksi puuttuvan tapahtuman, ei väärää.
//
//   L0  yso-ONTOLOGIAKOODIT (LinkedEvents): vakaa, kielestä riippumaton,
//       törmäyksetön PÄÄsignaali. 'yso:p916' (liikunta) ≠ 'yso:p965' (urheilu)
//       ratkaisee ongelman jota mikään tekstisääntö ei ratkaissut. Data-
//       pohjainen kartta (yso-freq.mjs, 800 tapahtuman otos). Tarkin kerros.
//   L1  Venue-kartta: vain yksikäyttöiset paikat (Tavastia ≈ aina keikka).
//       Monikäyttöpaikat (Korjaamo, Suvilahti, Stoa…) EIVÄT kuulu tänne.
//   L2  Lähteen kategorianimet täsmätokeneina (Map, ≥95 % -tarkat nimet).
//   L3  Tokenisoiva avainsanamatchaus (VIBES.keywords) — VIIMEINEN keino
//       lähteille joilla ei ole yso-koodeja (Ticketmaster, scraperit).
//
// Globaali veto: vibe.excludeKeywords tarkistetaan KAIKKIEN kerrosten
// ehdotuksille — "Lastenkonsertti Tavastialla" saa venue-ehdotuksen keikka,
// mutta lapsi-veto voittaa ja tapahtuma menee Lapset-kategoriaan.
//
// Luokittelu ajetaan kerran /api/events-aggregaatissa (event.vibes), ja
// klientti käyttää getEventVibes-apuria joka laskee fallbackina itse.
//
// Regressiotestit: scripts/test-categories.ts — aja `npm run test:categories`.
// Jokainen kertaalleen löydetty luokitteluvirhe lisätään sinne testinä.

import { VIBES, type Vibe, type Event } from './types'

// Poimi vakaa yso-koodi keyword-objektin @id:stä
// (…/keyword/yso:p11185/ → 'yso:p11185'). Kattaa myös kulke:/helsinki:/kultus:.
export function extractYsoIds(keywords?: ({ '@id'?: string } | null)[]): string[] {
  const ids: string[] = []
  for (const k of keywords ?? []) {
    const m = (k?.['@id'] ?? '').match(/keyword\/([^/]+)/)
    if (m) ids.push(m[1])
  }
  return ids
}

// ── L0: yso-ontologiakoodi → vibe ────────────────────────────────────────────
// Kuratoitu OIKEASTA Helsingin yso-sanastosta (800 tapahtuman taajuusotos).
// PERIAATE (katselmointi 2026-07-23): kartoita vain koodit jotka nimeävät
// tapahtuman TYYPIN/FORMAATIN (konsertit, näyttelyt, työpaja) tai jotka
// osuvat audience-kategoriaan (lapset). EI aihe-/yleisö-/paikkakoodeja
// (historia, keskustelu, pelit, opastus, ikääntyneet, palvelukeskukset,
// Espan lava) — ne ovat moniselitteisiä ja täyttäisivät väärän kategorian.
// Map (EI objektiliteraali) → feed-syötteinen 'constructor'/'__proto__'-avain
// ei osu prototyyppiketjuun eikä kaada luokittelua (sama suoja kuin L2).
// Vetot koskevat myös näitä ehdotuksia (propose).
const YSO_TO_VIBE = new Map<string, string[]>([
  // Keikat — vain spesifit musiikkikoodit (broad 'musiikki' p1808 jätetty pois)
  ['yso:p11185', ['keikka']],      // konsertit
  ['yso:p24765', ['keikka']],      // musiikkikeikat
  // Teatteri & esittävä taide
  ['yso:p2625',  ['teatteri']],    // teatteritaide
  ['yso:p27081', ['teatteri']],    // esitystaide
  ['yso:p5000',  ['teatteri']],    // näytelmät
  ['yso:p1278',  ['teatteri']],    // tanssi
  // Kuvataide / näyttelyt
  ['yso:p5121',  ['taide']],       // näyttelyt
  ['yso:p2739',  ['taide']],       // kuvataide
  ['yso:p2851',  ['taide']],       // taide
  // Museot
  ['yso:p4934',  ['museo']],       // museot
  // Urheilu — VAIN kilpaurheilu; liikunta/liikuntaharrastus → harrastukset
  ['yso:p965',   ['urheilu']],     // urheilu
  // Festivaalit
  ['yso:p1304',  ['festivaali']],  // festivaalit
  // Lapset & perhe (yleisökoodit → lapset on yleisökategoria)
  ['yso:p316',   ['lapset']],      // leikkiminen
  ['yso:p8105',  ['lapset']],      // leikkipuistot
  ['yso:p13050', ['lapset']],      // lapsiperheet
  ['yso:p4354',  ['lapset']],      // lapset (ikäryhmät)
  ['yso:p4363',  ['lapset']],      // perheet
  ['yso:p15937', ['lapset']],      // vauvat
  ['yso:p20513', ['lapset']],      // vauvaperheet
  ['yso:p16485', ['lapset']],      // koululaiset
  ['yso:p14710', ['lapset']],      // satutunnit
  // Harrastukset & Kurssit — vain selkeät osallistumis-/kurssiformaatit
  ['kulke:732',  ['tyopaja']],     // Työpajat
  ['yso:p916',   ['tyopaja']],     // liikunta (kunnallinen jumppa ym.)
  ['yso:p13035', ['tyopaja']],     // liikuntaharrastus
  ['yso:p15875', ['tyopaja']],     // luennot
  ['yso:p20345', ['tyopaja']],     // bingo
  ['yso:p4923',  ['tyopaja']],     // käsityöt
  ['yso:p8630',  ['tyopaja']],     // kädentaidot
  ['yso:p37943', ['tyopaja']],     // digineuvonta
  ['helsinki:aflfbatker', ['tyopaja']], // digitaidot
  ['helsinki:agjffu7tgq', ['tyopaja']], // Kielikahvilat
])

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
  Partial<Pick<Event, 'shortDescription' | 'categories' | 'ysoIds'>> & {
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

  // Ehdotus kerroksilta L0/L1/L2 hyväksytään vain jos globaali veto ei osu
  const propose = (id: string) => {
    const vibe = VIBES.find((v) => v.id === id)
    if (vibe && !vetoed(vibe)) out.add(id)
  }

  // L0: yso-ontologiakoodit (tarkin signaali, kielestä riippumaton).
  // Esim. 'yso:p916' (liikunta) → tyopaja, 'yso:p965' (urheilu) → urheilu.
  for (const id of e.ysoIds ?? []) {
    YSO_TO_VIBE.get(id)?.forEach(propose)
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
