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
  note: string      // 1-sentence editorial description
  priceHint: 1 | 2 | 3 | 4
  cuisineHint: string
}

export const FEATURED_PICKS: FeaturedPick[] = [
  {
    name: 'Palace',
    badge: '⭐⭐ 2 Michelin tähteä',
    note: 'Helsingin ainoa 2 Michelin tähden ravintola, Palace-hotellin 10. kerroksessa merellä.',
    priceHint: 4,
    cuisineHint: 'Pohjoismainen fine dining',
  },
  {
    name: 'Grön',
    badge: '⭐ Michelin • Vuoden ravintola 2024',
    note: 'Kasvipainotteinen fine dining — Chef Toni Kostiaisen luomus, Suomen arvostetuimpia kasvispainotteisia.',
    priceHint: 4,
    cuisineHint: 'Kasvis / Pohjoismainen',
  },
  {
    name: 'Chef & Sommelier',
    badge: '⭐ Michelin tähti',
    note: 'Moderni pohjoismainen keittiö ja poikkeuksellinen viinivalikoima Punavuoressa.',
    priceHint: 4,
    cuisineHint: 'Pohjoismainen fine dining',
  },
  {
    name: 'Spis',
    badge: '⭐ Michelin tähti',
    note: 'Intiimi ruotsalais-suomalainen fine dining -ravintola Kruununhaassa.',
    priceHint: 4,
    cuisineHint: 'Pohjoismainen',
  },
  {
    name: 'Ora',
    badge: '⭐ Michelin tähti',
    note: 'Innovatiivinen fine dining Punavuoressa, moderneja makuja ja tekniikoita.',
    priceHint: 4,
    cuisineHint: 'Pohjoismainen fine dining',
  },
  {
    name: 'Farang',
    badge: '😊 Bib Gourmand',
    note: 'Rohkea aasialainen fuusio ravintola, yksi Helsingin rakastetuimmista paikoista.',
    priceHint: 3,
    cuisineHint: 'Aasialainen fuusio',
  },
  {
    name: 'Gaijin',
    badge: '😊 Bib Gourmand',
    note: 'Japanilainen ja pohjoismainen keittiö yhdistyy — konsepti joka toimii täydellisesti.',
    priceHint: 3,
    cuisineHint: 'Japanilainen / Pohjoismainen',
  },
  {
    name: 'Sea Horse',
    badge: '🏛 Helsingin ikoni (1934)',
    note: 'Suomalainen klassikko vuodesta 1934 — perinteinen suomalainen kotiruoka ikonisessa miljöössä.',
    priceHint: 2,
    cuisineHint: 'Suomalainen perinneruoka',
  },
]

// ── Critic review snippets ────────────────────────────────
// Curated editorial notes — shown as "Kriitikko suosittelee"
export interface CriticPick {
  name: string
  source: string     // publication name
  snippet: string    // short quote
  year: number
  stars?: number     // 1-5 if source gives stars
}

export const CRITIC_PICKS: CriticPick[] = [
  {
    name: 'Palace',
    source: 'Michelin Guide',
    snippet: 'Hallittu tekniikka, upeat raaka-aineet, merinäköala — täydellinen 2 tähtien kokemus.',
    year: 2025,
    stars: 5,
  },
  {
    name: 'Grön',
    source: 'Michelin Guide + ProHotelli',
    snippet: 'Kasvisruoka ei ole koskaan ollut näin jännittävää. Vuoden ravintola 2024.',
    year: 2024,
    stars: 5,
  },
  {
    name: 'Farang',
    source: 'Helsingin Sanomat',
    snippet: 'Farang on edelleen se paikka, jonne kaikki haluavat mennä lounaalle tai illalliselle.',
    year: 2024,
    stars: 4,
  },
  {
    name: 'Chef & Sommelier',
    source: 'Michelin Guide',
    snippet: 'Pohjoismaisen keittiön mestariteos — viinit ovat aivan omaa luokkaansa.',
    year: 2025,
    stars: 5,
  },
  {
    name: 'Sea Horse',
    source: 'Helsingin Sanomat',
    snippet: 'Paikka joka ei muutu eikä sen tarvitsekaan. Silakkapihvi ja loimulohta vuodesta 1934.',
    year: 2024,
    stars: 4,
  },
  {
    name: 'Gaijin',
    source: 'Nyt.fi',
    snippet: 'Fuusio toimii: japanilainen tarkkuus ja pohjoismaiset raaka-aineet sulautuvat täydellisesti.',
    year: 2024,
    stars: 4,
  },
]
