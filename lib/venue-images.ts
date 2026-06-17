import { unstable_cache } from 'next/cache'

// ── Wikipedia thumbnail fetcher ───────────────────────────
// Wikipedia REST API always returns a correct CDN thumbnail URL.
// Much more reliable than guessing Wikimedia Commons filenames.

async function fetchWikiThumb(article: string): Promise<string | null> {
  for (const lang of ['en', 'fi']) {
    try {
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article)}`,
        {
          headers: { 'User-Agent': 'Helsinki-tapahtumat/1.0 (https://github.com/Taawetti/Helsinki-tapahtumat)' },
          signal: AbortSignal.timeout(6000),
        }
      )
      if (!res.ok) continue
      const d = await res.json()
      const url = d.originalimage?.source ?? d.thumbnail?.source ?? null
      if (url) return url
    } catch { /* try next lang */ }
  }
  return null
}

// ── Venue → Wikipedia article title ──────────────────────
// Keys are lowercase venue name substrings (longest match wins).
// Values are English Wikipedia article titles (URL-encoded spaces as _).

const VENUE_WIKI: [string, string][] = [
  // Sports & arenas
  ['olympiastadion',           'Olympic_Stadium_(Helsinki)'],
  ['olympic stadium',          'Olympic_Stadium_(Helsinki)'],
  ['hartwall',                 'Hartwall_Arena'],
  ['bolt arena',               'Bolt_Arena_(Helsinki)'],
  ['markku.fi areena',         'Metro_Areena'],
  ['espoo metro areena',       'Metro_Areena'],

  // Live music
  ['tavastia',                 'Tavastia_Club'],
  ['kaapelitehdas',            'Cable_Factory,_Helsinki'],
  ['cable factory',            'Cable_Factory,_Helsinki'],
  ['korjaamo',                 'Korjaamo'],
  ['kulttuuritalo',            'Helsinki_Workers%27_Hall'],
  ['on the rocks',             'On_the_Rocks_(nightclub)'],
  ['nosturi',                  'Nosturi'],

  // Classical & theatre
  ['kansallisteatteri',        'Finnish_National_Theatre'],
  ['national theatre',         'Finnish_National_Theatre'],
  ['kansallisooppera',         'Finnish_National_Opera'],
  ['ooppera',                  'Finnish_National_Opera'],
  ['musiikkitalo',             'Helsinki_Music_Centre'],
  ['music centre',             'Helsinki_Music_Centre'],
  ['kaupunginteatteri',        'Helsinki_City_Theatre'],
  ['svenska teatern',          'Swedish_Theatre,_Helsinki'],
  ['aleksanterin teatteri',    'Alexander_Theatre_(Helsinki)'],
  ['finlandia',                'Finlandia_Hall'],

  // Museums & art
  ['kiasma',                   'Kiasma'],
  ['ateneum',                  'Ateneum'],
  ['kansallismuseo',           'National_Museum_of_Finland'],
  ['designmuseo',              'Design_Museum_(Helsinki)'],
  ['tennispalatsi',            'Tennispalatsi'],
  ['sinebrychoff',             'Sinebrychoff_Art_Museum'],
  ['amos rex',                 'Amos_Rex'],

  // Attractions
  ['linnanmäki',               'Linnanmäki'],
  ['korkeasaari',              'Korkeasaari'],
  ['suomenlinna',              'Suomenlinna'],
  ['heureka',                  'Heureka_(science_centre)'],
  ['messukeskus',              'Helsinki_Exhibition_%26_Convention_Centre'],

  // Markets
  ['kauppahalli',              'Old_Market_Hall,_Helsinki'],
  ['hakaniemen',               'Hakaniemi_market_hall'],
]

// Category fallback: Wikipedia articles for well-known Helsinki landmarks
const CATEGORY_WIKI: [string, string][] = [
  ['music',      'Helsinki_Music_Centre'],
  ['club',       'Tavastia_Club'],
  ['classical',  'Helsinki_Music_Centre'],
  ['theatre',    'Finnish_National_Theatre'],
  ['standup',    'Cable_Factory,_Helsinki'],
  ['art',        'Kiasma'],
  ['food',       'Old_Market_Hall,_Helsinki'],
  ['sports',     'Olympic_Stadium_(Helsinki)'],
  ['outdoor',    'Suomenlinna'],
  ['kids',       'Linnanmäki'],
  ['networking', 'Helsinki_Exhibition_%26_Convention_Centre'],
  ['festival',   'Senate_Square'],
]

// ── Cached fetch of all venue + category images ───────────

async function _fetchAllImages(): Promise<{ venues: Record<string, string>; categories: Record<string, string> }> {
  const allEntries = [
    ...VENUE_WIKI.map(([k, a]) => ({ key: k, article: a, type: 'venue' as const })),
    ...CATEGORY_WIKI.map(([k, a]) => ({ key: k, article: a, type: 'category' as const })),
  ]

  const results = await Promise.allSettled(
    allEntries.map(async e => ({ ...e, url: await fetchWikiThumb(e.article) }))
  )

  const venues: Record<string, string> = {}
  const categories: Record<string, string> = {}

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.url) {
      if (r.value.type === 'venue') venues[r.value.key] = r.value.url
      else categories[r.value.key] = r.value.url
    }
  }

  return { venues, categories }
}

// Cache for 7 days — Wikipedia thumbnails are stable
export const fetchImagesCached = unstable_cache(_fetchAllImages, ['venue-wiki-images-v3'], {
  revalidate: 604800,
  tags: ['venue-images'],
})

// Finnish LinkedEvents keyword → English category key
const FI_TO_CAT: Record<string, string> = {
  'musiikki': 'music', 'konsertti': 'music', 'jazz': 'music', 'rock': 'music',
  'pop': 'music', 'keikka': 'music',
  'teatteri': 'theatre', 'sirkus': 'theatre', 'näyttely': 'theatre',
  'tanssi': 'classical', 'ooppera': 'classical', 'klassinen': 'classical',
  'baleetti': 'classical',
  'stand-up': 'standup', 'komedia': 'standup', 'huumori': 'standup',
  'kuvataide': 'art', 'taide': 'art', 'galleria': 'art', 'elokuvat': 'art',
  'kirjallisuus': 'art', 'valokuva': 'art',
  'ruoka': 'food', 'juoma': 'food', 'ravintola': 'food',
  'urheilu': 'sports', 'liikunta': 'sports', 'jääkiekko': 'sports',
  'jalkapallo': 'sports', 'juoksu': 'sports', 'kilpailu': 'sports',
  'ulkoilu': 'outdoor', 'luonto': 'outdoor', 'retkeily': 'outdoor',
  'lapset': 'kids', 'perhe': 'kids', 'nuoret': 'kids',
  'festivaali': 'festival', 'juhla': 'festival',
  'messut': 'networking', 'seminaari': 'networking', 'verkostoituminen': 'networking',
  'klubit': 'club', 'yöelämä': 'club', 'dj': 'club',
}

// ── Sync lookup (uses pre-fetched cache) ──────────────────

export function getEventImage(
  venueName: string | null | undefined,
  categories: string[],
  venueMap: Record<string, string>,
  categoryMap: Record<string, string>,
): string | null {
  if (venueName) {
    const key = venueName.toLowerCase().trim()
    let best: string | null = null
    let bestLen = 0
    for (const [pattern, url] of Object.entries(venueMap)) {
      if (key.includes(pattern) && pattern.length > bestLen) {
        best = url
        bestLen = pattern.length
      }
    }
    if (best) return best
  }

  for (const cat of categories) {
    const lower = cat.toLowerCase()
    // 1. Direct match (English keys)
    if (categoryMap[lower]) return categoryMap[lower]
    // 2. Finnish → English mapping
    const mapped = FI_TO_CAT[lower]
    if (mapped && categoryMap[mapped]) return categoryMap[mapped]
    // 3. Substring match against Finnish keywords
    for (const [fi, en] of Object.entries(FI_TO_CAT)) {
      if (lower.includes(fi) && categoryMap[en]) return categoryMap[en]
    }
  }

  return null
}
