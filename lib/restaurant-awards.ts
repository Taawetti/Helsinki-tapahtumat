// Helsinki restaurant awards & curated editorial data
// Michelin Guide Nordic Countries 2025 — published June 2025
// Source: guide.michelin.com + PRNewswire + Helsinki Partners

// ── Michelin Stars ────────────────────────────────────────
export const MICHELIN_STARS: Record<string, number> = {
  'Palace': 2,
  'Grön': 1,
  'Finnjävel Salonki': 1,
  'Demo': 1,
  'Olo': 1,
}

// Bib Gourmand — excellent food at moderate prices
export const BIB_GOURMAND = new Set<string>([
  '305',
  'Bona Fide',
  'Nolla',
  'plein',
])

// Michelin Green Star — sustainability leaders
export const GREEN_MICHELIN = new Set<string>([
  'Grön',
  'Nolla',
  'Natura',
  'Nokka',
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
    note: 'Helsingin ainoa 2 Michelin tähden ravintola, Palace-hotellin 10. kerroksessa merellä.',
    noteEn: "Helsinki's only 2-Michelin-star restaurant, on the 10th floor of Hotel Palace overlooking the sea.",
    priceHint: 4,
    cuisineHint: 'Pohjoismainen fine dining',
    cuisineHintEn: 'Nordic fine dining',
  },
  {
    name: 'Grön',
    badge: '⭐ Michelin • Green Star • Vuoden ravintola 2024',
    badgeEn: '⭐ Michelin • Green Star • Restaurant of the Year 2024',
    note: 'Kasvipainotteinen fine dining — Chef Toni Kostiaisen luomus, Suomen arvostetuimpia kasvispainotteisia.',
    noteEn: 'Plant-forward fine dining — Chef Toni Kostiainen\'s creation, one of Finland\'s most acclaimed vegetable-focused restaurants.',
    priceHint: 4,
    cuisineHint: 'Kasvis / Pohjoismainen',
    cuisineHintEn: 'Vegetable / Nordic',
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

export const CRITIC_PICKS: CriticPick[] = [
  {
    name: 'Palace',
    source: 'Michelin Guide',
    snippet: 'Hallittu tekniikka, upeat raaka-aineet, merinäköala — täydellinen 2 tähtien kokemus.',
    snippetEn: 'Masterful technique, superb ingredients, sea views — a perfect 2-star experience.',
    year: 2025,
    stars: 5,
  },
  {
    name: 'Grön',
    source: 'Michelin Guide + ProHotelli',
    snippet: 'Kasvisruoka ei ole koskaan ollut näin jännittävää. Vuoden ravintola 2024.',
    snippetEn: 'Vegetable cooking has never been this exciting. Restaurant of the Year 2024.',
    year: 2024,
    stars: 5,
  },
  {
    name: 'Olo',
    source: 'Michelin Guide',
    snippet: 'Merinäköala ja pohjoismainen tarkkuus — Olo on Helsingin kauneimmin sijoittunut fine dining.',
    snippetEn: 'Sea views and Nordic precision — Olo is Helsinki\'s most beautifully situated fine dining.',
    year: 2025,
    stars: 5,
  },
  {
    name: 'Nolla',
    source: 'Michelin Guide',
    snippet: 'Nolla todistaa että kestävyys ja gastronominen kunnianhimo kulkevat käsi kädessä.',
    snippetEn: 'Nolla proves that sustainability and gastronomic ambition go hand in hand.',
    year: 2025,
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
    year: 2025,
    stars: 5,
  },
]
