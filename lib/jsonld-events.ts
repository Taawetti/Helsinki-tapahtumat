// JSON-LD-first -extractori: parsii schema.org/Event-objektit sivun
// <script type="application/ld+json"> -lohkoista. Huomattavasti robustimpi
// kuin HTML-regex — TEC (The Events Calendar) ja useimmat tapahtumateemat
// tulostavat nämä automaattisesti. Käyttö: festivaalien muutosvahti +
// venue-scraping (ennen regex-fallbackia).

export interface JsonLdEvent {
  title: string
  startDate?: string
  endDate?: string
  url?: string
  image?: string
  locationName?: string
  description?: string
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [v]
}

// Rekursiivinen kerääjä: @type: "Event" -objektit (myös @graph- ja listarakenteet)
function collectEvents(node: unknown, out: JsonLdEvent[], depth: number): void {
  if (depth > 6 || !node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectEvents(item, out, depth + 1)
    return
  }
  const obj = node as Record<string, unknown>
  const types = asArray(obj['@type']).map(t => String(t).toLowerCase())
  if (types.includes('event')) {
    const loc = obj.location as Record<string, unknown> | undefined
    const image = obj.image
    out.push({
      title: String(obj.name ?? ''),
      startDate: typeof obj.startDate === 'string' ? obj.startDate : undefined,
      endDate: typeof obj.endDate === 'string' ? obj.endDate : undefined,
      url: typeof obj.url === 'string' ? obj.url : undefined,
      image: typeof image === 'string' ? image : Array.isArray(image) ? String(image[0] ?? '') : (image as Record<string, unknown>)?.url as string | undefined,
      locationName: typeof loc?.name === 'string' ? loc.name : undefined,
      description: typeof obj.description === 'string' ? obj.description.slice(0, 300) : undefined,
    })
    return
  }
  for (const key of ['@graph', 'itemListElement', 'mainEntity']) {
    if (obj[key]) collectEvents(obj[key], out, depth + 1)
  }
}

export function extractJsonLdEvents(html: string): JsonLdEvent[] {
  const out: JsonLdEvent[] = []
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectEvents(JSON.parse(m[1]), out, 0)
    } catch { /* virheellinen JSON-lohko — ohitetaan */ }
  }
  return out.filter(e => e.title.length > 2)
}
