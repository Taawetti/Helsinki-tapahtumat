// Wikimedia Commons Special:FilePath URLs work without knowing the MD5 hash path.
// Format: https://commons.wikimedia.org/wiki/Special:FilePath/FILENAME?width=N
// Browser follows the redirect; if the file doesn't exist the img onError fallback handles it.

const WC = (file: string, w = 900) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`

// ── Venue image map ───────────────────────────────────────
// Keys are lowercase venue name substrings — longest match wins.

export const VENUE_IMAGES: [string, string][] = [
  // ── Sports & arenas
  ['olympiastadion',           WC('Helsinki_Olympic_Stadium.jpg')],
  ['olympic stadium',          WC('Helsinki_Olympic_Stadium.jpg')],
  ['hartwall',                 WC('Hartwall_Arena.jpg')],
  ['bolt arena',               WC('Bolt_Arena_Helsinki.jpg')],
  ['markku.fi areena',         WC('Metro_Areena_2010.jpg')],
  ['espoo metro areena',       WC('Metro_Areena_2010.jpg')],
  ['hietalahden uimastadion',  WC('Hietaniemi_beach_Helsinki.jpg')],

  // ── Live music
  ['tavastia',                 WC('Tavastia_Helsinki.jpg')],
  ['nosturi',                  WC('Nosturi_Helsinki.jpg')],
  ['kaapelitehdas',            WC('Kaapelitehdas_Helsinki.jpg')],
  ['cable factory',            WC('Kaapelitehdas_Helsinki.jpg')],
  ['circus helsinki',          WC('Circus_Helsinki.jpg')],
  ['on the rocks',             WC('On_The_Rocks_Helsinki.jpg')],
  ['korjaamo',                 WC('Korjaamo_Helsinki.jpg')],
  ['kulttuuritalo',            WC('Kulttuuritalo_Helsinki.jpg')],
  ['savoy',                    WC('Savoy_Theatre_Helsinki.jpg')],
  ['logomo',                   WC('Logomo_Turku.jpg')],

  // ── Classical & theatre
  ['kansallisteatteri',        WC('Finnish_National_Theatre.jpg')],
  ['national theatre',         WC('Finnish_National_Theatre.jpg')],
  ['kansallisooppera',         WC('Finnish_National_Opera_House.jpg')],
  ['ooppera',                  WC('Finnish_National_Opera_House.jpg')],
  ['musiikkitalo',             WC('Helsinki_Music_Centre.jpg')],
  ['music centre',             WC('Helsinki_Music_Centre.jpg')],
  ['kaupunginteatteri',        WC('Helsinki_City_Theatre.jpg')],
  ['city theatre',             WC('Helsinki_City_Theatre.jpg')],
  ['svenska teatern',          WC('Swedish_Theatre_Helsinki.jpg')],
  ['svenska theater',          WC('Swedish_Theatre_Helsinki.jpg')],
  ['aleksanterin teatteri',    WC('Alexander_Theatre_Helsinki.jpg')],
  ['alexander theatre',        WC('Alexander_Theatre_Helsinki.jpg')],
  ['finlandia-talo',           WC('Finlandia_Hall_Helsinki.jpg')],
  ['finlandia hall',           WC('Finlandia_Hall_Helsinki.jpg')],

  // ── Museums & art
  ['kiasma',                   WC('Kiasma_Museum_Helsinki.jpg')],
  ['ateneum',                  WC('Ateneum_Helsinki.jpg')],
  ['kansallismuseo',           WC('National_Museum_of_Finland.jpg')],
  ['national museum',          WC('National_Museum_of_Finland.jpg')],
  ['designmuseo',              WC('Design_Museum_Helsinki.jpg')],
  ['design museum',            WC('Design_Museum_Helsinki.jpg')],
  ['ham helsinki',             WC('Tennispalatsi_Helsinki.jpg')],
  ['tennispalatsi',            WC('Tennispalatsi_Helsinki.jpg')],
  ['sinebrychoff',             WC('Sinebrychoff_Art_Museum_Helsinki.jpg')],
  ['espoo museo',              WC('Espoo_Museum_of_Modern_Art.jpg')],
  ['emma',                     WC('Espoo_Museum_of_Modern_Art.jpg')],
  ['wäinö aaltosen museo',     WC('Wäinö_Aaltosen_museo.jpg')],

  // ── Attractions & outdoor
  ['linnanmäki',               WC('Linnanmäki_Helsinki.jpg')],
  ['korkeasaari',              WC('Korkeasaari_zoo.jpg')],
  ['suomenlinna',              WC('Suomenlinna_Helsinki_aerial.jpg')],
  ['sea life',                 WC('Sea_Life_Helsinki.jpg')],
  ['heureka',                  WC('Heureka_science_center.jpg')],
  ['kauppatori',               WC('Helsinki_Market_Square.jpg')],

  // ── Markets
  ['kauppahalli',              WC('Helsinki_Old_Market_Hall.jpg')],
  ['old market hall',          WC('Helsinki_Old_Market_Hall.jpg')],
  ['hakaniemen',               WC('Hakaniemi_market_hall_Helsinki.jpg')],
  ['hietalahden',              WC('Hietalahti_Market_Hall_Helsinki.jpg')],

  // ── Conference & exhibition
  ['messukeskus',              WC('Messukeskus_Helsinki.jpg')],
  ['exhibition centre',        WC('Messukeskus_Helsinki.jpg')],
  ['dipoli',                   WC('Dipoli_Espoo.jpg')],
]

// ── Category fallback images ──────────────────────────────
// Keyed by CATEGORIES id from lib/types.ts

export const CATEGORY_IMAGES: Record<string, string> = {
  music:      WC('Musiikkitalo_Helsinki.jpg'),
  club:       WC('Helsinki_night_city.jpg'),
  classical:  WC('Helsinki_Music_Centre.jpg'),
  theatre:    WC('Finnish_National_Theatre.jpg'),
  standup:    WC('Kaapelitehdas_Helsinki.jpg'),
  art:        WC('Kiasma_Museum_Helsinki.jpg'),
  food:       WC('Helsinki_Old_Market_Hall.jpg'),
  sports:     WC('Helsinki_Olympic_Stadium.jpg'),
  outdoor:    WC('Helsinki_harbour_panorama.jpg'),
  kids:       WC('Linnanmäki_Helsinki.jpg'),
  networking: WC('Messukeskus_Helsinki.jpg'),
  festival:   WC('Helsinki_Market_Square.jpg'),
}

// ── Lookup function ───────────────────────────────────────

export function getEventImage(
  venueName: string | null | undefined,
  categories: string[],
): string | null {
  if (venueName) {
    const key = venueName.toLowerCase().trim()
    // Find the longest matching venue key
    let best: string | null = null
    let bestLen = 0
    for (const [pattern, url] of VENUE_IMAGES) {
      if (key.includes(pattern) && pattern.length > bestLen) {
        best = url
        bestLen = pattern.length
      }
    }
    if (best) return best
  }

  // Category fallback
  for (const cat of categories) {
    if (CATEGORY_IMAGES[cat]) return CATEGORY_IMAGES[cat]
  }

  return null
}
