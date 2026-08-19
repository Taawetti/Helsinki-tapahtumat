// Lepakkomies (lepis.fi/tapahtumat) tapahtumalistan parseri — PUHDAS,
// fixture-testattava (scripts/test-categories.ts).
//
// Sivun rakenne 8/2026 (WordPress-teema vaihtunut): tapahtumat ovat
// <article class="group tapahtuma loop-item …"> -kortteina. Otsikko on nyt
// <h1 class="h2 mt-0"><a href="…/tapahtumat/slug/">OTSIKKO</a></h1>
// (vanha parseri etsi <h2>/<h3>:ää → palautti 0). Päivämäärä ja aika ovat
// edelleen <span class="date-info">ke 19.8.2026 / ovet klo 20:00</span>
// — täysi vuosi mukana, joten vuodenpäättelyä ei tarvita.

export interface LepakkomiesItem {
  date: string      // YYYY-MM-DD (date-info-spanin täydestä päivämäärästä)
  title: string
  time: string      // "HH:MM" — "ovet klo"-merkinnästä, oletus 20:00
  ticketUrl: string // tapahtumasivun linkki
}

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&[a-z]+;/gi, ' ')
}

// "ke 19.8.2026 / ovet klo 20:00" → { date: '2026-08-19', time: '20:00' }
function parseDateInfo(s: string): { date: string; time: string } | null {
  const dateM = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!dateM) return null
  const day = parseInt(dateM[1])
  const month = parseInt(dateM[2])
  const year = parseInt(dateM[3])
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const timeM = s.match(/ovet\s+klo\s+(\d{1,2})[.:](\d{2})/i)
  const time = timeM ? `${String(parseInt(timeM[1])).padStart(2, '0')}:${timeM[2]}` : '20:00'
  return { date, time }
}

/** Parsii lepis.fi/tapahtumat -sivun tapahtumakortit. */
export function parseLepakkomiesEvents(html: string): LepakkomiesItem[] {
  const results: LepakkomiesItem[] = []
  const seen = new Set<string>()

  for (const m of html.matchAll(/<article[^>]*class="[^"]*\btapahtuma\b[^"]*"[\s\S]*?<\/article>/g)) {
    const block = m[0]

    // Otsikko + linkki: <h1 class="h2 mt-0"><a href="…">OTSIKKO</a></h1>
    const titleM = block.match(/<h1 class="h2 mt-0">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!titleM) continue
    const ticketUrl = titleM[1].trim()
    const title = decode(titleM[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    if (title.length < 2) continue

    const dateM = block.match(/<span class="date-info">([\s\S]*?)<\/span>/)
    if (!dateM) continue
    const parsed = parseDateInfo(decode(dateM[1].replace(/<[^>]+>/g, ' ')))
    if (!parsed) continue

    const key = `${parsed.date}|${title}`
    if (seen.has(key)) continue
    seen.add(key)

    results.push({ date: parsed.date, title, time: parsed.time, ticketUrl })
  }
  return results
}
