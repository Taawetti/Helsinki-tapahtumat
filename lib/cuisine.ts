// Google-kategoria → oma keittiökategoria. Siirretty kuolleesta
// enrich-restaurant-cuisines-reitistä; käytössä ravintoloiden yhdistetyssä
// rikastuksessa (enrich-restaurants-all).

const GOOGLE_TO_CUISINE: [RegExp, string][] = [
  [/japanese|sushi|ramen|izakaya|yakitori|tempura|tonkatsu|udon|soba|teppanyaki/i,  'japanese'],
  [/indian|curry|tandoori|biryani|nepalese|nepali|pakistani|bangladeshi|sri.?lankan|himalayan/i, 'indian'],
  [/thai|vietnamese|korean|chinese|asian|wok|pan.?asian|dim.?sum|malaysian|indonesian|cantonese|szechuan|burmese/i, 'asian'],
  [/pizza|pizzeria/i,                                                                 'pizza'],
  [/italian|pasta|trattoria|ristorante|osteria/i,                                     'italian'],
  [/kebab|turkish/i,                                                                                                          'kebab'],
  [/middle.?eastern|arabic|shawarma|falafel|lebanese|persian|syrian|iranian|iraqi|jordanian|yemeni|halal.?restaurant/i,     'middle_eastern'],
  [/ethiopian|eritrean|somali|moroccan|north.?african|west.?african|tunisian|algerian|nigerian|kenyan|ghanaian|african.?restaurant/i, 'african'],
  [/burger|hamburger|american/i,                                                       'burger'],
  [/mexican|tex.?mex|latin.?american|taco/i,                                           'mexican'],
  [/mediterranean|greek|spanish|tapas|portuguese/i,                                    'mediterranean'],
  [/french|bistro|brasserie/i,                                                          'french'],
  [/seafood|fish.?restaurant|lobster/i,                                                 'seafood'],
  [/steak|steakhouse|grill/i,                                                           'steak'],
  [/nordic|scandinavian|finnish/i,                                                      'nordisk'],
  [/vegetarian|vegan/i,                                                                 'veggie'],
]

export function googleCategoriesToCuisine(cats: string[]): string[] {
  const result = new Set<string>()
  for (const cat of cats) {
    for (const [regex, cuisine] of GOOGLE_TO_CUISINE) {
      if (regex.test(cat)) {
        result.add(cuisine)
        break
      }
    }
  }
  return [...result]
}
