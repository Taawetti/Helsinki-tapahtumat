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

export async function fetchVisas(): Promise<PubVisa[]> {
  if (cachedVisas && Date.now() - cacheTime < CACHE_TTL) return cachedVisas

  const res = await fetch(PUBIVISAT_SOURCE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-tapahtumat/1.0)' },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 86400 },
  })
  if (!res.ok) return cachedVisas ?? []

  const html = await res.text()
  const visas = parseRows(html)
  if (visas.length > 0) {
    cachedVisas = visas
    cacheTime = Date.now()
  }
  return cachedVisas ?? []
}
