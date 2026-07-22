export interface EventLocation {
  name: string
  streetAddress: string
  city: string
  lat?: number
  lon?: number
}

export interface Event {
  id: string
  title: string
  shortDescription: string
  description: string
  startTime: string
  endTime: string | null
  location: EventLocation | null
  image: string | null
  isFree: boolean
  price: string | null
  ticketUrl: string | null
  infoUrl: string | null
  categories: string[]
  source: string
}

// Per-source fetch status from /api/events — powers the freshness badge and admin health panel
export interface SourceStatus {
  name: string
  ok: boolean
  count: number
}

export type DateFilter = 'today' | 'tonight' | 'tomorrow' | 'weekend' | 'week' | 'month' | 'custom' | 'range'
export type ViewMode = 'list' | 'map'
export type PriceFilter = 'all' | 'free' | 'paid'

// ── NEIGHBORHOODS ──────────────────────────────────────
export interface Neighborhood {
  id: string
  name: string
  vibe: string          // short descriptor
  emoji: string
  color: string         // tailwind gradient classes
  bbox: string          // "min_lon,min_lat,max_lon,max_lat" for Linked Events API
  municipality: string
}

export const NEIGHBORHOODS: Neighborhood[] = [
  // Helsinki
  { id: 'kallio',      name: 'Kallio',       vibe: 'baarit · keikkat · indie',       emoji: '🍺', color: 'from-green-900/80 to-emerald-800/60',    bbox: '24.935,60.175,24.968,60.198', municipality: 'helsinki' },
  { id: 'punavuori',   name: 'Punavuori',    vibe: 'cocktailit · design · yöelämä',  emoji: '🍸', color: 'from-fuchsia-900/80 to-pink-800/60',      bbox: '24.930,60.153,24.962,60.172', municipality: 'helsinki' },
  { id: 'keskusta',    name: 'Keskusta',     vibe: 'kaikki · bileet · ravintolat',   emoji: '🌃', color: 'from-blue-900/80 to-indigo-800/60',       bbox: '24.925,60.160,24.960,60.180', municipality: 'helsinki' },
  { id: 'kamppi',      name: 'Kamppi',       vibe: 'yökerhot · mainstage',           emoji: '🎉', color: 'from-violet-900/80 to-purple-800/60',     bbox: '24.920,60.163,24.944,60.178', municipality: 'helsinki' },
  { id: 'sornäinen',   name: 'Sörnäinen',    vibe: 'underground · pop-up · teollisuus', emoji: '⚡', color: 'from-orange-900/80 to-amber-800/60',  bbox: '24.955,60.180,24.984,60.198', municipality: 'helsinki' },
  { id: 'hakaniemi',   name: 'Hakaniemi',    vibe: 'perinteiset baarit · tori',      emoji: '🏪', color: 'from-amber-900/80 to-yellow-800/60',     bbox: '24.944,60.174,24.972,60.190', municipality: 'helsinki' },
  { id: 'toolo',       name: 'Töölö',        vibe: 'kulttuuri · ravintolat · puisto', emoji: '🌿', color: 'from-teal-900/80 to-cyan-800/60',       bbox: '24.905,60.168,24.940,60.192', municipality: 'helsinki' },
  { id: 'vallila',     name: 'Vallila',      vibe: 'foodie · craft beer · uusi',     emoji: '🍔', color: 'from-lime-900/80 to-green-800/60',       bbox: '24.950,60.192,24.986,60.212', municipality: 'helsinki' },
  { id: 'kruununhaka', name: 'Kruununhaka',  vibe: 'cozy · viinikellari · historia', emoji: '🏛', color: 'from-rose-900/80 to-red-800/60',         bbox: '24.944,60.168,24.974,60.182', municipality: 'helsinki' },
  { id: 'hermanni',    name: 'Hermanni',     vibe: 'nouseva · brewpub · loft',       emoji: '🔥', color: 'from-red-900/80 to-orange-800/60',       bbox: '24.958,60.193,24.992,60.214', municipality: 'helsinki' },
  // Espoo
  { id: 'tapiola',     name: 'Tapiola',      vibe: 'kulttuuri · Espoo-keskus',       emoji: '🎭', color: 'from-cyan-900/80 to-sky-800/60',         bbox: '24.790,60.168,24.828,60.192', municipality: 'espoo' },
  { id: 'leppavaara',  name: 'Leppävaara',   vibe: 'ravintolat · shoppailu',         emoji: '🛍', color: 'from-slate-800/80 to-zinc-700/60',       bbox: '24.795,60.215,24.840,60.240', municipality: 'espoo' },
  // Vantaa
  { id: 'tikkurila',   name: 'Tikkurila',    vibe: 'Vantaa-keskus · tapahtumat',     emoji: '🎪', color: 'from-indigo-900/80 to-blue-800/60',      bbox: '25.028,60.283,25.072,60.312', municipality: 'vantaa' },
]

// ── NIGHTLIFE VIBES ────────────────────────────────────
// Replaces generic categories as primary filter for nightlife-focused use
export interface Vibe {
  id: string
  label: string
  tKey: string
  emoji: string
  keywords: string[]
  searchText?: string
}

export const VIBES: Vibe[] = [
  { id: 'keikka',    label: 'Keikka',           tKey: 'vibe.keikka',   emoji: '🎸', keywords: ['keikka', 'konsertti', 'live', 'bändi', 'musiikki', 'music'] },
  { id: 'yoelama',   label: 'Yöelämä',           tKey: 'vibe.yoelama',  emoji: '🌙', keywords: ['yökerho', 'night', 'nightclub', 'cocktail', 'after party', 'afterparty', 'bileet', 'bileissä', 'disko', 'rave'] },
  { id: 'baari',     label: 'Baari / Pub',       tKey: 'vibe.baari',    emoji: '🍺', keywords: ['baari', 'pub', 'bar', 'olut', 'beer', 'drinkki', 'shot', 'viini', 'wine', 'lounge', 'taproom', 'pint'] },
  { id: 'urheilu',   label: 'Urheilu',           tKey: 'vibe.urheilu',  emoji: '⚽', keywords: ['urheilu', 'jääkiekko', 'jalkapallo', 'koripallo', 'liikunta', 'ottelu', 'sports', 'match'] },
  { id: 'standup',   label: 'Stand up',          tKey: 'vibe.standup',  emoji: '😂', keywords: ['stand up', 'komedia', 'comedy'] },
  { id: 'museo',     label: 'Museo',             tKey: 'vibe.museo',    emoji: '🏛', keywords: ['museo', 'museon', 'museum', 'historia', 'perinne', 'kokoelma'] },
  { id: 'lapset',    label: 'Lapset & Perhe',    tKey: 'vibe.lapset',   emoji: '👨‍👩‍👧', keywords: ['lapsi', 'lapset', 'perhe', 'lasten', 'nuoret', 'nuoriso', 'koululais', 'kids', 'family', 'children'] },
  { id: 'tyopaja',   label: 'Työpaja & Kurssi',  tKey: 'vibe.tyopaja',  emoji: '🛠', keywords: ['työpaja', 'kurssi', 'workshop', 'opetus', 'oppiminen', 'koulutus', 'luento', 'harjoitus'] },
  { id: 'teatteri',  label: 'Teatteri & Tanssi', tKey: 'vibe.teatteri', emoji: '🎭', keywords: ['teatteri', 'tanssi', 'esitys', 'näytelmä', 'ooppera', 'baletti', 'sirkus', 'impro', 'theatre', 'dance', 'performance'] },
  { id: 'taide',     label: 'Taide',             tKey: 'vibe.taide',    emoji: '🎨', keywords: ['taide', 'galleria', 'näyttely', 'kuvataide', 'valokuva', 'art', 'gallery', 'exhibition', 'design'] },
  { id: 'festivaali', label: 'Festivaali',       tKey: 'vibe.festivaali', emoji: '🎪', keywords: ['festivaali', 'festival', 'festarit', 'fest'] },
  { id: 'underground', label: 'Underground',     tKey: 'vibe.underground', emoji: '🔦', keywords: ['underground', 'rave', 'diy', 'kellari', 'vaihtoehto', 'kokeellinen', 'noise', 'punk'] },
]

// ── COLLECTIONS ────────────────────────────────────────
export interface Collection {
  id: string
  title: string
  subtitle: string
  emoji: string
  dateFilter: DateFilter
  categoryIds: string[]
  priceFilter: PriceFilter
  color: string
  searchKeyword?: string
}

export const COLLECTIONS: Collection[] = [
  { id: 'keikka',   title: 'Keikkamap',           subtitle: 'Live-musiikkia tänä iltana',      emoji: '🎸', dateFilter: 'tonight', categoryIds: ['music'],           priceFilter: 'all',  color: 'from-fuchsia-950 to-violet-900',  searchKeyword: 'keikka' },
  { id: 'urheilu',  title: 'Urheilu',              subtitle: 'Ottelut, pelit & tapahtumat',     emoji: '⚽', dateFilter: 'today',   categoryIds: ['sports'],         priceFilter: 'all',  color: 'from-blue-950 to-sky-900',        searchKeyword: 'urheilu' },
  { id: 'klubi',    title: 'Klubi & DJ',           subtitle: 'Tanssii aamuun',                  emoji: '🎧', dateFilter: 'tonight', categoryIds: ['club'],           priceFilter: 'all',  color: 'from-violet-950 to-indigo-900',   searchKeyword: 'klubi' },
  { id: 'free',     title: 'Ilmaiseksi tänään',    subtitle: 'Hyvää menoa ilman kuluja',        emoji: '🎁', dateFilter: 'today',   categoryIds: [],                 priceFilter: 'free', color: 'from-emerald-950 to-teal-900' },
  { id: 'weekend',  title: 'Viikonloppu',           subtitle: 'Lauantai & sunnuntai',            emoji: '🎉', dateFilter: 'weekend', categoryIds: [],                 priceFilter: 'all',  color: 'from-violet-950 to-purple-900' },
  { id: 'food',     title: 'Ruoka & juoma',         subtitle: 'Illalliset, pop-up, ruokatorit',  emoji: '🍝', dateFilter: 'week',    categoryIds: ['food'],           priceFilter: 'all',  color: 'from-lime-950 to-green-900',      searchKeyword: 'ravintola' },
]

// ── CATEGORIES (kept for API mapping) ─────────────────
export interface Category {
  id: string
  label: string
  emoji: string
  color: string
  keywords: string[]
}

export const CATEGORIES: Category[] = [
  { id: 'music',      label: 'Musiikki',          emoji: '🎵', color: 'from-violet-900 to-purple-800',  keywords: ['musiikki', 'keikka', 'konsertti', 'music', 'bändi'] },
  { id: 'club',       label: 'Klubit & DJ',        emoji: '🎧', color: 'from-fuchsia-900 to-pink-800',   keywords: ['klubi', 'dj', 'club', 'disco', 'tanssi', 'yökerho'] },
  { id: 'classical',  label: 'Klassinen',          emoji: '🎹', color: 'from-amber-900 to-yellow-800',   keywords: ['klassinen', 'ooppera', 'sinfonia', 'orkesteri'] },
  { id: 'theatre',    label: 'Teatteri',           emoji: '🎭', color: 'from-red-900 to-rose-800',       keywords: ['teatteri', 'esitys', 'näytelmä', 'musical'] },
  { id: 'standup',    label: 'Stand up',           emoji: '😂', color: 'from-orange-900 to-amber-800',   keywords: ['stand up', 'komedia', 'comedy'] },
  { id: 'art',        label: 'Taide',              emoji: '🎨', color: 'from-teal-900 to-cyan-800',      keywords: ['taide', 'näyttely', 'museo', 'galleria'] },
  { id: 'food',       label: 'Ruoka & juoma',      emoji: '🍷', color: 'from-lime-900 to-green-800',     keywords: ['ruoka', 'juoma', 'ravintola', 'viini', 'olut'] },
  { id: 'sports',     label: 'Urheilu',            emoji: '⚽', color: 'from-blue-900 to-sky-800',       keywords: ['urheilu', 'liikunta', 'jalkapallo', 'jääkiekko'] },
  { id: 'outdoor',    label: 'Ulkoilma',           emoji: '🌿', color: 'from-emerald-900 to-teal-800',   keywords: ['ulkoilma', 'luonto', 'puisto'] },
  { id: 'kids',       label: 'Lapsille',           emoji: '🧸', color: 'from-pink-900 to-rose-800',      keywords: ['lapset', 'perhe', 'children', 'kids'] },
  { id: 'networking', label: 'Verkostoituminen',   emoji: '💼', color: 'from-slate-800 to-zinc-700',     keywords: ['verkostoituminen', 'networking', 'startup'] },
  { id: 'festival',   label: 'Festivaalit',        emoji: '🎪', color: 'from-yellow-900 to-orange-800',  keywords: ['festivaali', 'festival', 'juhla', 'avajaiset'] },
]

// ── RESTAURANTS ────────────────────────────────────────
export interface Restaurant {
  id: string
  name: string
  description: string       // raw OSM cuisine string (human-readable)
  cuisines: string[]        // parsed cuisine values, e.g. ['pizza', 'italian']
  cuisineCategories: string[] // mapped category IDs for filtering
  address: string
  city: string
  lat?: number
  lon?: number
  image: string | null
  www: string | null
  phone: string | null
  email?: string | null
  instagram?: string | null
  type: 'ravintola' | 'kahvila' | 'baari' | 'yokerho' | 'pikaruoka' | 'muu'
  priceRange?: 1 | 2 | 3 | 4   // 1=€ 2=€€ 3=€€€ 4=€€€€
  openingHours?: string         // opening_hours (OSM format; Google-sourced when hoursSource='google')
  hoursSource?: 'google' | 'osm' // provenance of openingHours — Google is fresher
  michelinStars?: number        // 1, 2 or 3
  bibGourmand?: boolean
  greenMichelin?: boolean
  michelinRecommended?: boolean // Michelin Plate — in the guide without a star
  awards?: string[]             // e.g. ['Vuoden ravintola 2024']
  featured?: boolean
  outdoorSeating?: boolean
  takeaway?: boolean
  googleRating?: number
  reviewCount?: number
  subCategories?: string[]
  // "Mistä paikassa on kyse" -esittely: kuratoitu toimitusteksti tai Googlen
  // tiivistelmä. Ei koskaan generoitua tekstiä — puuttuva blurb jätetään pois.
  blurb?: string
  blurbEn?: string
}

// ── ACTIVITIES ─────────────────────────────────────────
export type ActivityCategory =
  | 'sauna'
  | 'museo'
  | 'nahtavyys'
  | 'galleria'
  | 'nakopaikka'
  | 'uimaranta'
  | 'puisto'
  | 'markkina'
  | 'urheilu'
  | 'muu'

export interface Activity {
  id: string
  name: string
  description: string        // short human-readable summary
  category: ActivityCategory
  address: string
  city: string
  lat?: number
  lon?: number
  www: string | null
  phone: string | null
  openingHours?: string
  image: string | null
  fee?: boolean
  charge?: string
  wheelchair?: boolean
  saunaFuel?: string         // 'wood' | 'electric' etc. (for saunas)
  outdoor?: boolean
  wikidata?: string
  wikipedia?: string
}

export const SEARCH_SUGGESTIONS = [
  'jazz',
  'stand up',
  'rock',
  'tango',
  'ooppera',
  'baletti',
  'elektroninen',
  'folk',
  'gospel',
  'sushi',
  'sauna',
  'Kallio',
]
