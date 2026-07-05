// Helsinki restaurant awards & curated editorial data
// Michelin Guide Nordic Countries 2026 — published June 2026
// Source: guide.michelin.com/fi/en/uusimaa/helsinki/restaurants

// ── Michelin Stars ────────────────────────────────────────
export const MICHELIN_STARS: Record<string, number> = {
  'Palace': 2,
  'Grön': 2,          // upgraded from 1 star in 2026
  'Boreal': 1,        // new 2026
  'Finnjävel Salonki': 1,
  'Demo': 1,
  'Olo': 1,
}

// Bib Gourmand — excellent food at moderate prices
export const BIB_GOURMAND = new Set<string>([
  '305',
  'Bona Fide',
  'Nolla',
])

// Michelin Green Star — sustainability leaders
export const GREEN_MICHELIN = new Set<string>([
  'Grön',
  'Nolla',
  'Natura',
])

// ── National awards ───────────────────────────────────────
// Vuoden Ravintola (Restaurant of the Year) — ProHotelli / MaRa
export const RESTAURANT_OF_YEAR: Record<number, string> = {
  2024: 'Grön',
  2023: 'Nolla',
}

// ── Curated editorial picks ───────────────────────────────
export interface FeaturedPick {
  name: string
  badge: string     // short award text for the badge
  badgeEn?: string
  note: string      // 1-sentence editorial description
  noteEn?: string
  priceHint: 1 | 2 | 3 | 4
  cuisineHint: string
  cuisineHintEn?: string
}

export const FEATURED_PICKS: FeaturedPick[] = [
  {
    name: 'Palace',
    badge: '⭐⭐ 2 Michelin tähteä',
    badgeEn: '⭐⭐ 2 Michelin Stars',
    note: 'Palace-hotellin 10. kerroksessa merellä — pohjoismaiseen fine diningiin erikoistunut Helsingin kruunu.',
    noteEn: 'On the 10th floor of Hotel Palace overlooking the sea — Helsinki\'s crown jewel of Nordic fine dining.',
    priceHint: 4,
    cuisineHint: 'Pohjoismainen fine dining',
    cuisineHintEn: 'Nordic fine dining',
  },
  {
    name: 'Grön',
    badge: '⭐⭐ 2 Michelin tähteä • Green Star • Vuoden ravintola 2024',
    badgeEn: '⭐⭐ 2 Michelin Stars • Green Star • Restaurant of the Year 2024',
    note: 'Kasvipainotteinen fine dining — Toni Kostiainen nosti Grönin Suomen arvostetuimmaksi ravintolaksi 2 Michelin tähdellä.',
    noteEn: 'Plant-forward fine dining — Toni Kostiainen elevated Grön to Finland\'s most acclaimed restaurant with 2 Michelin stars.',
    priceHint: 4,
    cuisineHint: 'Kasvis / Pohjoismainen',
    cuisineHintEn: 'Vegetable / Nordic',
  },
  {
    name: 'Boreal',
    badge: '⭐ Michelin tähti (uusi 2026)',
    badgeEn: '⭐ Michelin Star (new 2026)',
    note: 'Helsingin uusin Michelin-tähtiravintola — pohjoinen luonto ja kausiluonteisuus ohjaavat jokaista annosta.',
    noteEn: 'Helsinki\'s newest Michelin-starred restaurant — northern nature and seasonality guide every dish.',
    priceHint: 4,
    cuisineHint: 'Pohjoismainen fine dining',
    cuisineHintEn: 'Nordic fine dining',
  },
  {
    name: 'Finnjävel Salonki',
    badge: '⭐ Michelin tähti',
    badgeEn: '⭐ Michelin Star',
    note: 'Suomalainen fine dining parhaimmillaan — perinteinen kotimainen keittiö modernisti tulkittuna.',
    noteEn: 'Finnish fine dining at its best — traditional Finnish cuisine with a modern interpretation.',
    priceHint: 4,
    cuisineHint: 'Suomalainen fine dining',
    cuisineHintEn: 'Finnish fine dining',
  },
  {
    name: 'Demo',
    badge: '⭐ Michelin tähti',
    badgeEn: '⭐ Michelin Star',
    note: 'Helsingin pitkäikäisin Michelin-tähtiravintola — luova pohjoismainen keittiö Töölössä.',
    noteEn: "Helsinki's longest-running Michelin-starred restaurant — creative Nordic cuisine in Töölö.",
    priceHint: 4,
    cuisineHint: 'Pohjoismainen fine dining',
    cuisineHintEn: 'Nordic fine dining',
  },
  {
    name: 'Olo',
    badge: '⭐ Michelin tähti',
    badgeEn: '⭐ Michelin Star',
    note: 'Pohjoismainen fine dining Etelärannassa — merellinen tunnelma ja huolellisesti valitut raaka-aineet.',
    noteEn: 'Nordic fine dining on the South Harbour — maritime atmosphere and carefully sourced ingredients.',
    priceHint: 4,
    cuisineHint: 'Pohjoismainen fine dining',
    cuisineHintEn: 'Nordic fine dining',
  },
  {
    name: 'Nolla',
    badge: '😊 Bib Gourmand • 🌿 Green Star',
    badgeEn: '😊 Bib Gourmand • 🌿 Green Star',
    note: 'Nolla-hukka-ravintola — kestävän gastronomian edelläkävijä, lähes täysin jätteettömästi toimiva.',
    noteEn: 'Zero-waste restaurant — pioneer of sustainable gastronomy, operating with near-zero waste.',
    priceHint: 3,
    cuisineHint: 'Pohjoismainen / Kestävä',
    cuisineHintEn: 'Nordic / Sustainable',
  },
  {
    name: 'Sea Horse',
    badge: '🏛 Helsingin ikoni (1934)',
    badgeEn: '🏛 Helsinki icon (1934)',
    note: 'Suomalainen klassikko vuodesta 1934 — perinteinen suomalainen kotiruoka ikonisessa miljöössä.',
    noteEn: 'Finnish classic since 1934 — traditional Finnish home cooking in an iconic setting.',
    priceHint: 2,
    cuisineHint: 'Suomalainen perinneruoka',
    cuisineHintEn: 'Traditional Finnish',
  },
]

// ── Critic review snippets ────────────────────────────────
// Curated editorial notes — shown as "Kriitikko suosittelee"
export interface CriticPick {
  name: string
  source: string     // publication name
  snippet: string    // short quote
  snippetEn?: string
  year: number
  stars?: number     // 1-5 if source gives stars
}

// ── Curated hero images ───────────────────────────────────
// Fallback images for Michelin restaurants missing an OSM image tag.
// Sources: official restaurant websites and press-published photography.
export const CURATED_IMAGES: Record<string, string> = {
  'Palace': 'https://cdn.sanity.io/images/teesc9i2/production/14b2f41315b60ca7088ccd1b2ca340bb3d3ab8fc-3000x2000.jpg?w=1600&h=1067&fit=max',
  'Grön': 'https://i0.wp.com/eatweekguide.com/wp-content/uploads/2024/07/eatweekguide.com-gron-05-1.jpg?fit=1920%2C1280&ssl=1',
  'Boreal': 'https://hospitalitysnapshots.com/wp-content/uploads/sites/3/2026/02/210A1027-1200x800-compact.jpg',
  'Demo': 'https://www.restaurantdemo.fi/wp-content/uploads/2026/01/5-1.png',
  'Olo': 'https://i0.wp.com/eatweekguide.com/wp-content/uploads/2020/02/4cc34099-3801-4a45-ad18-d101a70d2f91-1.jpg?fit=1600%2C1067&ssl=1',
  'Finnjävel Salonki': 'https://finnjavel.fi/wp-content/uploads/2025/10/SALONKI-1.png',
}

export const CRITIC_PICKS: CriticPick[] = [
  {
    name: 'Palace',
    source: 'Michelin Guide',
    snippet: 'Hallittu tekniikka, upeat raaka-aineet, merinäköala — täydellinen 2 tähtien kokemus.',
    snippetEn: 'Masterful technique, superb ingredients, sea views — a perfect 2-star experience.',
    year: 2026,
    stars: 5,
  },
  {
    name: 'Grön',
    source: 'Michelin Guide 2026',
    snippet: 'Historiallinen nousu 2 tähdelle — Grön on nyt Suomen ehdottomasti arvostetuimpia ravintoloita.',
    snippetEn: 'A historic rise to 2 stars — Grön is now undisputedly one of Finland\'s most acclaimed restaurants.',
    year: 2026,
    stars: 5,
  },
  {
    name: 'Boreal',
    source: 'Michelin Guide 2026',
    snippet: 'Uusi tähti Helsingin taivaalle — Boreal toi pohjoisen tunnelman ja kausiluonteisuuden fine diningiin.',
    snippetEn: 'A new star on Helsinki\'s firmament — Boreal brought northern atmosphere and seasonality to fine dining.',
    year: 2026,
    stars: 5,
  },
  {
    name: 'Olo',
    source: 'Michelin Guide',
    snippet: 'Merinäköala ja pohjoismainen tarkkuus — Olo on Helsingin kauneimmin sijoittunut fine dining.',
    snippetEn: 'Sea views and Nordic precision — Olo is Helsinki\'s most beautifully situated fine dining.',
    year: 2026,
    stars: 5,
  },
  {
    name: 'Nolla',
    source: 'Michelin Guide',
    snippet: 'Nolla todistaa että kestävyys ja gastronominen kunnianhimo kulkevat käsi kädessä.',
    snippetEn: 'Nolla proves that sustainability and gastronomic ambition go hand in hand.',
    year: 2026,
    stars: 4,
  },
  {
    name: 'Sea Horse',
    source: 'Helsingin Sanomat',
    snippet: 'Paikka joka ei muutu eikä sen tarvitsekaan. Silakkapihvi ja loimulohta vuodesta 1934.',
    snippetEn: "A place that doesn't change — and doesn't need to. Baltic herring and salmon since 1934.",
    year: 2024,
    stars: 4,
  },
  {
    name: 'Demo',
    source: 'Michelin Guide',
    snippet: 'Vuodesta 2004 Michelin-tähdellä — Demo on Helsingin fine diningin tinkimätön veteraani.',
    snippetEn: 'Michelin-starred since 2004 — Demo is the uncompromising veteran of Helsinki fine dining.',
    year: 2026,
    stars: 5,
  },
]
