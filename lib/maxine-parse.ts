// Maxine (maxine.fi) The Events Calendar REST API:n parseri — PUHDAS,
// fixture-testattava (scripts/test-categories.ts). maxine.fi on WordPress +
// The Events Calendar -plugin: /wp-json/tribe/events/v1/events palauttaa
// tulevat klubi-illat JSONina. start_date "2026-08-21 22:00:00" on jo
// Europe/Helsinki-aikaa (vastauksen timezone-kenttä), joten siitä voi ottaa
// päivän ja kellonajan sellaisenaan. Klubit loppuvat yön yli → mukana myös
// end_date.

export interface MaxineItem {
  date: string   // YYYY-MM-DD
  title: string
  time: string   // "HH:MM"
  endDate: string | null  // YYYY-MM-DD (yleensä seuraava aamu)
  endTime: string | null  // "HH:MM"
  price: string | null    // "10€" jos API kertoo
  url: string
  image: string | null
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/** "2026-08-21 22:00:00" → ["2026-08-21", "22:00"] */
function splitTribeDate(s: unknown): [string, string] | null {
  if (typeof s !== 'string') return null
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/)
  return m ? [m[1], `${m[2]}:${m[3]}`] : null
}

/** Parsii tribe/events/v1/events-vastauksen. Sietää puuttuvia kenttiä. */
export function parseMaxineTribe(body: unknown): MaxineItem[] {
  const events = (body as { events?: unknown })?.events
  if (!Array.isArray(events)) return []

  const results: MaxineItem[] = []
  for (const raw of events) {
    const e = raw as Record<string, unknown>
    const start = splitTribeDate(e.start_date)
    if (!start) continue
    const end = splitTribeDate(e.end_date)
    const title = decode(typeof e.title === 'string' ? e.title : '')
    if (title.length < 2) continue

    const img = e.image as { url?: unknown } | null
    results.push({
      date: start[0],
      time: start[1],
      endDate: end ? end[0] : null,
      endTime: end ? end[1] : null,
      title,
      price: typeof e.cost === 'string' && e.cost.trim() ? decode(e.cost) : null,
      url: typeof e.url === 'string' ? e.url : '',
      image: img && typeof img.url === 'string' ? img.url : null,
    })
  }
  return results
}
