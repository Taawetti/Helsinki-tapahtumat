// GitHub Actions -skripti: scrappaa Raflaamo Helsinki -tapahtumat Playwrightilla
// ja tallentaa Supabase scraped_events -tauluun.
// Ajetaan: node scripts/scrape-raflaamo.mjs
// Vaatii env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY vaaditaan')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function slug(str) {
  return str.toLowerCase().replace(/[^a-z0-9äöåÄÖÅ]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

function parseRaflaamoDate(raw) {
  if (!raw) return null

  // ISO-formaatti: "2026-06-24T19:00:00" tai "2026-06-24"
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?)/)
  if (iso) return iso[1].length === 10 ? `${iso[1]}T19:00:00+03:00` : `${iso[1]}+03:00`

  // Suomalainen formaatti: "24.6.2026"
  const fi = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (fi) {
    const [, d, m, y] = fi
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T19:00:00+03:00`
  }

  // Unix timestamp (ms tai s)
  const num = Number(raw)
  if (!isNaN(num) && num > 0) {
    const ms = num > 1e10 ? num : num * 1000
    return new Date(ms).toISOString()
  }

  return null
}

// Etsi tapahtumat rekursiivisesti JSON-objektista
function findEventsInObject(obj, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== 'object') return []
  const results = []

  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(...findEventsInObject(item, depth + 1))
    }
    return results
  }

  // Tunnistaa tapahtumaobjektin: pitää sisältää nimi + jokin aikakenttä
  const hasName = obj.name || obj.title || obj.eventName
  const hasTime = obj.startDate || obj.startTime || obj.time || obj.date || obj.dateTime
  if (hasName && hasTime) {
    results.push(obj)
  }

  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      results.push(...findEventsInObject(val, depth + 1))
    }
  }

  return results
}

function normalizeEvent(e) {
  return {
    name: e.name || e.title || e.eventName || '',
    startDate: e.startDate || e.startTime || e.time?.startDate || e.date || e.dateTime || e.time || '',
    image: e.image?.url || e.image || e.imageUrl || e.photo || '',
    urlPath: e.urlPath?.path || e.urlPath || e.url || e.slug || '',
    location: e.location?.restaurant?.name || e.location?.name || e.venue || e.restaurantName || '',
    shortDescription: e.shortDescription || e.description || '',
  }
}

async function scrapeRaflaamo(browser) {
  const page = await browser.newPage()

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'fi-FI,fi;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  // ── Strategia 1: Sieppaa API-vastaukset suoraan ─────────────
  const capturedApiEvents = []

  page.on('response', async (response) => {
    try {
      const url = response.url()
      const ct = response.headers()['content-type'] || ''
      if (!ct.includes('application/json')) return

      // Kiinnostaa vain eventeihin liittyvät kutsut
      if (!url.match(/event|tapahtumat|marketing|content/i)) return

      const body = await response.json().catch(() => null)
      if (!body) return

      const found = findEventsInObject(body)
      if (found.length > 0) {
        console.log(`API sieppaus ${url}: ${found.length} tapahtumaa`)
        capturedApiEvents.push(...found)
      }
    } catch { /* sivuutetaan */ }
  })

  console.log('Ladataan Raflaamo Helsinki -tapahtumat...')

  // Käytetään 'load' networkidle:n sijaan — networkidle aikakatkaistuu
  // kun Next.js-sovellus tekee jatkuvia taustapyyntöjä
  try {
    await page.goto('https://www.raflaamo.fi/fi/tapahtumat/helsinki', {
      waitUntil: 'load',
      timeout: 25000,
    })
  } catch (err) {
    console.warn('Goto timeout/virhe, jatketaan silti:', err.message)
  }

  // Annetaan clientin JS:lle aikaa ajaa ja API-kutsuille saapua
  await page.waitForTimeout(5000)

  // ── Strategia 2: Next.js __NEXT_DATA__ ─────────────────────
  const nextDataEvents = await page.evaluate(() => {
    try {
      const el = document.getElementById('__NEXT_DATA__')
      if (!el) return null
      const json = JSON.parse(el.textContent || '{}')

      // Etsitään tapahtumat pageProps:ista
      const pageProps = json?.props?.pageProps
      if (!pageProps) return null

      // Raflaamo saattaa tallentaa datan eri avaimilla
      const candidates = [
        pageProps.events,
        pageProps.initialData?.events,
        pageProps.data?.events,
        pageProps.marketingContent,
        pageProps.content,
      ].filter(Array.isArray)

      return candidates.length > 0 ? candidates[0] : null
    } catch { return null }
  })

  if (nextDataEvents && nextDataEvents.length > 0) {
    console.log(`__NEXT_DATA__: ${nextDataEvents.length} tapahtumaa`)
    await page.close()
    return nextDataEvents.map(normalizeEvent)
  }

  // ── Strategia 3: Apollo cache (vanha rakenne) ───────────────
  const apolloEvents = await page.evaluate(() => {
    try {
      const state = window.__APOLLO_STATE__ || window.__apollo_state__
      if (!state) return null
      const events = []
      for (const [key, val] of Object.entries(state)) {
        if ((key.startsWith('MarketingContentEvent:') || key.startsWith('Event:')) && val.name) {
          events.push({
            name: val.name,
            startDate: val.startDate || val.time?.startDate || val.date,
            image: val.image?.url || val.imageUrl,
            urlPath: val.urlPath?.path || val.slug,
            location: val.location?.restaurant?.name || val.venue,
            shortDescription: val.shortDescription || val.description,
          })
        }
      }
      return events.length > 0 ? events : null
    } catch { return null }
  })

  if (apolloEvents && apolloEvents.length > 0) {
    console.log(`Apollo cache: ${apolloEvents.length} tapahtumaa`)
    await page.close()
    return apolloEvents
  }

  // ── Strategia 4: Sieppattu API-data ────────────────────────
  if (capturedApiEvents.length > 0) {
    console.log(`API sieppaus yhteensä: ${capturedApiEvents.length} tapahtumaa`)
    await page.close()
    return capturedApiEvents.map(normalizeEvent)
  }

  // ── Strategia 5: DOM-fallback ───────────────────────────────
  console.log('Kaikki cache-strategiat tyhjät, parsitaan DOM...')
  const domEvents = await page.evaluate(() => {
    const results = []

    // Next.js renderöi usein data-attribuutteihin tai JSON-ld:hen
    const jsonLds = document.querySelectorAll('script[type="application/ld+json"]')
    for (const ld of jsonLds) {
      try {
        const data = JSON.parse(ld.textContent || '{}')
        const items = Array.isArray(data) ? data : [data]
        for (const item of items) {
          if (item['@type'] === 'Event' && item.name) {
            results.push({
              name: item.name,
              startDate: item.startDate,
              image: item.image,
              urlPath: item.url,
              location: item.location?.name,
              shortDescription: item.description,
            })
          }
        }
      } catch { /* sivuutetaan */ }
    }
    if (results.length > 0) return results

    // Perus DOM-haku
    const selectors = [
      'a[href*="/tapahtumat/"][href*="/fi/"]',
      '[data-testid*="event"]',
      'article',
      '[class*="EventCard"]',
      '[class*="event-card"]',
      '[class*="Event"]',
    ]
    const cards = document.querySelectorAll(selectors.join(', '))

    for (const card of cards) {
      const titleEl = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="name"], [class*="heading"]')
      const title = titleEl?.textContent?.trim()
      if (!title || title.length < 3) continue

      const timeEl = card.querySelector('time, [class*="date"], [class*="time"], [datetime]')
      const imgEl = card.querySelector('img')
      const link = card.tagName === 'A' ? card.href : card.querySelector('a')?.href

      results.push({
        name: title,
        startDate: timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim(),
        image: imgEl?.src || imgEl?.getAttribute('data-src'),
        urlPath: link ? new URL(link).pathname : null,
        location: '',
        shortDescription: '',
      })
    }

    return results
  })

  console.log(`DOM: ${domEvents.length} tapahtumaa`)
  await page.close()
  return domEvents
}

const todayStr = new Date().toISOString().slice(0, 10)
const cutoffStr = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })

let rawEvents = []
try {
  rawEvents = await scrapeRaflaamo(browser)
} catch (err) {
  console.error('Scrape epäonnistui:', err.message)
  await browser.close()
  // Poistutaan koodilla 0 — ei hälytystä GitHub Actionsissa
  // jos sivusto on väliaikaisesti alhaalla
  process.exit(0)
}
await browser.close()

if (!rawEvents || rawEvents.length === 0) {
  console.log('Ei tapahtumia löydetty — ei hälytystä')
  process.exit(0)
}

const BASE = 'https://www.raflaamo.fi'

const events = rawEvents
  .map((e) => {
    const startDatetime = parseRaflaamoDate(String(e.startDate || ''))
    if (!startDatetime) return null
    const dateStr = startDatetime.slice(0, 10)
    if (dateStr < todayStr || dateStr > cutoffStr) return null

    const title = (e.name || '').trim()
    if (!title) return null

    const urlPath = e.urlPath || ''
    const ticket_url = urlPath.startsWith('http') ? urlPath : `${BASE}${urlPath || '/fi/tapahtumat/helsinki'}`

    return {
      id: `raflaamo-${dateStr}-${slug(title)}`,
      venue_id: 'raflaamo',
      venue_name: e.location || 'Raflaamo',
      title,
      start_datetime: startDatetime,
      image_url: e.image || null,
      ticket_url,
      price_info: null,
      is_free: false,
      scraped_at: new Date().toISOString(),
    }
  })
  .filter(Boolean)

// Dedup
const seen = new Set()
const unique = events.filter((e) => {
  if (seen.has(e.id)) return false
  seen.add(e.id)
  return true
})

console.log(`Tallennetaan ${unique.length} tapahtumaa Supabaseen...`)

if (unique.length > 0) {
  const { error } = await supabase
    .from('scraped_events')
    .upsert(unique, { onConflict: 'id' })

  if (error) {
    console.error('Supabase upsert epäonnistui:', error.message)
    process.exit(1)
  }
}

// Siivotaan yli 2 päivää vanhat Raflaamo-tapahtumat
const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
await supabase
  .from('scraped_events')
  .delete()
  .eq('venue_id', 'raflaamo')
  .lt('start_datetime', cutoff)

console.log(`Valmis. ${unique.length} tapahtumaa tallennettu.`)
