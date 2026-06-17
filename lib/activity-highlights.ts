import type { ActivityCategory } from './types'

export type TouristTheme = 'historia' | 'sauna' | 'taide' | 'ulkoilu' | 'perhe' | 'ilmainen'

export interface AttractionHighlight {
  nameKey: string
  hook: string
  duration?: string
  tip?: string
  badge?: string
  themes: TouristTheme[]
}

export const TOURIST_THEME_META: Record<TouristTheme, {
  label: string; emoji: string; shortDesc: string
}> = {
  historia: { label: 'Historia',        emoji: '🏛', shortDesc: 'Suomenlinna, kirkot…'  },
  sauna:    { label: 'Sauna',           emoji: '🧖', shortDesc: 'Löyly, Allas, Kotiharju…' },
  taide:    { label: 'Taide & museot',  emoji: '🎨', shortDesc: 'Ateneum, Kiasma, Amos Rex…' },
  ulkoilu:  { label: 'Ulkoilu',         emoji: '🌿', shortDesc: 'Saaret, rannat, puistot…' },
  perhe:    { label: 'Lapset mukana',   emoji: '🎠', shortDesc: 'Linnanmäki, Korkeasaari…' },
  ilmainen: { label: 'Ilmaiseksi',      emoji: '🆓', shortDesc: 'Kirkot, puistot, rannat…' },
}

// Theme → OSM activity categories — used for filtering the main grid
export const THEME_CATEGORIES: Record<TouristTheme, ActivityCategory[]> = {
  historia: ['nahtavyys', 'museo', 'markkina'],
  sauna:    ['sauna'],
  taide:    ['galleria', 'museo'],
  ulkoilu:  ['puisto', 'uimaranta', 'nakopaikka'],
  perhe:    [],
  ilmainen: [],
}

export const ATTRACTION_HIGHLIGHTS: AttractionHighlight[] = [
  // ── Saunat ─────────────────────────────────────────────
  {
    nameKey: 'kotiharjun sauna',
    hook: 'Helsingin vanhin toimiva julkinen sauna (1928)',
    duration: '1–2 h',
    tip: 'Puulämmitteinen — tule arkisin, viikonloppuisin jonoja.',
    badge: 'Vanhin julkinen sauna',
    themes: ['sauna'],
  },
  {
    nameKey: 'löyly',
    hook: 'Palkittu design-sauna merellä, Hernesaaressa',
    duration: '2–3 h',
    tip: 'Varaa aika etukäteen verkosta — etenkin viikonloppuisin.',
    themes: ['sauna'],
  },
  {
    nameKey: 'allas sea pool',
    hook: 'Meriallas kaupungin sydämessä — kolme allasta ja sauna',
    duration: '2–3 h',
    themes: ['sauna', 'ulkoilu'],
  },
  {
    nameKey: 'kulttuurisauna',
    hook: 'Arkkitehtoninen julkinen sauna merenrannalla Hernesaaressa',
    duration: '1–2 h',
    themes: ['sauna'],
  },
  {
    nameKey: 'sauna hermanni',
    hook: 'Perinteinen lähiösauna puulämmitteisellä kiukaalla — Kallio',
    duration: '1–2 h',
    themes: ['sauna'],
  },

  // ── Historia ────────────────────────────────────────────
  {
    nameKey: 'suomenlinna',
    hook: 'Unescon maailmanperintökohde — lautalla 15 min Kauppatorilta',
    duration: '3–5 h',
    tip: 'HSL-lippu käy lautalla. Kesällä guide-kierroksia englanniksi.',
    badge: 'UNESCO',
    themes: ['historia', 'ulkoilu'],
  },
  {
    nameKey: 'temppeliaukion kirkko',
    hook: 'Ainoa kirkko maailmassa, joka on louhittu suoraan kallioon (1969)',
    duration: '30–45 min',
    tip: 'Parhaat valokuvat iltapäivällä — aurinko paistaa kupuun.',
    badge: 'Ainutlaatuinen',
    themes: ['historia'],
  },
  {
    nameKey: 'kansallismuseo',
    hook: 'Suomen historian kattavin kokoelma esihistoriasta nykypäivään',
    duration: '2–3 h',
    themes: ['historia', 'taide'],
  },
  {
    nameKey: 'vanha kauppahalli',
    hook: 'Arkkitehtuuriltaan suojeltu kauppahalli — ruokakulttuuria vuodesta 1889',
    duration: '1 h',
    badge: 'Perustettu 1889',
    themes: ['historia', 'ilmainen'],
  },
  {
    nameKey: 'kauppahalli',
    hook: 'Arkkitehtuuriltaan suojeltu kauppahalli — ruokakulttuuria vuodesta 1889',
    duration: '1 h',
    badge: 'Perustettu 1889',
    themes: ['historia', 'ilmainen'],
  },
  {
    nameKey: 'hakaniemen kauppahalli',
    hook: 'Rakennettiin Euroopan suurimmaksi kauppahallille vuonna 1914',
    duration: '1 h',
    badge: 'Vuodelta 1914',
    themes: ['historia'],
  },
  {
    nameKey: 'uspenski',
    hook: 'Pohjois-Euroopan suurin ortodoksinen kirkko — 700 000 tiiltä (1868)',
    duration: '30–45 min',
    badge: 'Pohjois-Euroopan suurin',
    themes: ['historia', 'ilmainen'],
  },
  {
    nameKey: 'tuomiokirkko',
    hook: 'Helsingin ikoninen valkoinen katedraali Senaatintorilla (1852)',
    duration: '20–30 min',
    themes: ['historia', 'ilmainen'],
  },
  {
    nameKey: 'seurasaari',
    hook: 'Ulkoilmamuseo — 87 siirrettyä historiallista rakennusta eri puolilta Suomea',
    duration: '2–4 h',
    themes: ['historia', 'ulkoilu', 'ilmainen'],
  },

  // ── Taide ───────────────────────────────────────────────
  {
    nameKey: 'ateneum',
    hook: 'Suomen suurin taidekokoelma — kultakausi ja mestarit',
    duration: '2–3 h',
    badge: 'Suomen tärkein',
    themes: ['taide'],
  },
  {
    nameKey: 'kiasma',
    hook: 'Nykytaidemuseo Steven Hollin ikonisessa kaarirakenuksessa (1998)',
    duration: '1.5–2 h',
    themes: ['taide'],
  },
  {
    nameKey: 'amos rex',
    hook: 'Kokeellinen taidemuseo maan alla — interaktiivisia installaatioita (2018)',
    duration: '1.5–2 h',
    themes: ['taide'],
  },
  {
    nameKey: 'ham helsinki',
    hook: 'Helsingin kaupungin taidemuseo — nykytaidetta Tennispalatsissa',
    duration: '1.5–2 h',
    themes: ['taide'],
  },
  {
    nameKey: 'sinebrychoff',
    hook: 'Suomen vanhin taidemuseo — eurooppalainen taide 1700–1800-luvuilta',
    duration: '1.5 h',
    badge: 'Suomen vanhin taidemuseo',
    themes: ['taide'],
  },
  {
    nameKey: 'designmuseo',
    hook: 'Suomalainen muotoiluhistoria — Marimekkosta Nokiaan (vuodesta 1894)',
    duration: '1.5 h',
    themes: ['taide'],
  },

  // ── Ulkoilu ─────────────────────────────────────────────
  {
    nameKey: 'sibelius-monumentti',
    hook: '600 teräsputkea — muistomerkki säveltäjä Jean Sibeliukselle (1967)',
    duration: '20–30 min',
    themes: ['ulkoilu', 'ilmainen'],
  },
  {
    nameKey: 'pihlajasaari',
    hook: 'Helsinkiläisten kesäsuosikki — hiekkaranta ja kallioita lautalla 10 min',
    duration: '3–6 h',
    themes: ['ulkoilu'],
  },

  // ── Perhe ───────────────────────────────────────────────
  {
    nameKey: 'linnanmäki',
    hook: 'Suomen suosituin huvipuisto, yli 40 laitetta — perustettu 1950',
    duration: '4–6 h',
    badge: 'Suomen vanhin',
    themes: ['perhe'],
  },
  {
    nameKey: 'korkeasaari',
    hook: 'Saarieläintarha, yksi maailman vanhimmista — lautalla Kauppatorilta (1889)',
    duration: '3–4 h',
    tip: 'Lautalla 20 min Kauppatorilta — HSL-lippu käy.',
    badge: 'Perustettu 1889',
    themes: ['perhe', 'ulkoilu'],
  },
  {
    nameKey: 'heureka',
    hook: 'Interaktiivinen tiedekeskus koko perheelle — planetaariumelokuvia',
    duration: '3–5 h',
    themes: ['perhe'],
  },
]

// ── Lookup helper ─────────────────────────────────────────

const _lookup: [string, AttractionHighlight][] = ATTRACTION_HIGHLIGHTS.map(h => [h.nameKey.toLowerCase(), h])

export function getHighlight(name: string): AttractionHighlight | undefined {
  if (!name) return undefined
  const lower = name.toLowerCase()
  for (const [key, h] of _lookup) {
    if (lower.includes(key) || key.includes(lower)) return h
  }
  return undefined
}
