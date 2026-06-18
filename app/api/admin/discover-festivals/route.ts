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

function extractEventFromHtml(html: string): EventData | null {
  const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  const eventTypes = ['Event', 'MusicEvent', 'Festival', 'SportsEvent', 'TheaterEvent', 'DanceEvent']

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

        return {
          name: obj.name as string | undefined,
          startDate: (obj.startDate as string | undefined)?.slice(0, 10),
          endDate: ((obj.endDate || obj.startDate) as string | undefined)?.slice(0, 10),
          venue: location?.name as string | undefined,
          address: streetAddress,
          ticketUrl,
        }
      }
    } catch { /* malformed JSON-LD */ }
  }
  return null
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

async function crawlSeedSource(
  seedUrl: string,
  knownDomains: Set<string>,
  seenDomains: Set<string>,
  festivals: Record<string, unknown>[]
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
      const event = extractEventFromHtml(pageHtml)
      const title = pageTitle(pageHtml, domain)
      if (matchesFestival(domain, title, festivals)) return null
      return { title, url, snippet: '', event } satisfies Candidate
    }))
    results.push(...batchResults.filter((r): r is Candidate => r !== null))
  }

  // ── Internal pages: find official website, then fetch ───────────────────────
  const uniqueInternal = [...new Set(internalUrls)].slice(0, 60)
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
        const event = extractEventFromHtml(officialHtml)
        const title = internalTitle || pageTitle(officialHtml, officialDomain)
        if (matchesFestival(officialDomain, title, festivals)) return null
        return { title, url: officialUrl, snippet: '', event } satisfies Candidate
      }

      // No official link found — try JSON-LD from the internal page itself
      const event = extractEventFromHtml(pageHtml)
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
      const jsonEvent = html ? extractEventFromHtml(html) : null
      const snippetData = parseDatesFromSnippet(snippet)

      const event: EventData | null = (jsonEvent || snippetData.startDate) ? {
        name: jsonEvent?.name,
        startDate: jsonEvent?.startDate || snippetData.startDate,
        endDate: jsonEvent?.endDate || snippetData.endDate,
        venue: jsonEvent?.venue || snippetData.venue,
        address: jsonEvent?.address,
        ticketUrl: jsonEvent?.ticketUrl,
      } : null

      candidates.push({ title, url, snippet, event })
    }
  }

  // Vaihe 2: Siemenlähteiden ryömintä
  for (const seedUrl of SEED_SOURCES) {
    const seedResults = await crawlSeedSource(seedUrl, knownDomains, seenDomains, festivals)
    candidates.push(...seedResults)
  }

  return NextResponse.json({ updated: [], candidates })
}
