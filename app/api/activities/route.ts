import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import type { Activity, ActivityCategory } from '@/lib/types'
import { fetchImagesCached, getEventImage } from '@/lib/venue-images'

interface OSMElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// ── Category mapping from OSM tags ───────────────────────

function osmCategory(tags: Record<string, string>): ActivityCategory {
  const tourism = tags.tourism
  const leisure = tags.leisure
  const natural = tags.natural
  const amenity = tags.amenity

  if (leisure === 'sauna' || amenity === 'sauna') return 'sauna'
  if (tourism === 'museum') return 'museo'
  if (tourism === 'gallery') return 'galleria'
  if (tourism === 'viewpoint') return 'nakopaikka'
  if (natural === 'beach' || leisure === 'swimming_area' || leisure === 'swimming_pool') return 'uimaranta'
  if (leisure === 'park' || leisure === 'garden' || leisure === 'nature_reserve') return 'puisto'
  if (amenity === 'marketplace') return 'markkina'
  if (leisure === 'sports_centre' || leisure === 'pitch' || leisure === 'fitness_centre') return 'urheilu'
  if (tourism === 'attraction') return 'nahtavyys'
  if (tourism === 'zoo' || leisure === 'amusement_park' || amenity === 'library') return 'muu'
  return 'muu'
}

function osmDescription(tags: Record<string, string>, cat: ActivityCategory): string {
  // Return a human-readable category label in Finnish
  const labels: Record<ActivityCategory, string> = {
    sauna:      'Julkinen sauna',
    museo:      'Museo',
    nahtavyys:  'Nähtävyys',
    galleria:   'Taidegalleria',
    nakopaikka: 'Näköalapaikka',
    uimaranta:  'Uimaranta / uimapaikka',
    puisto:     'Puisto / luontoalue',
    markkina:   'Kauppahalli / tori',
    urheilu:    'Urheilupaikka',
    muu:        'Aktiviteetti',
  }
  // Append sauna fuel info
  if (cat === 'sauna' && tags['sauna:fuel']) {
    const fuel = tags['sauna:fuel']
    const fuelFi = fuel === 'wood' ? 'puusauna' : fuel === 'electric' ? 'sähkösauna' : fuel
    return `Julkinen sauna — ${fuelFi}`
  }
  // Append specific attraction subtype if available
  if (tags.historic) return `Historiallinen kohde (${tags.historic})`
  return labels[cat]
}

function osmAddress(tags: Record<string, string>): string {
  const street = tags['addr:street'] ?? ''
  const num = tags['addr:housenumber'] ?? ''
  return street ? `${street}${num ? ` ${num}` : ''}` : ''
}

// ── OSM Overpass query ────────────────────────────────────
// Helsinki+Espoo+Vantaa bbox: south,west,north,east

const BBOX = '60.09,24.58,60.41,25.26'

// Fetch nodes AND ways (museums, parks etc. are often mapped as closed ways)
const OSM_QUERY = `[out:json][timeout:35][bbox:${BBOX}];
(
  node["leisure"~"^(sauna|swimming_area|swimming_pool|park|garden|nature_reserve|sports_centre|fitness_centre|amusement_park)$"]["name"];
  node["amenity"~"^(sauna|marketplace|library)$"]["name"];
  node["tourism"~"^(museum|attraction|gallery|viewpoint|zoo)$"]["name"];
  node["natural"="beach"]["name"];
  way["tourism"~"^(museum|attraction|gallery|zoo)$"]["name"];
  way["leisure"~"^(park|garden|nature_reserve|sports_centre|amusement_park)$"]["name"];
  way["amenity"~"^(marketplace|library)$"]["name"];
  way["natural"="beach"]["name"];
);
out center;`

const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const OSM_HEADERS = {
  'User-Agent': 'Helsinki-Tapahtumat/1.0 (https://github.com/Taawetti/Helsinki-tapahtumat)',
  'Accept': 'application/json',
}

// Places that are OSM relations (not nodes/ways) or otherwise missed by the query.
// These are always injected unless the OSM query already returned them by name.
const SUPPLEMENT: Activity[] = [
  { id: 'supplement-suomenlinna',    name: 'Suomenlinna',           description: 'Merilinnoitus',   category: 'nahtavyys', address: 'Suomenlinna',              city: 'Helsinki', lat: 60.1454, lon: 24.9881, www: 'https://www.suomenlinna.fi',        phone: null, image: null, fee: false,     outdoor: true  },
  { id: 'supplement-loyly',          name: 'Löyly',                 description: 'Julkinen sauna',  category: 'sauna',     address: 'Hernesaarenranta 4',       city: 'Helsinki', lat: 60.1551, lon: 24.9140, www: 'https://loylyhelsinki.fi',          phone: null, image: null, fee: true      },
  { id: 'supplement-allas',          name: 'Allas Sea Pool',        description: 'Merikylpylä',     category: 'uimaranta', address: 'Katajanokanlaituri 2a',    city: 'Helsinki', lat: 60.1671, lon: 24.9563, www: 'https://allasseapool.fi',           phone: null, image: null, fee: true      },
  { id: 'supplement-kansallismuseo', name: 'Kansallismuseo',        description: 'Museo',           category: 'museo',     address: 'Mannerheimintie 34',       city: 'Helsinki', lat: 60.1733, lon: 24.9316, www: 'https://www.kansallismuseo.fi',     phone: null, image: null, fee: true      },
  { id: 'supplement-ham',            name: 'HAM Helsinki',          description: 'Taidegalleria',   category: 'galleria',  address: 'Eteläinen Rautatiekatu 8', city: 'Helsinki', lat: 60.1635, lon: 24.9332, www: 'https://hamhelsinki.fi',            phone: null, image: null, fee: true      },
]

async function _fetchActivities(): Promise<Activity[]> {
  const url = `?data=${encodeURIComponent(OSM_QUERY)}`

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror + url, {
        headers: OSM_HEADERS,
        signal: AbortSignal.timeout(40000),
      })
      if (!res.ok) continue

      const data: { elements: OSMElement[] } = await res.json()
      const seen = new Set<string>()
      const results: Activity[] = []

      for (const el of data.elements ?? []) {
        const tags = el.tags ?? {}
        const name = tags.name || tags['name:fi'] || ''
        if (!name) continue

        const lat = el.type === 'node' ? el.lat : el.center?.lat
        const lon = el.type === 'node' ? el.lon : el.center?.lon
        if (!lat || !lon) continue

        // Deduplicate by name + rough location
        const key = `${name.toLowerCase()}|${Math.round(lat * 1000)}|${Math.round(lon * 1000)}`
        if (seen.has(key)) continue
        seen.add(key)

        const cat = osmCategory(tags)

        // Skip non-public swimming pools
        if ((tags.leisure === 'swimming_pool' || tags.amenity === 'swimming_pool') && tags.access === 'private') continue
        // Skip private saunas
        if (cat === 'sauna' && tags.access === 'private') continue

        results.push({
          id: `act-${el.type[0]}${el.id}`,
          name,
          description: osmDescription(tags, cat),
          category: cat,
          address: osmAddress(tags),
          city: tags['addr:city'] ?? '',
          lat,
          lon,
          www: tags.website ?? tags.url ?? tags['contact:website'] ?? null,
          phone: tags.phone ?? tags['contact:phone'] ?? null,
          openingHours: tags.opening_hours ?? undefined,
          image: null,
          fee: tags.fee === 'yes' ? true : tags.fee === 'no' ? false : undefined,
          charge: tags.charge ?? tags.entrance_fee ?? undefined,
          wheelchair: tags.wheelchair === 'yes' ? true : tags.wheelchair === 'no' ? false : undefined,
          saunaFuel: tags['sauna:fuel'] ?? undefined,
          outdoor: tags.indoor === 'no' ? true : undefined,
          wikidata: tags.wikidata ?? undefined,
          wikipedia: tags.wikipedia ?? undefined,
        })
      }

      // Inject supplement places (OSM relations / hard-to-query) unless already present
      const nameSet = new Set(results.map(r => r.name.toLowerCase()))
      for (const s of SUPPLEMENT) {
        if (!nameSet.has(s.name.toLowerCase())) results.push(s)
      }

      // Sort: wikipedia/wikidata entries first (more notable), then by name
      results.sort((a, b) => {
        const aScore = (a.wikipedia ? 2 : 0) + (a.wikidata ? 1 : 0) + (a.www ? 1 : 0)
        const bScore = (b.wikipedia ? 2 : 0) + (b.wikidata ? 1 : 0) + (b.www ? 1 : 0)
        if (aScore !== bScore) return bScore - aScore
        return a.name.localeCompare(b.name, 'fi')
      })

      // Assign images: venue name match first, then category fallback
      const { venues: venueMap } = await fetchImagesCached()
      for (const act of results) {
        // Only assign image if the venue name matches a known Wikipedia entry.
        // Category fallbacks are omitted — they make every park/museum look identical.
        act.image = getEventImage(act.name, [act.category], venueMap, {})
      }

      console.log(`[activities] OSM: ${results.length} results from ${mirror}`)
      return results
    } catch (err) {
      console.warn(`[activities] OSM mirror ${mirror} failed:`, (err as Error).message)
    }
  }

  console.error('[activities] All OSM mirrors failed')
  return []
}

export const fetchActivitiesCached = unstable_cache(_fetchActivities, ['activities-osm-v1'], {
  revalidate: 86400,
  tags: ['activities'],
})

export async function GET() {
  const activities = await fetchActivitiesCached()

  // Build category counts
  const categoryCount: Record<string, number> = {}
  for (const a of activities) {
    categoryCount[a.category] = (categoryCount[a.category] ?? 0) + 1
  }

  return NextResponse.json({
    activities,
    total: activities.length,
    categoryCount,
  })
}
