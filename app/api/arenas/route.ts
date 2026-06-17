import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fi-FI,fi;q=0.9,en;q=0.8',
}

function decodeHtml(s: string): string {
  return s
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function detectCategories(title: string): string[] {
  const t = title.toLowerCase()
  if (/cup|ottelu|match|urheilu|sport|games|jalkapallo|football|juoksu|yleisurheilu|jääkiekko/i.test(t)) return ['Urheilu', 'Kilpailu']
  if (/konsertti|concert|jazz|klassinen|ooppera|rock|pop|metal|folk|blues|reggae|sinfonia/i.test(t)) return ['Konsertti', 'Musiikki']
  if (/balet|baletti|tanssi|dance/i.test(t)) return ['Baletti', 'Tanssi']
  if (/festivaali|festival/i.test(t)) return ['Festivaali']
  if (/messut|messe|expo|fair|ropecon|assembly/i.test(t)) return ['Messut', 'Tapahtuma']
  if (/näyttely|exhibition|gallery/i.test(t)) return ['Näyttely', 'Kulttuuri']
  if (/teatteri|theatre|esitys|show|musical/i.test(t)) return ['Teatteri', 'Esitys']
  if (/kierros|tour|opastettu/i.test(t)) return ['Opastettu kierros', 'Kulttuuri']
  if (/afterwork|after work/i.test(t)) return ['Afterwork', 'Tapahtuma']
  return ['Tapahtuma']
}

// ── Olympiastadion ────────────────────────────────────────────────────────────
// Drupal site: event cards use class="node node--type-event"
// Date in class="event-date", title in class="field--name-title"

function parseFinnishDate(raw: string): string | null {
  // "Ma 6.7.2026" → strip day abbrev → "6.7.2026"
  const s = raw.replace(/^(Ma|Ti|Ke|To|Pe|La|Su)\s+/, '').trim()
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T18:00:00`
}

async function scrapeOlympiastadion(): Promise<Event[]> {
  const res = await fetch('https://www.stadion.fi/fi/tapahtumat/tapahtumat', {
    headers: HEADERS,
    next: { revalidate: 3600, tags: ['events'] },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const events: Event[] = []
  const seen = new Set<string>()

  // Article cards: <article ... class="node node--type-event ...">
  const artPat = /<article[^>]*class="node node--type-event[^"]*"[^>]*>([\s\S]*?)<\/article>/g
  let m: RegExpExecArray | null
  while ((m = artPat.exec(html)) !== null) {
    const art = m[1]
    const dateM = art.match(/class="event-date"[^>]*>\s*([^<]+)/)
    const titleM = art.match(/class="field[^"]*field--name-title[^"]*"[^>]*>\s*([^<]+)/)
    const extLinkM = art.match(/href="(https?:\/\/[^"]+)"\s*target="_blank"/)
    const localLinkM = art.match(/href="(\/fi\/[^"]+)"/)

    if (!titleM) continue
    const title = decodeHtml(titleM[1].trim())
    const dateStr = dateM ? parseFinnishDate(dateM[1].trim()) : null
    if (!dateStr) continue
    const key = `${title}|${dateStr.slice(0, 10)}`
    if (seen.has(key)) continue
    seen.add(key)

    const link = extLinkM
      ? extLinkM[1]
      : localLinkM
        ? `https://www.stadion.fi${localLinkM[1]}`
        : 'https://www.stadion.fi/fi/tapahtumat/tapahtumat'

    events.push({
      id: `stadion-${Buffer.from(key).toString('base64').slice(0, 18)}`,
      title,
      shortDescription: 'Olympiastadion — Helsinki',
      description: '',
      startTime: dateStr,
      endTime: null,
      location: {
        name: 'Olympiastadion',
        streetAddress: 'Paavo Nurmen tie 1',
        city: 'Helsinki',
        lat: 60.1872,
        lon: 24.9268,
      },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: link,
      infoUrl: link,
      categories: detectCategories(title),
      source: 'linked-events' as const,
    })
  }

  return events
}

// ── Messukeskus ───────────────────────────────────────────────────────────────
// WordPress with custom mk-block-event-card blocks
// <time class="mk-block-event-card__date">24.–26.7.2026</time>
// <h3 class="mk-block-event-card__title"><span>Ropecon</span></h3>

function parseRangeDate(raw: string): string | null {
  const s = raw.trim()
  // "24.–26.7.2026" → take start day + last month.year
  const rangeM = s.match(/^(\d{1,2})\.?\s*[–\-]\s*\d{1,2}\.(\d{1,2})\.(\d{4})/)
  if (rangeM) {
    const [, d, mo, y] = rangeM
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T09:00:00`
  }
  // "24.7.2026"
  const simM = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (simM) {
    const [, d, mo, y] = simM
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T09:00:00`
  }
  return null
}

async function scrapeMessukeskus(): Promise<Event[]> {
  const res = await fetch('https://messukeskus.com/tapahtumat/', {
    headers: HEADERS,
    next: { revalidate: 3600, tags: ['events'] },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const events: Event[] = []

  const cardPat = /<article[^>]*class="mk-block-event-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g
  let m: RegExpExecArray | null
  while ((m = cardPat.exec(html)) !== null) {
    const card = m[1]
    const linkM = card.match(/class="mk-block-event-card__link"[^>]*href="([^"]+)"/)
    const dateM = card.match(/class="mk-block-event-card__date"[^>]*>([\s\S]*?)<\/time>/)
    const titleM = card.match(/class="mk-block-event-card__title"[^>]*><span>([^<]+)<\/span>/)

    if (!titleM || !dateM) continue
    const title = decodeHtml(titleM[1].trim())
    const dateStr = parseRangeDate(dateM[1].replace(/<[^>]+>/g, '').trim())
    if (!dateStr) continue

    const url = linkM?.[1] || 'https://messukeskus.com/tapahtumat/'

    events.push({
      id: `messukeskus-${Buffer.from(title + dateStr.slice(0, 10)).toString('base64').slice(0, 18)}`,
      title,
      shortDescription: 'Messukeskus — Helsinki',
      description: '',
      startTime: dateStr,
      endTime: null,
      location: {
        name: 'Messukeskus',
        streetAddress: 'Messuaukio 1',
        city: 'Helsinki',
        lat: 60.2028,
        lon: 24.9250,
      },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: url,
      infoUrl: url,
      categories: detectCategories(title),
      source: 'linked-events' as const,
    })
  }

  return events
}

// ── Finlandia-talo ────────────────────────────────────────────────────────────
// WordPress: event cards with class="global-link" → alt text = title
// Date in class="event-date ..."

function parseFinlandiaDate(raw: string): string | null {
  // "29.06.2026" or "2.10.2026"
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T19:00:00`
}

async function scrapeFinlandiatalo(): Promise<Event[]> {
  const res = await fetch(
    'https://www.finlandiatalo.fi/jarjesta-tapahtuma/tulevat-tapahtumat/',
    {
      headers: HEADERS,
      next: { revalidate: 3600, tags: ['events'] },
      signal: AbortSignal.timeout(8000),
    }
  )
  if (!res.ok) return []

  const html = await res.text()
  const events: Event[] = []

  // Each card: <a class="global-link" href="URL"></a>
  //            <img alt="TITLE">
  //            <div class="event-date ...">DATE</div>
  const cardPat =
    /class="global-link"[^>]*href="(https:\/\/www\.finlandiatalo\.fi\/tapahtumat\/[^"]+)"[\s\S]*?alt="([^"]+)"[\s\S]*?class="event-date[^"]*"[^>]*>([\s\S]*?)<\/div>/g

  let m: RegExpExecArray | null
  while ((m = cardPat.exec(html)) !== null) {
    const [, url, rawTitle, datePart] = m
    const dateText = datePart.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ')
    const dateM = dateText.match(/\d{1,2}\.\d{1,2}\.\d{4}/)
    if (!dateM) continue

    const dateStr = parseFinlandiaDate(dateM[0])
    if (!dateStr) continue

    const title = decodeHtml(rawTitle)
    if (!title || title.length < 3) continue

    events.push({
      id: `finlandia-${Buffer.from(title + dateStr.slice(0, 10)).toString('base64').slice(0, 18)}`,
      title,
      shortDescription: 'Finlandia-talo — Helsinki',
      description: '',
      startTime: dateStr,
      endTime: null,
      location: {
        name: 'Finlandia-talo',
        streetAddress: 'Mannerheimintie 13 e',
        city: 'Helsinki',
        lat: 60.1748,
        lon: 24.9289,
      },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: url,
      infoUrl: url,
      categories: detectCategories(title),
      source: 'linked-events' as const,
    })
  }

  return events
}

// ── Q-teatteri ────────────────────────────────────────────────────────────────
// Webflow CMS: shows listed at /esitykset
// Class: esitykset-sivu-item w-dyn-item
// Dates in short Finnish format "21.9.26" (D.M.YY with 2-digit year)

function parseQDate(raw: string): string | null {
  // "21.9.26" → "2026-09-21" (2-digit year → prepend "20")
  // "21.9.2026" → also valid
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (!m) return null
  const [, d, mo, yr] = m
  const year = yr.length === 2 ? `20${yr}` : yr
  return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T19:00:00`
}

async function scrapeQteatteri(): Promise<Event[]> {
  const res = await fetch('https://www.q-teatteri.fi/esitykset', {
    headers: HEADERS,
    next: { revalidate: 3600, tags: ['events'] },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const events: Event[] = []

  // Webflow CMS items — each show is a .esitykset-sivu-item.w-dyn-item
  const itemRe = /class="esitykset-sivu-item[^"]*"[^>]*>([\s\S]*?)(?=class="esitykset-sivu-item|$)/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(html)) !== null) {
    const block = m[1]

    // Title in <h2>
    const titleM = block.match(/<h2[^>]*>([^<]+)<\/h2>/)
    if (!titleM) continue
    const title = decodeHtml(titleM[1].trim())

    // Show URL: /esitykset/SLUG
    const slugM = block.match(/href="(\/esitykset\/[^"]+)"/)
    const showUrl = slugM ? `https://www.q-teatteri.fi${slugM[1]}` : 'https://www.q-teatteri.fi/esitykset'

    // Tiketti link
    const tikettiM = block.match(/href="(https:\/\/www\.tiketti\.fi\/[^"]+)"/)
    const tikettiUrl = tikettiM ? tikettiM[1] : showUrl

    // Dates: two consecutive esityksen-info-teksti divs after "ESITYSKAUSI"
    const dateDivs = [...block.matchAll(/class="esityksen-info-teksti"[^>]*>([^<]+)<\/div>/g)]
      .map((d) => d[1].trim())
      .filter((s) => /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(s))

    const startDate = dateDivs[0] ? parseQDate(dateDivs[0]) : null
    if (!startDate) continue

    events.push({
      id: `qteatteri-${Buffer.from(title + startDate.slice(0, 10)).toString('base64').slice(0, 18)}`,
      title,
      shortDescription: 'Q-teatteri — Punavuori, Helsinki',
      description: '',
      startTime: startDate,
      endTime: dateDivs[1] ? (parseQDate(dateDivs[1]) ?? null) : null,
      location: {
        name: 'Q-teatteri',
        streetAddress: 'Tunturikatu 16',
        city: 'Helsinki',
        lat: 60.1651,
        lon: 24.9237,
      },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: tikettiUrl,
      infoUrl: showUrl,
      categories: ['Teatteri', 'Esitys'],
      source: 'linked-events' as const,
    })
  }

  return events
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  const results = await Promise.allSettled([
    scrapeOlympiastadion(),
    scrapeMessukeskus(),
    scrapeFinlandiatalo(),
    scrapeQteatteri(),
  ])

  // Arena events often span multiple days — look back 3 days so an event
  // that started before the range can still show (e.g. a week-long fair)
  const startTs = new Date(start).getTime() - 3 * 24 * 60 * 60 * 1000
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

  // Deduplicate across all scrapers — Messukeskus especially repeats events across sections
  const seen = new Set<string>()
  const events = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((e) => {
      const ts = new Date(e.startTime).getTime()
      // Also include events that are still running (endTime >= query start) — covers theatre seasons
      const endTime = e.endTime ? new Date(e.endTime).getTime() : null
      const stillRunning = endTime !== null && endTime >= new Date(start).getTime()
      if (!stillRunning && (ts < startTs || ts > endTs)) return false
      const key = `${e.title.toLowerCase().slice(0, 40)}|${e.startTime.slice(0, 10)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return NextResponse.json({ events })
}
