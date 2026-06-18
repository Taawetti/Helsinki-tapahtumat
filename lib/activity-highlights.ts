import type { ActivityCategory } from './types'

export type TouristTheme = 'historia' | 'sauna' | 'taide' | 'ulkoilu' | 'perhe' | 'ilmainen'

export interface AttractionHighlight {
  nameKey: string
  hook: string
  hookEn?: string
  duration?: string
  tip?: string
  tipEn?: string
  badge?: string
  badgeEn?: string
  themes: TouristTheme[]
}

export const TOURIST_THEME_META: Record<TouristTheme, {
  label: string; emoji: string; shortDesc: string; shortDescEn: string
}> = {
  historia: { label: 'Historia',        emoji: '🏛', shortDesc: 'Suomenlinna, kirkot…',       shortDescEn: 'Suomenlinna, churches…'       },
  sauna:    { label: 'Sauna',           emoji: '🧖', shortDesc: 'Löyly, Allas, Kotiharju…',   shortDescEn: 'Löyly, Allas, Kotiharju…'    },
  taide:    { label: 'Taide & museot',  emoji: '🎨', shortDesc: 'Ateneum, Kiasma, Amos Rex…', shortDescEn: 'Ateneum, Kiasma, Amos Rex…'  },
  ulkoilu:  { label: 'Ulkoilu',         emoji: '🌿', shortDesc: 'Saaret, rannat, puistot…',   shortDescEn: 'Islands, beaches, parks…'    },
  perhe:    { label: 'Lapset mukana',   emoji: '🎠', shortDesc: 'Linnanmäki, Korkeasaari…',   shortDescEn: 'Linnanmäki, Korkeasaari…'    },
  ilmainen: { label: 'Ilmaiseksi',      emoji: '🆓', shortDesc: 'Kirkot, puistot, rannat…',   shortDescEn: 'Churches, parks, beaches…'   },
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
    hookEn: "Helsinki's oldest operating public sauna (1928)",
    duration: '1–2 h',
    tip: 'Puulämmitteinen — tule arkisin, viikonloppuisin jonoja.',
    tipEn: 'Wood-fired — visit on weekdays, queues on weekends.',
    badge: 'Vanhin julkinen sauna',
    badgeEn: 'Oldest public sauna',
    themes: ['sauna'],
  },
  {
    nameKey: 'löyly',
    hook: 'Palkittu design-sauna merellä, Hernesaaressa',
    hookEn: 'Award-winning design sauna by the sea in Hernesaari',
    duration: '2–3 h',
    tip: 'Varaa aika etukäteen verkosta — etenkin viikonloppuisin.',
    tipEn: 'Book online in advance — especially on weekends.',
    themes: ['sauna'],
  },
  {
    nameKey: 'allas sea pool',
    hook: 'Meriallas kaupungin sydämessä — kolme allasta ja sauna',
    hookEn: 'Sea pool in the heart of the city — three pools and a sauna',
    duration: '2–3 h',
    themes: ['sauna', 'ulkoilu'],
  },
  {
    nameKey: 'kulttuurisauna',
    hook: 'Arkkitehtoninen julkinen sauna merenrannalla Hernesaaressa',
    hookEn: 'Architectural public sauna on the seafront in Hernesaari',
    duration: '1–2 h',
    themes: ['sauna'],
  },
  {
    nameKey: 'sauna hermanni',
    hook: 'Perinteinen lähiösauna puulämmitteisellä kiukaalla — Kallio',
    hookEn: 'Traditional neighbourhood sauna with wood-fired stove — Kallio',
    duration: '1–2 h',
    themes: ['sauna'],
  },

  // ── Historia ────────────────────────────────────────────
  {
    nameKey: 'suomenlinna',
    hook: 'Unescon maailmanperintökohde — lautalla 15 min Kauppatorilta',
    hookEn: 'UNESCO World Heritage site — ferry 15 min from Market Square',
    duration: '3–5 h',
    tip: 'HSL-lippu käy lautalla. Kesällä guide-kierroksia englanniksi.',
    tipEn: 'HSL ticket works on the ferry. Guided tours in English in summer.',
    badge: 'UNESCO',
    badgeEn: 'UNESCO',
    themes: ['historia', 'ulkoilu'],
  },
  {
    nameKey: 'temppeliaukion kirkko',
    hook: 'Ainoa kirkko maailmassa, joka on louhittu suoraan kallioon (1969)',
    hookEn: 'The only church in the world carved directly into bedrock (1969)',
    duration: '30–45 min',
    tip: 'Parhaat valokuvat iltapäivällä — aurinko paistaa kupuun.',
    tipEn: 'Best photos in the afternoon — sunlight streams through the dome.',
    badge: 'Ainutlaatuinen',
    badgeEn: 'One of a kind',
    themes: ['historia'],
  },
  {
    nameKey: 'kansallismuseo',
    hook: 'Suomen historian kattavin kokoelma esihistoriasta nykypäivään',
    hookEn: "Finland's most comprehensive history collection — prehistory to the present",
    duration: '2–3 h',
    themes: ['historia', 'taide'],
  },
  {
    nameKey: 'vanha kauppahalli',
    hook: 'Arkkitehtuuriltaan suojeltu kauppahalli — ruokakulttuuria vuodesta 1889',
    hookEn: 'Heritage-listed market hall — food culture since 1889',
    duration: '1 h',
    badge: 'Perustettu 1889',
    badgeEn: 'Est. 1889',
    themes: ['historia', 'ilmainen'],
  },
  {
    nameKey: 'kauppahalli',
    hook: 'Arkkitehtuuriltaan suojeltu kauppahalli — ruokakulttuuria vuodesta 1889',
    hookEn: 'Heritage-listed market hall — food culture since 1889',
    duration: '1 h',
    badge: 'Perustettu 1889',
    badgeEn: 'Est. 1889',
    themes: ['historia', 'ilmainen'],
  },
  {
    nameKey: 'hakaniemen kauppahalli',
    hook: 'Rakennettiin Euroopan suurimmaksi kauppahallille vuonna 1914',
    hookEn: 'Built as Europe\'s largest market hall in 1914',
    duration: '1 h',
    badge: 'Vuodelta 1914',
    badgeEn: 'Since 1914',
    themes: ['historia'],
  },
  {
    nameKey: 'uspenski',
    hook: 'Pohjois-Euroopan suurin ortodoksinen kirkko — 700 000 tiiltä (1868)',
    hookEn: "Northern Europe's largest Orthodox cathedral — 700 000 bricks (1868)",
    duration: '30–45 min',
    badge: 'Pohjois-Euroopan suurin',
    badgeEn: 'Largest in Northern Europe',
    themes: ['historia', 'ilmainen'],
  },
  {
    nameKey: 'tuomiokirkko',
    hook: 'Helsingin ikoninen valkoinen katedraali Senaatintorilla (1852)',
    hookEn: "Helsinki's iconic white cathedral on Senate Square (1852)",
    duration: '20–30 min',
    themes: ['historia', 'ilmainen'],
  },
  {
    nameKey: 'seurasaari',
    hook: 'Ulkoilmamuseo — 87 siirrettyä historiallista rakennusta eri puolilta Suomea',
    hookEn: 'Open-air museum — 87 relocated historic buildings from across Finland',
    duration: '2–4 h',
    themes: ['historia', 'ulkoilu', 'ilmainen'],
  },

  // ── Taide ───────────────────────────────────────────────
  {
    nameKey: 'ateneum',
    hook: 'Suomen suurin taidekokoelma — kultakausi ja mestarit',
    hookEn: "Finland's largest art collection — the Golden Age masters",
    duration: '2–3 h',
    badge: 'Suomen tärkein',
    badgeEn: "Finland's most important",
    themes: ['taide'],
  },
  {
    nameKey: 'kiasma',
    hook: 'Nykytaidemuseo Steven Hollin ikonisessa kaarirakenuksessa (1998)',
    hookEn: "Contemporary art museum in Steven Holl's iconic arched building (1998)",
    duration: '1.5–2 h',
    themes: ['taide'],
  },
  {
    nameKey: 'amos rex',
    hook: 'Kokeellinen taidemuseo maan alla — interaktiivisia installaatioita (2018)',
    hookEn: 'Experimental underground art museum — interactive installations (2018)',
    duration: '1.5–2 h',
    themes: ['taide'],
  },
  {
    nameKey: 'ham helsinki',
    hook: 'Helsingin kaupungin taidemuseo — nykytaidetta Tennispalatsissa',
    hookEn: 'Helsinki City Art Museum — contemporary art in the Tennis Palace',
    duration: '1.5–2 h',
    themes: ['taide'],
  },
  {
    nameKey: 'sinebrychoff',
    hook: 'Suomen vanhin taidemuseo — eurooppalainen taide 1700–1800-luvuilta',
    hookEn: "Finland's oldest art museum — European art from the 18th–19th centuries",
    duration: '1.5 h',
    badge: 'Suomen vanhin taidemuseo',
    badgeEn: "Finland's oldest art museum",
    themes: ['taide'],
  },
  {
    nameKey: 'designmuseo',
    hook: 'Suomalainen muotoiluhistoria — Marimekkosta Nokiaan (vuodesta 1894)',
    hookEn: 'Finnish design history — from Marimekko to Nokia (since 1894)',
    duration: '1.5 h',
    themes: ['taide'],
  },

  // ── Ulkoilu ─────────────────────────────────────────────
  {
    nameKey: 'sibelius-monumentti',
    hook: '600 teräsputkea — muistomerkki säveltäjä Jean Sibeliukselle (1967)',
    hookEn: '600 steel pipes — monument to composer Jean Sibelius (1967)',
    duration: '20–30 min',
    themes: ['ulkoilu', 'ilmainen'],
  },
  {
    nameKey: 'pihlajasaari',
    hook: 'Helsinkiläisten kesäsuosikki — hiekkaranta ja kallioita lautalla 10 min',
    hookEn: "Helsinki's favourite summer island — sandy beach and rocks, 10 min by ferry",
    duration: '3–6 h',
    themes: ['ulkoilu'],
  },

  // ── Perhe ───────────────────────────────────────────────
  {
    nameKey: 'linnanmäki',
    hook: 'Suomen suosituin huvipuisto, yli 40 laitetta — perustettu 1950',
    hookEn: "Finland's most popular amusement park, 40+ rides — founded 1950",
    duration: '4–6 h',
    badge: 'Suomen vanhin',
    badgeEn: "Finland's oldest",
    themes: ['perhe'],
  },
  {
    nameKey: 'korkeasaari',
    hook: 'Saarieläintarha, yksi maailman vanhimmista — lautalla Kauppatorilta (1889)',
    hookEn: 'Island zoo, one of the world\'s oldest — ferry from Market Square (1889)',
    duration: '3–4 h',
    tip: 'Lautalla 20 min Kauppatorilta — HSL-lippu käy.',
    tipEn: 'Ferry 20 min from Market Square — HSL ticket valid.',
    badge: 'Perustettu 1889',
    badgeEn: 'Est. 1889',
    themes: ['perhe', 'ulkoilu'],
  },
  {
    nameKey: 'heureka',
    hook: 'Interaktiivinen tiedekeskus koko perheelle — planetaariumelokuvia',
    hookEn: 'Interactive science centre for the whole family — planetarium shows',
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
