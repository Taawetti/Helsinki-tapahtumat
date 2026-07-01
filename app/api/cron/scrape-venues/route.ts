import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 120

// ── Types ────────────────────────────────────────────────────────────────────

interface ScrapedEvent {
  id: string
  venue_id: string
  venue_name: string
  title: string
  start_datetime: string
  image_url: string | null
  ticket_url: string
  price_info: string | null
  is_free: boolean
}

const UA = 'mitatanaan.fi event aggregator (+https://mitatanaan.fi)'

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8211;/g, '–')
    .replace(/&#8230;/g, '…')
    .trim()
}

// ── On the Rocks ─────────────────────────────────────────────────────────────
// Kaikki tarvittavat tiedot saadaan suoraan tapahtumalistan HTML:stä.
// Päivämäärä + kelloaika: <span class="date-info">ke 24.6.2026 / ovet klo 19:00</span>
// Tiketti-linkki: <a class="btn btn-primary btn-tiketti" href="https://www.tiketti.fi/...">

async function scrapeOnTheRocks(): Promise<ScrapedEvent[]> {
  const res = await fetch('https://www.rocks.fi/tapahtumat/', {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`OTR HTTP ${res.status}`)
  const html = await res.text()

  const articles = html.match(/<article[\s>][\s\S]*?<\/article>/g) ?? []
  const events: ScrapedEvent[] = []

  for (const article of articles) {
    // Event page URL sisältää slugin (käytetään ID-pohjana)
    const linkMatch = article.match(
      /class="img-link"\s+href="(https:\/\/www\.rocks\.fi\/tapahtumat\/([^"\/]+)\/)"/)
    if (!linkMatch) continue
    const [, eventUrl, slug] = linkMatch

    // Otsikko — title-attribuutti h1:n sisäisestä linkistä
    const titleMatch = article.match(/class="h2[^"]*"[\s\S]*?title="([^"]+)"/)
    if (!titleMatch) continue
    const title = decodeHtml(titleMatch[1])

    // Päivämäärä + kelloaika: "ke 24.6.2026 / ovet klo 19:00"
    const dateSpan = article.match(/class="date-info"[^>]*>([\s\S]*?)<\/span>/)
    if (!dateSpan) continue
    const dateText = dateSpan[1].replace(/<[^>]+>/g, ' ').trim()

    const dateMatch = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
    if (!dateMatch) continue
    const day = dateMatch[1].padStart(2, '0')
    const month = dateMatch[2].padStart(2, '0')
    const year = dateMatch[3]

    // Kelloaika "klo 19:00" tai "klo 19.00"
    const timeMatch = dateText.match(/klo\s+(\d{1,2})[:.](\d{2})/)
    const hour = timeMatch ? timeMatch[1].padStart(2, '0') : '19'
    const minute = timeMatch ? timeMatch[2].padStart(2, '0') : '00'

    const start_datetime = `${year}-${month}-${day}T${hour}:${minute}:00+03:00`

    // Suora tiketti-ostolinkki (parempi kuin event page -URL)
    const tikettiMatch = article.match(/class="btn[^"]*btn-tiketti[^"]*"[^>]*href="([^"]+)"/)
    const ticket_url = tikettiMatch?.[1] ?? eventUrl

    // Kuva — poistetaan WordPress thumbnail-suffiksi (-435x326 tmv.)
    const imgMatch = article.match(
      /src="(https:\/\/www\.rocks\.fi\/wp-content\/uploads\/[^"]+\.(jpg|jpeg|png|webp))"/)
    const image_url = imgMatch
      ? imgMatch[1].replace(/-\d+x\d+(\.[a-z]+)$/, '$1')
      : null

    // Hinta: "liput alk. 15 € / 18 €" tai "Vapaa pääsy"
    const priceSpan = article.match(/class="lippujen-lisatieto[^"]*"[^>]*>([\s\S]*?)<\/span>/)
    const priceRaw = priceSpan
      ? priceSpan[1].replace(/<[^>]+>/g, '').trim()
      : ''
    const is_free = /vapaa\s+pääsy/i.test(priceRaw)
    const price_info = is_free ? null : (priceRaw.replace(/\s+/g, ' ').trim() || null)

    events.push({
      id: `otr-${slug}`,
      venue_id: 'on-the-rocks',
      venue_name: 'On the Rocks',
      title,
      start_datetime,
      image_url,
      ticket_url,
      price_info,
      is_free,
    })
  }

  return events
}

// ── Tavastia ─────────────────────────────────────────────────────────────────
// 1) Etusivu → kerää kaikki tapahtuma-URL:t (+ päivämäärä URL:sta)
// 2) Yksittäinen sivu → tarkka aloitusaika (itemprop="startDate"), otsikko, kuva, hinta

async function scrapeTavastiaUrls(): Promise<Array<{ url: string; eventId: string; date: string }>> {
  const res = await fetch('https://tavastiaklubi.fi/', {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Tavastia etusivu HTTP ${res.status}`)
  const html = await res.text()

  // /events/YYYY-MM-DD/slug/ID/
  const urlRegex =
    /href="(https:\/\/tavastiaklubi\.fi\/events\/(20(?:2[6-9]|\d{2})-\d{2}-\d{2})\/[^\/]+\/(\d+)\/?)"/g
  const results: Array<{ url: string; eventId: string; date: string }> = []
  const seen = new Set<string>()

  let m
  while ((m = urlRegex.exec(html)) !== null) {
    const [, url, date, eventId] = m
    if (seen.has(eventId)) continue
    seen.add(eventId)
    results.push({ url, eventId, date })
  }

  return results
}

async function scrapeTavastiaPage(url: string): Promise<{
  title: string
  venue_name: string
  venue_id: string
  start_datetime: string
  image_url: string | null
  price_info: string | null
  is_free: boolean
} | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const html = await res.text()

    // Tarkka aloitusaika — schema.org microdata
    const startMatch = html.match(/itemprop="startDate"[^>]*content="([^"]+)"/)
    if (!startMatch) return null
    const start_datetime = startMatch[1]
    // Hylätään epoch-fallback (buginen data)
    if (!start_datetime || start_datetime.startsWith('1970')) return null

    // Otsikko + venue: <title>EVENT NAME - D.M.YYYY - Tavastia</title>
    // tai:             <title>EVENT NAME - D.M.YYYY - Semifinal</title>
    const titleTagMatch = html.match(/<title>([^<]+)<\/title>/)
    if (!titleTagMatch) return null
    const rawTitle = titleTagMatch[1]
    const isSemifinal = /[-–]\s*Semifinal\s*$/i.test(rawTitle)
    const venue_name = isSemifinal ? 'Semifinal' : 'Tavastia'
    const venue_id = isSemifinal ? 'semifinal' : 'tavastia'
    const title = decodeHtml(
      rawTitle
        .replace(/\s*[-–]\s*\d{1,2}\.\d{1,2}\.\d{4}\s*[-–][^<]*/i, '')
        .trim()
    )
    if (!title) return null

    // Kuva: Tiketti CDN (EV{id}_{n}_{W}x{H}.jpg) tai WP uploads
    const imgMatch =
      html.match(/src="(https:\/\/www\.tiketti\.fi\/kuvat\/EV\d+_\d+_\d+x\d+\.[a-z]+)"/) ??
      html.match(
        /src="(https:\/\/tavastiaklubi\.fi\/wp-content\/uploads\/[^"]+(?:768|1024)x\d+[^"]*\.(jpg|jpeg|png|webp))"/
      )
    const image_url = imgMatch?.[1] ?? null

    // Hinta ovelta: <div class="door-price">33 €</div>
    const priceMatch = html.match(/class="door-price[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    const priceRaw = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, '').trim() : ''
    const is_free = !priceRaw || priceRaw === '0'
    const price_info = is_free ? null : (priceRaw || null)

    return { title, venue_name, venue_id, start_datetime, image_url, price_info, is_free }
  } catch {
    return null
  }
}

async function scrapeTavastia(): Promise<ScrapedEvent[]> {
  const allUrls = await scrapeTavastiaUrls()

  // Suodatetaan seuraavat 90 päivää
  const todayStr = new Date().toISOString().slice(0, 10)
  const maxStr = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const relevant = allUrls.filter(({ date }) => date >= todayStr && date <= maxStr)

  const results: ScrapedEvent[] = []
  const BATCH = 8

  for (let i = 0; i < relevant.length; i += BATCH) {
    const batch = relevant.slice(i, i + BATCH)
    const pages = await Promise.allSettled(
      batch.map(({ url, eventId }) =>
        scrapeTavastiaPage(url).then((page) => ({ eventId, url, page }))
      )
    )
    for (const r of pages) {
      if (r.status !== 'fulfilled' || !r.value.page) continue
      const { eventId, url, page } = r.value
      results.push({
        id: `${page.venue_id}-${eventId}`,
        venue_id: page.venue_id,
        venue_name: page.venue_name,
        title: page.title,
        start_datetime: page.start_datetime,
        image_url: page.image_url,
        ticket_url: url,
        price_info: page.price_info,
        is_free: page.is_free,
      })
    }
    // Pieni viive batchien välissä — kunnioitetaan venue-palvelimia
    if (i + BATCH < relevant.length) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  return results
}

// ── Korjaamo ─────────────────────────────────────────────────────────────────
// WP REST API palauttaa kaikki tapahtumat — päivämäärä parsitaan content-kentästä.
// Yksi WP-post voi sisältää useamman tapahtumapäivän (esim. kuukausittain toistuva klubi).

interface KorjaamoWpEvent {
  id: number
  date: string                            // julkaisupäivä, EI tapahtumapäivä
  link: string
  title: { rendered: string }
  content: { rendered: string }
  _embedded?: { 'wp:featuredmedia'?: Array<{ source_url?: string }> }
}

function parseKorjaamoContent(
  rawHtml: string,
  pubDateStr: string
): Array<{ date: string; hour: string; minute: string; priceInfo: string | null; isFree: boolean }> {
  const text = rawHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const pubYear = parseInt(pubDateStr.slice(0, 4))
  const pubMonth = parseInt(pubDateStr.slice(5, 7))

  // Kerää kaikki päivämäärät: "DD.MM.YYYY" tai "DD.MM." (ilman vuotta)
  const dateRegex = /(\d{1,2})\.(\d{1,2})\.(?:(\d{4})\b)?/g
  const dates: string[] = []
  const seenDates = new Set<string>()
  let m: RegExpExecArray | null

  while ((m = dateRegex.exec(text)) !== null) {
    const day = parseInt(m[1])
    const month = parseInt(m[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) continue
    const year = m[3]
      ? parseInt(m[3])
      : month < pubMonth ? pubYear + 1 : pubYear
    if (year < 2024 || year > 2030) continue
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (!seenDates.has(iso)) { seenDates.add(iso); dates.push(iso) }
  }

  if (dates.length === 0) return []

  // Kelloaika: "klo HH:MM" > "klo HH" > "Ovet HH:MM" > "kesto HH:MM" > oletus 19:00
  let hour = '19'; let minute = '00'
  const kloFull  = text.match(/klo\s+(\d{1,2})[.:](\d{2})/)
  const kloHour  = !kloFull  ? text.match(/klo\s+(\d{1,2})\b/) : null
  const ovet     = !kloFull  ? text.match(/[Oo]vet(?:\s+auki)?\s+(\d{1,2})[.:](\d{2})/) : null
  const kesto    = (!kloFull && !ovet) ? text.match(/kesto\s+(\d{1,2})[.:](\d{2})/) : null

  if (kloFull)  { hour = kloFull[1].padStart(2, '0');  minute = kloFull[2].padStart(2, '0') }
  else if (kloHour) { hour = kloHour[1].padStart(2, '0'); minute = '00' }
  else if (ovet) { hour = ovet[1].padStart(2, '0');    minute = ovet[2].padStart(2, '0') }
  else if (kesto){ hour = kesto[1].padStart(2, '0');   minute = kesto[2].padStart(2, '0') }

  // Hinta
  const isFree = /vapaa\s+pääsy/i.test(text)
  const priceMatch = isFree ? null :
    text.match(/[Ll]iput[^\d]{0,30}?(\d+[,.]?\d*)\s*€/)
    ?? text.match(/alk(?:aen)?\.?\s*(\d+[,.]?\d*)\s*€/)
    ?? text.match(/(\d+[,.]?\d*)\s*€/)
  const priceInfo = isFree ? null : (priceMatch ? `alk. ${priceMatch[1].replace(',', '.')} €` : null)

  return dates.map((date) => ({ date, hour, minute, priceInfo, isFree }))
}

async function scrapeKorjaamo(): Promise<ScrapedEvent[]> {
  const res = await fetch(
    'https://korjaamo.fi/wp-json/wp/v2/event?per_page=100&_embed=1',
    {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(12000),
    }
  )
  if (!res.ok) throw new Error(`Korjaamo WP API HTTP ${res.status}`)
  const wpEvents: KorjaamoWpEvent[] = await res.json()

  const todayStr = new Date().toISOString().slice(0, 10)
  const results: ScrapedEvent[] = []
  const seen = new Set<string>()   // title+date -dedup (WP:ssä voi olla kaksoiskappaleita)

  for (const ev of wpEvents) {
    const title = decodeHtml(ev.title.rendered.replace(/<[^>]+>/g, '').trim())
    const image = ev._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null

    const parsedDates = parseKorjaamoContent(ev.content.rendered, ev.date)

    for (const { date, hour, minute, priceInfo, isFree } of parsedDates) {
      if (date < todayStr) continue
      const dedupKey = `${title}|${date}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      const id = parsedDates.length > 1
        ? `korjaamo-${ev.id}-${date}`
        : `korjaamo-${ev.id}`

      results.push({
        id,
        venue_id: 'korjaamo',
        venue_name: 'Korjaamo',
        title,
        start_datetime: `${date}T${hour}:${minute}:00+03:00`,
        image_url: image,
        ticket_url: ev.link,
        price_info: priceInfo,
        is_free: isFree,
      })
    }
  }

  return results
}

// ── Club Kaiku ────────────────────────────────────────────────────────────────
// Frontpage: schema.org Event -artikkeleita, itemprop="startDate" (UTC) + DOORS HH:MM tekstissä.
// Yksittäisiä tapahtumasivuja ei ole — kaikki data on etusivulla.

async function scrapeKaiku(): Promise<ScrapedEvent[]> {
  const res = await fetch('https://clubkaiku.fi/', {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Kaiku HTTP ${res.status}`)
  const html = await res.text()

  // <article itemtype="http://schema.org/Event">
  const articles =
    html.match(/<article[^>]+itemtype="http:\/\/schema\.org\/Event"[^>]*>[\s\S]*?<\/article>/g) ?? []

  const results: ScrapedEvent[] = []
  const todayStr = new Date().toISOString().slice(0, 10)

  for (const article of articles) {
    // Päivämäärä: itemprop="startDate" content="Wed Jun 24 2026 21:00:00 GMT+0000"
    // Sisältö on UTC — lisätään 3 h Helsinki-ajaksi (EEST, kesäaika)
    const sdMatch = article.match(/itemprop="startDate"\s+content="([^"(]+)/)
    if (!sdMatch) continue
    const utcDate = new Date(sdMatch[1].trim())
    if (isNaN(utcDate.getTime())) continue
    const dateStr = new Date(utcDate.toLocaleString('sv-SE', { timeZone: 'Europe/Helsinki' })).toISOString().slice(0, 10)
    if (dateStr < todayStr) continue

    // Otsikko: itemprop="name"
    const nameMatch = article.match(/itemprop="name"[^>]*>([\s\S]*?)<\/div>/)
    if (!nameMatch) continue
    const title = decodeHtml(nameMatch[1].replace(/<[^>]+>/g, '').trim())
    if (!title) continue

    // Kelloaika: "DOORS HH:MM" tai ensimmäinen "HH:MM[–-]" tekstissä
    const text = article.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const doorsMatch = text.match(/DOORS\s+(\d{2}:\d{2})/i)
    const timeMatch = doorsMatch ?? text.match(/(\d{2}:\d{2})[–-]/)
    const [hour, minute] = (doorsMatch?.[1] ?? timeMatch?.[1] ?? '22:00').split(':')

    // Tiketti-linkki (eventu.al)
    const ticketMatch = article.match(/href="(https:\/\/www\.eventu\.al\/[^"]+)"/)
    const ticket_url = ticketMatch?.[1] ?? 'https://clubkaiku.fi/'

    // Vapaa vai maksullinen
    const isFree = /FREE\s+ENTRY/i.test(text)
    const priceMatch = !isFree ? text.match(/(\d+[,.]?\d*)\s*€/) : null
    const price_info = isFree ? null : (priceMatch ? `alk. ${priceMatch[1].replace(',', '.')} €` : null)

    // ID: päivä + lyhyt otsikkoslug (Kaikussa yleensä yksi tapahtuma per yö)
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    results.push({
      id: `kaiku-${dateStr}-${slug}`,
      venue_id: 'kaiku',
      venue_name: 'Club Kaiku',
      title,
      start_datetime: `${dateStr}T${hour}:${minute}:00+03:00`,
      image_url: null,
      ticket_url,
      price_info,
      is_free: isFree,
    })
  }

  return results
}

// ── Storyville ───────────────────────────────────────────────────────────────
// Ohjelmasivu: itemprop-attribuutit schema.org Event -blokeissa + JSON-LD startDate.
// startDate-formaatti: "2026-6-23T19-19-00-00" — tunti on ensimmäinen pari (T{HH}-).

async function scrapeStoryville(): Promise<ScrapedEvent[]> {
  const res = await fetch('https://www.storyville.fi/ohjelma/', {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Storyville HTTP ${res.status}`)
  const html = await res.text()

  const todayStr = new Date().toISOString().slice(0, 10)
  const results: ScrapedEvent[] = []
  const seen = new Set<string>()

  const blocks = html.split('<div class="evo_event_schema"').slice(1)

  for (const block of blocks) {
    // URL
    const urlMatch = block.match(/href='(https:\/\/storyville\.fi\/events\/[^'?]+)/)
    if (!urlMatch) continue
    const eventUrl = urlMatch[1]

    // Nimi
    const nameMatch = block.match(/itemprop='name'\s*>([\s\S]*?)</)
    if (!nameMatch) continue
    const title = decodeHtml(nameMatch[1].trim())
    if (!title) continue

    // Päivämäärä + kelloaika JSON-LD:stä: "2026-6-23T19-19-00-00"
    const startMatch = block.match(/"startDate":\s*"(\d{4})-(\d{1,2})-(\d{1,2})T(\d{2})-/)
    if (!startMatch) continue
    const [, year, month, day, hour] = startMatch
    const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    if (dateStr < todayStr) continue

    const id = `storyville-${dateStr}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 35)}`
    if (seen.has(id)) continue
    seen.add(id)

    // Kuva — poistetaan thumbnail-suffiksi
    const imgMatch = block.match(/itemprop='image'\s+content='(https:\/\/[^']+)'/)
    const image_url = imgMatch
      ? imgMatch[1].replace(/-\d+x\d+(\.[a-z]+)$/, '$1')
      : null

    // Hinta / vapaa pääsy
    const descMatch = block.match(/itemprop='description'\s+content='([\s\S]*?)'/)
    const desc = descMatch?.[1] ?? ''
    const is_free = /vapaa\s+pääsy/i.test(desc)
    const priceMatch = !is_free ? desc.match(/(\d+)\s*€/) : null
    const price_info = is_free ? null : (priceMatch ? `${priceMatch[1]} €` : null)

    results.push({
      id,
      venue_id: 'storyville',
      venue_name: 'Storyville',
      title,
      start_datetime: `${dateStr}T${hour}:00:00+03:00`,
      image_url,
      ticket_url: eventUrl,
      price_info,
      is_free,
    })
  }

  return results
}

// ── Cron handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 })
  }

  const counts = { otr: 0, tavastia: 0, semifinal: 0, korjaamo: 0, kaiku: 0, storyville: 0 }
  const errors: string[] = []

  // Scrapataan kaikki paikat rinnakkain
  const [otrResult, tavastiaResult, korjaamoResult, kaikuResult, storyvilleResult] = await Promise.allSettled([
    scrapeOnTheRocks(),
    scrapeTavastia(),
    scrapeKorjaamo(),
    scrapeKaiku(),
    scrapeStoryville(),
  ])

  const allEvents: ScrapedEvent[] = []

  if (otrResult.status === 'fulfilled') {
    allEvents.push(...otrResult.value)
    counts.otr = otrResult.value.length
  } else {
    errors.push(`OTR: ${String(otrResult.reason)}`)
  }

  if (tavastiaResult.status === 'fulfilled') {
    allEvents.push(...tavastiaResult.value)
    counts.tavastia = tavastiaResult.value.filter((e) => e.venue_id === 'tavastia').length
    counts.semifinal = tavastiaResult.value.filter((e) => e.venue_id === 'semifinal').length
  } else {
    errors.push(`Tavastia: ${String(tavastiaResult.reason)}`)
  }

  if (korjaamoResult.status === 'fulfilled') {
    allEvents.push(...korjaamoResult.value)
    counts.korjaamo = korjaamoResult.value.length
  } else {
    errors.push(`Korjaamo: ${String(korjaamoResult.reason)}`)
  }

  if (kaikuResult.status === 'fulfilled') {
    allEvents.push(...kaikuResult.value)
    counts.kaiku = kaikuResult.value.length
  } else {
    errors.push(`Kaiku: ${String(kaikuResult.reason)}`)
  }

  if (storyvilleResult.status === 'fulfilled') {
    allEvents.push(...storyvilleResult.value)
    counts.storyville = storyvilleResult.value.length
  } else {
    errors.push(`Storyville: ${String(storyvilleResult.reason)}`)
  }

  // Upsert Supabaseen
  if (allEvents.length > 0) {
    const { error } = await supabaseAdmin
      .from('scraped_events')
      .upsert(
        allEvents.map((e) => ({ ...e, scraped_at: new Date().toISOString() })),
        { onConflict: 'id' }
      )
    if (error) {
      return NextResponse.json(
        { error: `Supabase upsert epäonnistui: ${error.message}` },
        { status: 500 }
      )
    }
  }

  // Siivotaan yli 2 päivää vanhat tapahtumat
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  await supabaseAdmin.from('scraped_events').delete().lt('start_datetime', cutoff)

  return NextResponse.json({
    ok: true,
    scraped: counts,
    total: allEvents.length,
    errors: errors.length > 0 ? errors : undefined,
    at: new Date().toISOString(),
  })
}
