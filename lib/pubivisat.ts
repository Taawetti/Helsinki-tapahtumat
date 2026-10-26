// Shared pubivisat.fi scraper — used by /api/pubivisat (event occurrences)
// and the /pubivisat SEO page (weekly schedule).

import { helsinkiISO } from './helsinki-time'

export const PUBIVISAT_SOURCE_URL = 'https://pubivisat.fi/helsinki'

export const WEEKDAY_JS: Record<string, number> = {
  maanantai: 1,
  tiistai:   2,
  keskiviikko: 3,
  torstai:   4,
  perjantai: 5,
  lauantai:  6,
  sunnuntai: 0,
}

// JS getDay() index → Finnish weekday name (for display/grouping)
export const WEEKDAY_FI = ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai']

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#[0-9]+;/g, '').trim()
}

export interface PubVisa {
  name: string
  address: string
  weekday: number
  hour: number
  minute: number
}

// Parses the weekly quiz table on pubivisat.fi/helsinki.
//
// The markup has two quirks (format change observed 2026-07):
// 1. The name cell's <td> is left unclosed, so a lazy <td>…</td> regex merges
//    "Name\nTime" into one cell and shifts the rest.
// 2. There are two tables: a "today" table WITHOUT a weekday column and the
//    weekly table WHERE the weekday is a link cell. Only weekly rows carry
//    enough info, so rows without a weekday cell are skipped.
//
// Cell-count-agnostic strategy: locate the weekday cell, read the address
// from the cell just before it, and the name + time from everything earlier.
export function parseRows(html: string): PubVisa[] {
  const results: PubVisa[] = []

  // Extract all <tr>...</tr> blocks
  const trMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)
  for (const trMatch of trMatches) {
    const tr = trMatch[1]
    // Extract TD cell texts
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => stripTags(m[1]))
    if (cells.length < 3) continue

    // Weekday cell: text is exactly a Finnish weekday name
    const wdIdx = cells.findIndex(c => WEEKDAY_JS[c.toLowerCase().trim()] !== undefined)
    if (wdIdx < 1) continue // no weekday (today-table row) or weekday first — skip
    const weekday = WEEKDAY_JS[cells[wdIdx].toLowerCase().trim()]

    const address = cells[wdIdx - 1].trim()
    // Rows with an empty address can't be verified as Helsinki — some rows
    // carry the town only in the name, e.g. "Opus K (Lohja)" with no address.
    if (!address) continue

    // Name = first line of the head cells; time = first HH.MM/HH:MM after it
    const head = cells.slice(0, wdIdx - 1).join('\n')
    const name = head.split('\n')[0].trim()
    if (!name || name.length < 2) continue

    const timeMatch = head.slice(name.length).match(/(\d{1,2})[.:](\d{2})/) ?? head.match(/(\d{1,2})[.:](\d{2})/)
    if (!timeMatch) continue
    const hour = parseInt(timeMatch[1])
    const minute = parseInt(timeMatch[2])
    if (hour > 23 || minute > 59) continue

    // Only include Helsinki proper — check both address and name (town can
    // appear in either, e.g. "Robyn's ... Torikatu 1, Kerava")
    const OTHER_TOWNS = /(kerava|espoo|vantaa|lohja|järvenpää|nurmijärvi|kirkkonummi)/i
    const isHelsinki =
      /\b0[0-9]{4}\b/.test(address) // Helsinki postal codes 00xxx
        ? /\b0[0-9]{3}[0-9]\b/.test(address) && !OTHER_TOWNS.test(address) && !OTHER_TOWNS.test(name)
        : !OTHER_TOWNS.test(address) && !OTHER_TOWNS.test(name)

    if (!isHelsinki) continue

    results.push({ name, address, weekday, hour, minute })
  }

  return results
}

// Next Helsinki-calendar occurrence of the quiz's weekday, as an ISO timestamp
// with the correct Helsinki offset (works on UTC servers; used by SEO JSON-LD).
export function nextOccurrenceISO(visa: PubVisa): string {
  const hkiNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }))
  const diff = (visa.weekday - hkiNow.getDay() + 7) % 7
  const target = new Date(hkiNow)
  target.setDate(target.getDate() + diff)
  const passedToday = diff === 0 &&
    (hkiNow.getHours() > visa.hour || (hkiNow.getHours() === visa.hour && hkiNow.getMinutes() >= visa.minute))
  if (passedToday) target.setDate(target.getDate() + 7)
  return helsinkiISO(target.getFullYear(), target.getMonth() + 1, target.getDate(), visa.hour, visa.minute)
}

let cachedVisas: PubVisa[] | null = null
let cacheTime = 0
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h — schedule changes rarely

/** Viimeisimmän lähdehaun tila vianetsintää varten: /api/pubivisat palauttaa
 *  tämän `lahde`-kentässä, jolloin Vercelin saama vastaus (status, jäsentyikö,
 *  katkelma) näkyy ilman lokeja. 26.10.2026 lähde antoi Vercelille 0 visaa,
 *  vaikka kehityskoneelta sama sivu jäsentyi 97 visaksi — syytä ei nähnyt
 *  mistään, koska haku nieli virheen hiljaa. */
export interface LahdehaunTila { aika: string; status: number | null; visoja: number; syy: string | null; ms: number }
let viimeisinHaku: LahdehaunTila | null = null
export function haunTila(): LahdehaunTila | null { return viimeisinHaku }

export async function fetchVisas(): Promise<PubVisa[]> {
  if (cachedVisas && Date.now() - cacheTime < CACHE_TTL) return cachedVisas

  // try/catch KOKO haun ympärillä: !res.ok kattaa vain virhevastauksen, mutta
  // verkkotason kaatuminen (DNS, connect timeout) HEITTÄÄ — ja heitto kulki
  // buildGuidePayloadin läpi /pubivisat-sivun prerenderiin asti, jolloin koko
  // sivuston build kaatui aina kun pubivisat.fi oli nurin. Mitattu 31.8.2026:
  // kaksi buildia peräkkäin kaatui lähteen ConnectTimeoutiin. Lähteen alhaalla-
  // olo ei saa estää MEIDÄN julkaisuamme — sivu renderöityy silloin tyhjänä
  // ja täyttyy, kun lähde palaa.
  //
  // EI next.revalidate-välimuistia (poistettu 26.10.2026): se tallensi MINKÄ
  // TAHANSA 2xx-vastauksen vuorokaudeksi — myös sivun, josta ei jäsenny yhtään
  // visaa — ja tyhjä tulos jäi palvelemaan koko päiväksi vaikka lähde olisi
  // jo toipunut. Onnistunut jäsennys pysyy muistissa 24 h (yllä); epäonnistunut
  // haku yritetään uudelleen seuraavalla pyynnöllä. Kaksi yritystä lyhyellä
  // tauolla kattaa hetkellisen pätkäisyn; 8 s yrityksellä mahtuu lähdevaraston
  // 20 s rajaan rikastuksen kanssa.
  const t0 = Date.now()
  let status: number | null = null
  let syy: string | null = null
  let visas: PubVisa[] = []
  for (let yritys = 1; yritys <= 2 && visas.length === 0; yritys++) {
    if (yritys > 1) await new Promise((r) => setTimeout(r, 1500))
    try {
      const res = await fetch(PUBIVISAT_SOURCE_URL, {
        headers: {
          'User-Agent': 'Mita-tanaan/1.0 (+https://mitatanaan.fi)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fi-FI,fi;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
      })
      status = res.status
      if (!res.ok) { syy = `HTTP ${res.status}`; continue }
      const html = await res.text()
      visas = parseRows(html)
      if (visas.length === 0) syy = `jäsentyi 0 visaa (${html.length} merkkiä): ${html.replace(/\s+/g, ' ').slice(0, 200)}`
    } catch (e) {
      syy = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    }
  }
  viimeisinHaku = { aika: new Date().toISOString(), status, visoja: visas.length, syy: visas.length > 0 ? null : syy, ms: Date.now() - t0 }
  if (visas.length === 0) console.warn('[pubivisat] lähde ei antanut visoja:', JSON.stringify(viimeisinHaku))
  if (visas.length > 0) {
    cachedVisas = visas
    cacheTime = Date.now()
  }
  return cachedVisas ?? []
}
