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

  // Suomalainen formaatti: "24.6.2026" tai "24.6."
  const fi = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (fi) {
    const [, d, m, y] = fi
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T19:00:00+03:00`
  }

  return null
}

async function scrapeRaflaamo(browser) {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'fi-FI,fi;q=0.9' })

  console.log('Haetaan Raflaamo Helsinki -tapahtumat...')
  await page.goto('https://www.raflaamo.fi/fi/tapahtumat/helsinki', {
    waitUntil: 'networkidle',
    timeout: 30000,
  })

  // Odotetaan tapahtumakortit näkyviin
  await page.waitForTimeout(3000)

  // Yritetään löytää tapahtumadata Apollo-cachesta (window.__APOLLO_STATE__)
  const apolloEvents = await page.evaluate(() => {
    const state = window.__APOLLO_STATE__ || window.__apollo_state__
    if (!state) return null
    const events = []
    for (const [key, val] of Object.entries(state)) {
      if (key.startsWith('MarketingContentEvent:') && val.name && val.time) {
        events.push({
          id: key,
          name: val.name,
          shortDescription: val.shortDescription || '',
          startDate: val.time?.startDate,
          endDate: val.time?.endDate,
          urlPath: val.urlPath?.path,
          image: val.image?.url,
          location: val.location?.restaurant?.name,
          prices: val.prices,
        })
      }
    }
    return events.length > 0 ? events : null
  })

  if (apolloEvents && apolloEvents.length > 0) {
    console.log(`Apollo cache: ${apolloEvents.length} tapahtumaa`)
    await page.close()
    return apolloEvents
  }

  // Fallback: parsitaan renderöity DOM
  console.log('Apollo cache tyhjä, parsitaan DOM...')
  const domEvents = await page.evaluate(() => {
    const results = []
    // Raflaamo renderöi tapahtumakortit linkkeinä
    const cards = document.querySelectorAll('a[href*="/tapahtumat/"][href*="/"], article, [class*="EventCard"], [class*="event-card"]')
    for (const card of cards) {
      const titleEl = card.querySelector('h2, h3, h4, [class*="title"], [class*="name"]')
      const title = titleEl?.textContent?.trim()
      if (!title || title.length < 3) continue

      const timeEl = card.querySelector('time, [class*="date"], [class*="time"]')
      const imgEl = card.querySelector('img')
      const link = card.tagName === 'A' ? card.href : card.querySelector('a')?.href

      results.push({
        name: title,
        startDate: timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim(),
        image: imgEl?.src || imgEl?.getAttribute('data-src'),
        urlPath: link ? new URL(link).pathname : null,
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

const browser = await chromium.launch({ args: ['--no-sandbox'] })

let rawEvents = []
try {
  rawEvents = await scrapeRaflaamo(browser)
} catch (err) {
  console.error('Scrape epäonnistui:', err)
  await browser.close()
  process.exit(1)
}
await browser.close()

if (!rawEvents || rawEvents.length === 0) {
  console.log('Ei tapahtumia löydetty')
  process.exit(0)
}

const BASE = 'https://www.raflaamo.fi'

const events = rawEvents
  .map((e) => {
    const startDatetime = parseRaflaamoDate(e.startDate)
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
