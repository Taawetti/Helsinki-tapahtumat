// Feed-todellisuustarkistus: onko venue-/festivaalisivustoilla RSS/Atom/iCal-
// syötteitä, joita voisi lukea ILMAN AI:ta? Näyttää onko "feed-first"-malli
// elinkelpoinen. Vain luku (GET- pyynnöt etusivuille).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// Venue-sivustot (kuten lib/venue-pages.ts:n www-kentät — kovakoodattu näyte tähän)
const VENUES = [
  'https://tavastiaklubi.fi',
  'https://www.korjaamo.fi',
  'https://kaiku.fi',
  'https://www.on-the-rocks.fi',
  'https://www.storyville.fi',
  'https://savoyteatteri.fi',
  'https://malmitalo.fi',
  'https://vuotalo.fi',
]

interface FeedHit { site: string; feeds: string[]; wp: boolean; tribe: boolean }

async function checkSite(url: string): Promise<FeedHit> {
  const hit: FeedHit = { site: url, feeds: [], wp: false, tribe: false }
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; feed-check)' },
    })
    if (!res.ok) return hit
    const html = await res.text()

    // RSS/Atom link-tagit
    for (const m of html.matchAll(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*>/gi)) {
      const href = m[0].match(/href=["']([^"']+)["']/)
      if (href) hit.feeds.push(href[1])
    }
    // iCal/.ics-viittaukset
    for (const m of html.matchAll(/href=["']([^"']*(?:\.ics|ical|icalendar)[^"']*)["']/gi)) {
      hit.feeds.push(`ical:${m[1]}`)
    }
    // WordPress-signaalit
    hit.wp = /wp-content|wp-includes|\/wp-json\//.test(html)
    // The Events Calendar -plugin (tribe) — oma REST-API
    hit.tribe = /tribe-events|tribe_events/.test(html)
    // wp-json juuri olemassa?
    if (hit.wp) {
      try {
        const apiRes = await fetch(`${new URL(url).origin}/wp-json/`, { signal: AbortSignal.timeout(6000) })
        if (apiRes.ok) {
          const api = await apiRes.text()
          if (api.includes('tribe/events')) hit.feeds.push('wp-json:tribe/events (REST!)')
          else if (api.includes('/wp/v2/')) hit.feeds.push('wp-json:wp/v2 (posts)')
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return hit
}

async function main() {
  // Festivaalien info_url:t kannasta (aktiiviset, tulevat)
  const { data: fests } = await sb.from('festivals')
    .select('name, info_url, ticket_url').eq('active', true)
    .gte('start_date', new Date().toISOString().slice(0, 10))
    .limit(15)
  const festUrls = [...new Set(
    (fests ?? []).map(f => f.info_url || f.ticket_url).filter(Boolean)
      .map(u => { try { return new URL(u!).origin } catch { return null } })
      .filter(Boolean),
  )] as string[]

  console.log('── VENUE-SIVUSTOT ──')
  let venueHits = 0
  for (const v of VENUES) {
    const h = await checkSite(v)
    if (h.feeds.length) venueHits++
    console.log(`${h.feeds.length ? '✅' : '❌'} ${h.site}${h.wp ? ' [WP]' : ''}${h.tribe ? ' [tribe]' : ''}${h.feeds.length ? ' → ' + h.feeds.join(', ') : ''}`)
  }

  console.log(`\n── FESTIVAALISIVUSTOT (${festUrls.length} kpl) ──`)
  let festHits = 0
  for (const u of festUrls) {
    const h = await checkSite(u)
    if (h.feeds.length) festHits++
    console.log(`${h.feeds.length ? '✅' : '❌'} ${h.site}${h.wp ? ' [WP]' : ''}${h.tribe ? ' [tribe]' : ''}${h.feeds.length ? ' → ' + h.feeds.join(', ') : ''}`)
  }

  console.log(`\nYHTEENSÄ: venue ${venueHits}/${VENUES.length}, festivaalit ${festHits}/${festUrls.length} sivustoa tarjoaa syötteen`)
}

main().catch((e) => { console.error(e); process.exit(1) })
