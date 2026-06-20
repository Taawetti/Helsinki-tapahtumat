import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 300

function checkAuth(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? Buffer.from(process.env.ADMIN_PASSWORD).toString('base64')
    : null
  return expected && session === expected
}

const SERP_QUERIES = [
  // Festivaalit
  'Helsinki festival 2026',
  'Helsinki festivaali 2026',
  'Helsinki festival 2027',
  'Helsinki festivaali 2027',
  // Ulkoilma & kesä
  'Helsinki open air 2026',
  'Helsinki kesätapahtuma 2026',
  'Helsinki ulkoilmakonsertti 2026',
  'Helsinki puistotapahtuma 2026',
  // Markkinat & messut
  'Helsinki markkinat 2026',
  'Helsinki joulutori 2026',
  'Helsinki messut 2026',
  'Helsinki ruokamarkkinat 2026',
  // Kulttuuri
  'Helsinki näyttely 2026',
  'Helsinki kulttuuritapahtuma 2026',
  'Helsinki taidetapahtuma 2026',
  'Helsinki design tapahtuma 2026',
  // Ravintolat & baarit
  'uusi ravintola Helsinki 2026',
  'Helsinki ravintola avajaiset 2026',
  'Helsinki baari avajaiset 2026',
  'Helsinki pop-up ravintola 2026',
  // Kaupunkitapahtumat
  'Helsinki kaupunkitapahtuma 2026',
  'Helsinki juhla 2026',
  'Helsinki ruokafestivaali 2026',
  'Helsinki street food 2026',
  // Kausitapahtumat
  'Helsinki Vappu 2026',
  'Helsinki Juhannus 2026',
  'Helsinki joulu 2026',
  'Helsinki talvitapahtuma 2026',
  'Helsinki uusivuosi 2026',
  'Helsinki valotapahtuma 2026',
  // Musiikki
  'Helsinki jazz 2026',
  'Helsinki klassinen musiikki 2026',
  'Helsinki rock konsertti 2026',
  'Helsinki hip hop 2026',
  // Elokuva
  'Helsinki elokuvafestivaali 2026',
  'Helsinki lyhytelokuva 2026',
  'Helsinki dokumenttielokuva 2026',
  // Kirjallisuus & tieto
  'Helsinki kirjamessut 2026',
  'Helsinki kirjallisuustapahtuma 2026',
  'Helsinki luento 2026',
  'Helsinki konferenssi 2026',
  // Urheilu
  'Helsinki maraton 2026',
  'Helsinki juoksutapahtuma 2026',
  'Helsinki pyöräily tapahtuma 2026',
  'Helsinki urheilu 2026',
  'Helsinki tennis 2026',
  // Viihde
  'Helsinki stand-up 2026',
  'Helsinki comedy 2026',
  'Helsinki sirkus 2026',
  // Ruoka & juoma
  'Helsinki viinifestivaali 2026',
  'Helsinki oluenfestivaali 2026',
  'Helsinki food event 2026',
  // Erityistapahtumat
  'Helsinki Pride 2026',
  'Helsinki gaming 2026',
  'Helsinki comic con 2026',
  'Helsinki muoti 2026',
  'Helsinki hyvinvointi 2026',
  // Opiskelijatapahtumat
  'Helsinki opiskelija tapahtuma 2026',
  'Helsinki opiskelijajuhla 2026',
  'Helsinki fuksi 2026',
  'Helsinki yliopisto tapahtuma 2026',
  'Helsinki teekkarit 2026',
  'Aalto yliopisto tapahtuma 2026',
  'HYY tapahtuma 2026',
  // Englanninkieliset
  'Helsinki event 2026',
  'Helsinki concert 2026',
  'Helsinki exhibition 2026',
  'Helsinki market 2026',
  'Helsinki conference 2026',
  'Helsinki night event 2026',
  'Helsinki art event 2026',
]

const SEED_SOURCES = [
  'https://festivals.fi/festivaalit/',
  'https://www.visithelsinki.fi/fi/nahdavaa-ja-tehtavaa/festivaalit/',
  'https://kohokohdat.fi/helsinki/',
]

const SKIP_DOMAINS = new Set([
  'wikipedia.org', 'facebook.com', 'instagram.com', 'youtube.com',
  'twitter.com', 'x.com', 'visithelsinki.fi', 'hel.fi', 'google.com',
  'tiketti.fi', 'lippu.fi', 'livenation.fi', 'ticketmaster.fi',
  'festivals.fi',
])

interface EventData {
  name?: string
  startDate?: string
  endDate?: string
  venue?: string
  address?: string
  ticketUrl?: string
}

type Candidate = { title: string; url: string; snippet: string; event: EventData | null }

function parseDatesFromSnippet(snippet: string): Pick<EventData, 'startDate' | 'endDate' | 'venue'> {
  const result: Pick<EventData, 'startDate' | 'endDate' | 'venue'> = {}

  // Finnish range: 3.–4.7.2026 or 3.-4.7.2026 (period then dash between days)
  const rangeMatch = snippet.match(/(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (rangeMatch) {
    const [, startDay, endDay, month, year] = rangeMatch
    result.startDate = `${year}-${month.padStart(2, '0')}-${startDay.padStart(2, '0')}`
    result.endDate = `${year}-${month.padStart(2, '0')}-${endDay.padStart(2, '0')}`
  } else {
    const singleMatch = snippet.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
    if (singleMatch) {
      const [, day, month, year] = singleMatch
      result.startDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      result.endDate = result.startDate
    }
  }

  const venueMatch = snippet.match(/[·‧•]\s*([^·\n]{5,60})/)
  if (venueMatch) {
    const candidate = venueMatch[1].trim().replace(/\.$/, '')
    if (!/^\d|^helsinki$|^finland$/i.test(candidate)) result.venue = candidate
  }

  return result
}

function extractEventsFromHtml(html: string): EventData[] {
  const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  const eventTypes = ['Event', 'MusicEvent', 'Festival', 'SportsEvent', 'TheaterEvent', 'DanceEvent']
  const results: EventData[] = []

  for (const match of ldMatches) {
    try {
      const raw = JSON.parse(match[1])
      const items: unknown[] = []
      if (Array.isArray(raw)) items.push(...raw)
      else {
        if (raw['@graph']) items.push(...raw['@graph'])
        else items.push(raw)
      }

      for (const item of items) {
        const obj = item as Record<string, unknown>
        const type = obj['@type']
        const isEvent = eventTypes.some(t =>
          type === t || (Array.isArray(type) && (type as string[]).includes(t))
        )
        if (!isEvent) continue

        const location = obj.location as Record<string, unknown> | undefined
        const offers = obj.offers as Record<string, unknown> | Record<string, unknown>[] | undefined
        const ticketUrl = Array.isArray(offers)
          ? (offers[0] as Record<string, unknown>)?.url as string | undefined
          : (offers as Record<string, unknown> | undefined)?.url as string | undefined

        const addr = location?.address
        const streetAddress = typeof addr === 'string'
          ? addr
          : (addr as Record<string, unknown> | undefined)?.streetAddress as string | undefined

        results.push({
          name: obj.name as string | undefined,
          startDate: (obj.startDate as string | undefined)?.slice(0, 10),
          endDate: ((obj.endDate || obj.startDate) as string | undefined)?.slice(0, 10),
          venue: location?.name as string | undefined,
          address: streetAddress,
          ticketUrl,
        })
      }
    } catch { /* malformed JSON-LD */ }
  }
  return results
}

function extractEventFromHtml(html: string): EventData | null {
  const events = extractEventsFromHtml(html)
  return events[0] ?? null
}

// ── HTML Fallback Parser ─────────────────────────────────────────────────────

const FINNISH_MONTHS: Record<string, number> = {
  tammikuu: 1, tammikuuta: 1,
  helmikuu: 2, helmikuuta: 2,
  maaliskuu: 3, maaliskuuta: 3,
  huhtikuu: 4, huhtikuuta: 4,
  toukokuu: 5, toukokuuta: 5,
  'kesäkuu': 6, 'kesäkuuta': 6,
  'heinäkuu': 7, 'heinäkuuta': 7,
  elokuu: 8, elokuuta: 8,
  syyskuu: 9, syyskuuta: 9,
  lokakuu: 10, lokakuuta: 10,
  marraskuu: 11, marraskuuta: 11,
  joulukuu: 12, joulukuuta: 12,
}

const ENGLISH_MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2,
  march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
}

const KNOWN_VENUES = [
  'Suvilahti', 'Hiekkasärkkä', 'Rautatientori', 'Esplanadi', 'Kauppatori',
  'Olympiastadion', 'Hartwall Arena', 'Veikkaus Arena', 'Messukeskus',
  'Kaapelitehdas', 'Finlandia-talo', 'Musiikkitalo', 'Sanomatalo',
  'Kansallisteatteri', 'Kansallisooppera', 'Tavastia', 'Circus',
  'Annantalo', 'Casinolaituri', 'Hernesaari', 'Töölönlahti',
  'Linnanmäki', 'Korkeasaari', 'Seurasaari', 'Pihlajasaari',
  'Alppipuisto', 'Senaatintori', 'Kulttuuritehdas', 'Storyville',
  'Korjaamo', 'Malmitalo', 'Vuotalo', 'Savoy-teatteri',
  'Dipoli', 'Otaniemi', 'Tapiola', 'Lauttasaari',
]

function toIsoDate(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractMetaContent(html: string, ...names: string[]): string | undefined {
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name)="${esc}"[^>]+content="([^"]{3,200})"`, 'i')) ??
      html.match(new RegExp(`<meta[^>]+content="([^"]{3,200})"[^>]+(?:property|name)="${esc}"`, 'i'))
    if (m) return m[1]
  }
}

interface ParsedDateRange { startDate: string; endDate: string }

function findDatesInText(text: string, today: string): ParsedDateRange[] {
  const found: ParsedDateRange[] = []
  const seen = new Set<string>()

  function add(startDate: string, endDate: string) {
    const yr = parseInt(startDate.slice(0, 4))
    if (startDate < today || seen.has(startDate) || yr < 2025 || yr > 2030) return
    seen.add(startDate)
    found.push({ startDate, endDate })
  }

  // Finnish range: D.–D.M.YYYY (en-dash, hyphen, or dot between days)
  for (const m of text.matchAll(/\b(\d{1,2})\s*[.–-]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)) {
    const [, sd, ed, mo, yr] = m
    const month = parseInt(mo), year = parseInt(yr)
    if (month < 1 || month > 12) continue
    add(toIsoDate(parseInt(sd), month, year), toIsoDate(parseInt(ed), month, year))
  }

  // Finnish single: D.M.YYYY
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)) {
    const [, d, mo, yr] = m
    const month = parseInt(mo), year = parseInt(yr)
    if (month < 1 || month > 12) continue
    const date = toIsoDate(parseInt(d), month, year)
    add(date, date)
  }

  // Finnish with month name: "3. heinäkuuta 2026"
  const fiKeys = Object.keys(FINNISH_MONTHS).join('|')
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})\\.?\\s*(${fiKeys})\\s+(\\d{4})\\b`, 'gi'))) {
    const [, d, monthStr, yr] = m
    const month = FINNISH_MONTHS[monthStr.toLowerCase()]
    const year = parseInt(yr)
    if (!month) continue
    const date = toIsoDate(parseInt(d), month, year)
    add(date, date)
  }

  // ISO: YYYY-MM-DD
  for (const m of text.matchAll(/\b(202[5-9]|2030)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g)) {
    const date = m[0].slice(0, 10)
    add(date, date)
  }

  // English: "July 3–4, 2026" or "July 3, 2026"
  const enKeys = Object.keys(ENGLISH_MONTHS).join('|')
  for (const m of text.matchAll(new RegExp(`\\b(${enKeys})\\s+(\\d{1,2})(?:[\\u2013-](\\d{1,2}))?[,.]?\\s*(\\d{4})\\b`, 'gi'))) {
    const [, monthStr, sd, ed, yr] = m
    const month = ENGLISH_MONTHS[monthStr.toLowerCase()]
    const year = parseInt(yr)
    if (!month) continue
    const startDate = toIsoDate(parseInt(sd), month, year)
    const endDate = ed ? toIsoDate(parseInt(ed), month, year) : startDate
    add(startDate, endDate)
  }

  // English: "3 July 2026" or "3rd July 2026"
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${enKeys})\\s+(\\d{4})\\b`, 'gi'))) {
    const [, d, monthStr, yr] = m
    const month = ENGLISH_MONTHS[monthStr.toLowerCase()]
    const year = parseInt(yr)
    if (!month) continue
    const date = toIsoDate(parseInt(d), month, year)
    add(date, date)
  }

  return found.sort((a, b) => a.startDate.localeCompare(b.startDate))
}

function findVenueInText(text: string): string | undefined {
  // Look for explicit venue labels
  const labelMatch = text.match(
    /(?:paikka|tapahtumapaikka|tapahtumapaikkana|venue|location|missä|where|osoite)\s*:?\s+([A-ZÄÖÅ][^\n.!?]{4,60})/i
  )
  if (labelMatch) {
    const candidate = labelMatch[1].trim().split(/\s{2,}|\n/)[0].trim()
    if (candidate.length >= 4 && candidate.length <= 60) return candidate
  }

  // Known Helsinki venues
  for (const venue of KNOWN_VENUES) {
    if (text.includes(venue)) return venue
  }

  // Finnish street address: "Kalevankatu 5" or "Mannerheimintie 34"
  const streetMatch = text.match(
    /\b([A-ZÄÖÅ][a-zäöå]+(?:katu|tie|tori|puisto|laituri|ranta|väylä|polku|kaari|raitti)\s+\d+[A-Z]?)\b/
  )
  if (streetMatch) return streetMatch[1]

  return undefined
}

async function extractEventFromHtmlFallback(html: string, title: string): Promise<EventData | null> {
  const today = new Date().toISOString().slice(0, 10)

  // 1. HTML5 <time datetime="YYYY-MM-DD"> elements
  const timeMatches = [...html.matchAll(/<time[^>]+datetime="(\d{4}-\d{2}-\d{2})[^"]*"[^>]*>/gi)]
  const futureTimes = timeMatches.map(m => m[1]).filter(d => d >= today).sort()
  if (futureTimes.length > 0) {
    const text = stripHtml(html)
    return {
      name: title,
      startDate: futureTimes[0],
      endDate: futureTimes[futureTimes.length - 1],
      venue: findVenueInText(text),
    }
  }

  // 2. Schema.org Microdata itemprop="startDate"
  const microdataStart = (
    html.match(/itemprop="startDate"[^>]*content="(\d{4}-\d{2}-\d{2})[^"]*"/i) ??
    html.match(/itemprop="startDate"[^>]*datetime="(\d{4}-\d{2}-\d{2})[^"]*"/i) ??
    html.match(/content="(\d{4}-\d{2}-\d{2})[^"]*"[^>]*itemprop="startDate"/i)
  )?.[1]

  if (microdataStart && microdataStart >= today) {
    const microdataEnd = (
      html.match(/itemprop="endDate"[^>]*content="(\d{4}-\d{2}-\d{2})[^"]*"/i) ??
      html.match(/itemprop="endDate"[^>]*datetime="(\d{4}-\d{2}-\d{2})[^"]*"/i) ??
      html.match(/content="(\d{4}-\d{2}-\d{2})[^"]*"[^>]*itemprop="endDate"/i)
    )?.[1]
    const venueFromMicrodata = html.match(
      /itemprop="location"[\s\S]{0,300}?itemprop="name"[^>]*>([^<]{3,60})</
    )?.[1]?.trim()
    const text = stripHtml(html)
    return {
      name: title,
      startDate: microdataStart,
      endDate: microdataEnd ?? microdataStart,
      venue: venueFromMicrodata ?? findVenueInText(text),
    }
  }

  // 3. Event meta tags
  const metaStart = extractMetaContent(html, 'event:start_time', 'og:start_time', 'startDate', 'event-date')
  if (metaStart) {
    const startDate = metaStart.slice(0, 10)
    if (startDate >= today && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      const metaEnd = extractMetaContent(html, 'event:end_time', 'og:end_time', 'endDate')
      const text = stripHtml(html)
      return {
        name: title,
        startDate,
        endDate: metaEnd?.slice(0, 10) ?? startDate,
        venue: findVenueInText(text),
      }
    }
  }

  // 4. Text-based date extraction
  const text = stripHtml(html)
  const dates = findDatesInText(text, today)
  if (dates.length === 0) {
    // 5. LLM-fallback: luonnollinen kieli ja epätavalliset päivämääräformaatit
    return extractEventWithLlm(text, title)
  }

  const startDate = dates[0].startDate
  const endDate = dates.reduce((latest, d) => d.endDate > latest ? d.endDate : latest, dates[0].endDate)
  return { name: title, startDate, endDate, venue: findVenueInText(text) }
}

async function extractEventWithLlm(text: string, title: string): Promise<EventData | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const today = new Date().toISOString().slice(0, 10)
  const truncated = text.slice(0, 3000)

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Extract event details from this webpage text. Today is ${today}. Reply ONLY with valid JSON or the word null.

Title: ${title}
Text: ${truncated}

JSON: {"name":"event name","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","venue":"venue or null"}
Rules: startDate must be >= ${today}. Only Helsinki-area events. If no future event found: null`,
        }],
      }),
    })
    clearTimeout(timer)
    const data = await res.json()
    const raw = (data.content?.[0]?.text ?? '').trim()
    if (!raw || raw === 'null') return null
    const parsed = JSON.parse(raw)
    if (!parsed?.startDate || parsed.startDate < today) return null
    return {
      name: parsed.name || title,
      startDate: parsed.startDate,
      endDate: parsed.endDate || parsed.startDate,
      venue: parsed.venue || undefined,
    }
  } catch {
    return null
  }
}

// JSON-LD ensin, HTML-regex toisena, LLM viimeisenä
async function extractBestEvent(html: string, title: string): Promise<EventData | null> {
  return extractEventFromHtml(html) ?? await extractEventFromHtmlFallback(html, title)
}

function pageTitle(html: string, fallback: string): string {
  const m = html.match(/<title[^>]*>([^<]{3,100})<\/title>/i)
  if (!m) return fallback
  return m[1].trim().split(/[|\-–—]/)[0].trim() || fallback
}

function normalizeName(s: string): string {
  return s.toLowerCase()
    .replace(/\b20\d\d\b/g, '')
    .replace(/\b(festival|festivaali|fest|open air)\b/g, '')
    .replace(/[^a-zäöå]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesFestival(domain: string, title: string, festivals: Record<string, unknown>[]): boolean {
  for (const f of festivals) {
    try {
      const existing = new URL(f.info_url as string).hostname.replace('www.', '')
      if (existing === domain) return true
    } catch { /* invalid URL */ }

    const nt = normalizeName(title)
    const nn = normalizeName(f.name as string)
    const ns = normalizeName(f.short_name as string)
    if (nt.length > 3 && ns.length > 3 && (nt.includes(ns) || ns.includes(nt) || nt.includes(nn) || nn.includes(nt))) {
      return true
    }
  }
  return false
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Events-Bot/1.0)' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function serpSearch(query: string): Promise<{ title: string; url: string; domain: string; snippet: string }[]> {
  const token = process.env.DATAFORSEO_TOKEN
  if (!token) return []

  try {
    const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: query,
        location_name: 'Helsinki,Helsinki,Uusimaa,Finland',
        language_code: 'fi',
        device: 'desktop',
        depth: 10,
      }]),
    })
    const data = await res.json()
    const items = data?.tasks?.[0]?.result?.[0]?.items ?? []
    return items
      .filter((i: Record<string, unknown>) => i.type === 'organic')
      .map((i: Record<string, unknown>) => ({
        title: (i.title as string) ?? '',
        url: (i.url as string) ?? '',
        domain: ((i.domain as string) ?? '').replace('www.', ''),
        snippet: (i.description as string) ?? '',
      }))
  } catch {
    return []
  }
}

const AGGREGATOR_TRIGGERS = [
  'etusivu', 'koti', 'home', 'tapahtumat', 'events', 'tapahtumakalenteri',
  'calendar', 'kalenteri', 'ohjelma', 'programme', 'ajankohtaista',
  'uutiset', 'news', 'näyttelyt', 'exhibitions', 'hakutulokset',
  'ladataan', 'loading', 'tapahtumakalenteri',
]

function looksLikeAggregator(title: string): boolean {
  if (!title || title.length < 3) return true
  if (title.endsWith('...')) return true
  const lower = title.toLowerCase()
  return AGGREGATOR_TRIGGERS.some(t => lower === t || lower.startsWith(t + ' ') || lower.endsWith(' ' + t) || lower.includes(' ' + t + ' '))
}

async function crawlSeedSource(
  seedUrl: string,
  knownDomains: Set<string>,
  seenDomains: Set<string>,
  festivals: Record<string, unknown>[],
  maxInternalPages = 60
): Promise<Candidate[]> {
  const html = await fetchPage(seedUrl)
  if (!html) return []

  const seedDomain = new URL(seedUrl).hostname.replace('www.', '')

  // Collect external links and internal sub-pages
  const externalByDomain = new Map<string, string>()
  const internalUrls: string[] = []

  for (const [, href] of [...html.matchAll(/href="([^"]+)"/gi)]) {
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) continue
    try {
      const full = new URL(href, seedUrl).toString()
      const u = new URL(full)
      const domain = u.hostname.replace('www.', '')

      if (domain === seedDomain) {
        const parts = u.pathname.split('/').filter(Boolean)
        // Only 1-level deep paths that aren't the seed page itself
        if (parts.length === 1 && full !== seedUrl) internalUrls.push(full)
      } else if (!SKIP_DOMAINS.has(domain) && !knownDomains.has(domain) && !seenDomains.has(domain)) {
        if (!externalByDomain.has(domain)) externalByDomain.set(domain, full)
      }
    } catch { /* invalid URL */ }
  }

  const results: Candidate[] = []
  const BATCH = 10

  // ── External links: fetch directly ──────────────────────────────────────────
  const externalList = [...externalByDomain.entries()]
  for (let i = 0; i < externalList.length; i += BATCH) {
    const batch = externalList.slice(i, i + BATCH)
    const batchResults = await Promise.all(batch.map(async ([domain, url]) => {
      if (seenDomains.has(domain)) return null
      seenDomains.add(domain)
      const pageHtml = await fetchPage(url)
      if (!pageHtml) return null
      const title = pageTitle(pageHtml, domain)
      if (matchesFestival(domain, title, festivals)) return null
      const event = await extractBestEvent(pageHtml, title)
      return { title, url, snippet: '', event } satisfies Candidate
    }))
    results.push(...batchResults.filter((r): r is Candidate => r !== null))
  }

  // ── Internal pages: find official website, then fetch ───────────────────────
  const uniqueInternal = [...new Set(internalUrls)].slice(0, maxInternalPages)
  for (let i = 0; i < uniqueInternal.length; i += BATCH) {
    const batch = uniqueInternal.slice(i, i + BATCH)
    const batchResults = await Promise.all(batch.map(async (internalUrl) => {
      const pageHtml = await fetchPage(internalUrl)
      if (!pageHtml) return null

      const internalTitle = pageTitle(pageHtml, '')

      // Find external links that are likely the official festival website
      const officialCandidates: string[] = []
      for (const [, href] of [...pageHtml.matchAll(/href="(https?:\/\/[^"]+)"/gi)]) {
        try {
          const u = new URL(href)
          const domain = u.hostname.replace('www.', '')
          if (domain !== seedDomain && !SKIP_DOMAINS.has(domain) && !knownDomains.has(domain) && !seenDomains.has(domain)) {
            officialCandidates.push(href)
          }
        } catch { /* invalid */ }
      }

      if (officialCandidates.length > 0) {
        const officialUrl = officialCandidates[0]
        const officialDomain = new URL(officialUrl).hostname.replace('www.', '')
        if (seenDomains.has(officialDomain)) return null
        seenDomains.add(officialDomain)

        const officialHtml = await fetchPage(officialUrl)
        if (!officialHtml) return null
        const title = internalTitle || pageTitle(officialHtml, officialDomain)
        if (matchesFestival(officialDomain, title, festivals)) return null
        const event = await extractBestEvent(officialHtml, title)
        return { title, url: officialUrl, snippet: '', event } satisfies Candidate
      }

      // No official link found — try JSON-LD + HTML fallback from the internal page itself
      const event = await extractBestEvent(pageHtml, internalTitle)
      if (!event) return null
      return { title: internalTitle, url: internalUrl, snippet: '', event } satisfies Candidate
    }))
    results.push(...batchResults.filter((r): r is Candidate => r !== null))
  }

  return results
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const mode: 'update' | 'discover' = body.mode ?? 'update'

  const { data: existingFestivals } = await supabaseAdmin
    .from('festivals')
    .select('id, name, short_name, info_url, ticket_url, start_date, end_date, venue_name, address')

  const festivals = (existingFestivals ?? []) as Record<string, unknown>[]

  const updated: { name: string; changes: Record<string, string> }[] = []
  const candidates: Candidate[] = []

  // ── Mode: update — päivitä olemassa olevat ──────────────────────────────────
  if (mode === 'update') {
    await Promise.all(
      festivals.map(async (f) => {
        const infoUrl = f.info_url as string
        if (!infoUrl) return
        const html = await fetchPage(infoUrl)
        if (!html) return

        const event = extractEventFromHtml(html)
        if (!event?.startDate) return

        const changes: Record<string, string> = {}
        if (event.startDate && event.startDate !== f.start_date) changes.start_date = event.startDate
        if (event.endDate && event.endDate !== f.end_date) changes.end_date = event.endDate
        if (event.venue && event.venue !== f.venue_name) changes.venue_name = event.venue
        if (event.address && event.address !== f.address) changes.address = event.address
        if (event.ticketUrl && event.ticketUrl !== f.ticket_url) changes.ticket_url = event.ticketUrl

        if (Object.keys(changes).length > 0) {
          await supabaseAdmin!.from('festivals').update(changes).eq('id', f.id as string)
          updated.push({ name: f.name as string, changes })
        }
      })
    )

    return NextResponse.json({ updated, candidates: [] })
  }

  // ── Mode: discover — etsi uusia ─────────────────────────────────────────────
  const knownDomains = new Set(
    festivals.map(f => {
      try { return new URL(f.info_url as string).hostname.replace('www.', '') } catch { return '' }
    }).filter(Boolean)
  )
  const seenDomains = new Set<string>()

  // Vaihe 1: SERP-haku
  for (const query of SERP_QUERIES) {
    const results = await serpSearch(query)

    for (const result of results) {
      const { domain, title, url, snippet } = result
      if (!domain || !url) continue
      if (SKIP_DOMAINS.has(domain)) continue
      if (knownDomains.has(domain)) continue
      if (seenDomains.has(domain)) continue
      if (matchesFestival(domain, title, festivals)) continue

      seenDomains.add(domain)

      const html = await fetchPage(url)
      const jsonEvents = html ? extractEventsFromHtml(html) : []
      const snippetData = parseDatesFromSnippet(snippet)
      const pTitle = html ? pageTitle(html, title) : title

      if (jsonEvents.length > 1) {
        // Useita tapahtumia samalla sivulla (esim. tapahtumakalenteri)
        for (const e of jsonEvents) {
          candidates.push({ title: e.name || pTitle, url, snippet: '', event: e })
        }
      } else if (jsonEvents.length === 1) {
        // Yksi JSON-LD tapahtuma — täydennä snippet-tiedoilla tarvittaessa
        const jsonEvent = jsonEvents[0]
        const event: EventData = {
          name: jsonEvent.name,
          startDate: jsonEvent.startDate || snippetData.startDate,
          endDate: jsonEvent.endDate || snippetData.endDate,
          venue: jsonEvent.venue || snippetData.venue,
          address: jsonEvent.address,
          ticketUrl: jsonEvent.ticketUrl,
        }
        candidates.push({ title: event.name || pTitle, url, snippet, event })
      } else if (html && looksLikeAggregator(pTitle)) {
        // Kalenterisivu — ryömi sisäiset tapahtumasivut kuten siemenlähteet
        const subResults = await crawlSeedSource(url, knownDomains, seenDomains, festivals, 15)
        candidates.push(...subResults)
      } else {
        // Yksittäinen tapahtumusivu — HTML-fallback, sitten snippet
        const fallback = html ? await extractEventFromHtmlFallback(html, pTitle) : null
        const event: EventData | null = fallback ?? (snippetData.startDate ? {
          name: pTitle,
          startDate: snippetData.startDate,
          endDate: snippetData.endDate,
          venue: snippetData.venue,
        } : null)
        candidates.push({ title: pTitle, url, snippet, event })
      }
    }
  }

  // Vaihe 2: Siemenlähteiden ryömintä
  for (const seedUrl of SEED_SOURCES) {
    const seedResults = await crawlSeedSource(seedUrl, knownDomains, seenDomains, festivals)
    candidates.push(...seedResults)
  }

  return NextResponse.json({ updated: [], candidates })
}
