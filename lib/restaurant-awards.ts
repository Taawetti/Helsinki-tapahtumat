// Helsinki restaurant awards & curated editorial data
// Michelin Guide Finland 2025 — verify at guide.michelin.com/fi

// ── Michelin Stars ────────────────────────────────────────
// Stars awarded for 2025 season; updated when Michelin Guide Finland publishes
export const MICHELIN_STARS: Record<string, number> = {
  'Palace': 2,
  'Grön': 1,
  'Chef & Sommelier': 1,
  'Spis': 1,
  'Finnjävel Salonki': 1,
  'Finnjävel Kantakrouvi': 1,
  'Ora': 1,
  'Demo': 1,
}

// Bib Gourmand — excellent food at moderate prices
export const BIB_GOURMAND = new Set<string>([
  'Farang',
  'Gaijin',
  'Smör',
  'Pastis',
  'Aino',
])

// Michelin Green Star — sustainability leaders
export const GREEN_MICHELIN = new Set<string>([
  'Grön',
  'Nolla',
])

// ── National awards ───────────────────────────────────────
// Vuoden Ravintola (Restaurant of the Year) — ProHotelli / MaRa
export const RESTAURANT_OF_YEAR: Record<number, string> = {
  2025: 'Palace',
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
    badge: '⭐ Michelin • Vuoden ravintola 2024',
    badgeEn: '⭐ Michelin • Restaurant of the Year 2024',
    note: 'Kasvipainotteinen fine dining — Chef Toni Kostiaisen luomus, Suomen arvostetuimpia kasvispainotteisia.',
    noteEn: 'Plant-forward fine dining — Chef Toni Kostiainen\'s creation, one of Finland\'s most acclaimed vegetable-focused restaurants.',
    priceHint: 4,
    cuisineHint: 'Kasvis / Pohjoismainen',
    cuisineHintEn: 'Vegetable / Nordic',
  },
  {
    name: 'Chef & Sommelier',
    badge: '⭐ Michelin tähti',
    badgeEn: '⭐ Michelin Star',
    note: 'Moderni pohjoismainen keittiö ja poikkeuksellinen viinivalikoima Punavuoressa.',
    noteEn: 'Modern Nordic cuisine and an exceptional wine selection in Punavuori.',
    priceHint: 4,
    cuisineHint: 'Pohjoismainen fine dining',
    cuisineHintEn: 'Nordic fine dining',
  },
  {
    name: 'Spis',
    badge: '⭐ Michelin tähti',
    badgeEn: '⭐ Michelin Star',
    note: 'Intiimi ruotsalais-suomalainen fine dining -ravintola Kruununhaassa.',
    noteEn: 'Intimate Swedish-Finnish fine dining restaurant in Kruununhaka.',
    priceHint: 4,
    cuisineHint: 'Pohjoismainen',
    cuisineHintEn: 'Nordic',
  },
  {
    name: 'Ora',
    badge: '⭐ Michelin tähti',
    badgeEn: '⭐ Michelin Star',
    note: 'Innovatiivinen fine dining Punavuoressa, moderneja makuja ja tekniikoita.',
    noteEn: 'Innovative fine dining in Punavuori — modern flavours and techniques.',
    priceHint: 4,
    cuisineHint: 'Pohjoismainen fine dining',
    cuisineHintEn: 'Nordic fine dining',
  },
  {
    name: 'Farang',
    badge: '😊 Bib Gourmand',
    note: 'Rohkea aasialainen fuusio ravintola, yksi Helsingin rakastetuimmista paikoista.',
    noteEn: "Bold Asian fusion restaurant — one of Helsinki's most beloved dining spots.",
    priceHint: 3,
    cuisineHint: 'Aasialainen fuusio',
    cuisineHintEn: 'Asian fusion',
  },
  {
    name: 'Gaijin',
    badge: '😊 Bib Gourmand',
    note: 'Japanilainen ja pohjoismainen keittiö yhdistyy — konsepti joka toimii täydellisesti.',
    noteEn: 'Japanese and Nordic cuisines combined — a concept that works perfectly.',
    priceHint: 3,
    cuisineHint: 'Japanilainen / Pohjoismainen',
    cuisineHintEn: 'Japanese / Nordic',
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
    name: 'Farang',
    source: 'Helsingin Sanomat',
    snippet: 'Farang on edelleen se paikka, jonne kaikki haluavat mennä lounaalle tai illalliselle.',
    snippetEn: 'Farang is still the place everyone wants to go for lunch or dinner.',
    year: 2024,
    stars: 4,
  },
  {
    name: 'Chef & Sommelier',
    source: 'Michelin Guide',
    snippet: 'Pohjoismaisen keittiön mestariteos — viinit ovat aivan omaa luokkaansa.',
    snippetEn: 'A masterpiece of Nordic cuisine — the wines are in a class of their own.',
    year: 2025,
    stars: 5,
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
    name: 'Gaijin',
    source: 'Nyt.fi',
    snippet: 'Fuusio toimii: japanilainen tarkkuus ja pohjoismaiset raaka-aineet sulautuvat täydellisesti.',
    snippetEn: 'The fusion works: Japanese precision and Nordic ingredients blend perfectly.',
    year: 2024,
    stars: 4,
  },
]
