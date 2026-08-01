// Vain luku: kuinka moni festivals-taulun festivaali löytyisi myös
// Ticketmasterista tai LinkedEventsistä (ilmaisia lähteitä).
// Kertoo onko weekly-discover tarpeellinen vai redundantti.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const TM_KEY = env.TICKETMASTER_API_KEY

function norm(s: string): string {
  return s.toLowerCase()
    .replace(/20\d{2}/g, '')
    .replace(/[^a-zåäö0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
// Pehmeä osuma: kaikki ≥4-merkkiset hakusanat löytyvät kohteesta (tai päinvastoin)
function fuzzyMatch(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b)
  if (!na || !nb) return false
  if (na.includes(nb) || nb.includes(na)) return true
  const words = na.split(' ').filter(w => w.length >= 4)
  return words.length > 0 && words.every(w => nb.includes(w))
}

async function tmSearch(name: string): Promise<string | null> {
  if (!TM_KEY) return null
  try {
    const kw = norm(name).split(' ').slice(0, 4).join(' ')
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TM_KEY}&city=Helsinki&keyword=${encodeURIComponent(kw)}&size=5`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    const events = data?._embedded?.events ?? []
    const hit = events.find((e: { name: string }) => fuzzyMatch(name, e.name))
    return hit ? hit.name : null
  } catch { return null }
}

async function leSearch(name: string): Promise<string | null> {
  try {
    const kw = norm(name).split(' ').slice(0, 3).join(' ')
    const url = `https://api.hel.fi/linkedevents/v1/event/?text=${encodeURIComponent(kw)}&division=helsinki&page_size=10&format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    const events = data?.data ?? []
    const hit = events.find((e: { name?: { fi?: string; en?: string } }) =>
      fuzzyMatch(name, e.name?.fi ?? '') || fuzzyMatch(name, e.name?.en ?? ''))
    return hit ? (hit.name?.fi ?? hit.name?.en) : null
  } catch { return null }
}

async function main() {
  const { data: festivals } = await sb.from('festivals')
    .select('id, name, start_date, active').eq('active', true)
    .gte('start_date', new Date().toISOString().slice(0, 10)) // vain tulevat
    .order('start_date')
  console.log(`Tulevia aktiivisia festivaaleja: ${festivals?.length ?? 0}\n`)

  let tm = 0, le = 0, either = 0
  const neither: string[] = []
  for (const f of festivals ?? []) {
    const [tmHit, leHit] = await Promise.all([tmSearch(f.name), leSearch(f.name)])
    if (tmHit) tm++
    if (leHit) le++
    if (tmHit || leHit) either++
    else neither.push(`${f.name} (${f.start_date})`)
    await new Promise(r => setTimeout(r, 150)) // kohteliaisuus
  }

  const total = festivals?.length ?? 1
  console.log(`Ticketmasterista löytyi:  ${tm}/${total}`)
  console.log(`LinkedEventsistä löytyi:  ${le}/${total}`)
  console.log(`Jommastakummasta löytyi: ${either}/${total} (${Math.round((either / total) * 100)}%)`)
  console.log(`\nEI löydy ilmaisista lähteistä (${neither.length} kpl) — näissä weekly-discover tuo arvoa:`)
  for (const n of neither) console.log(`  - ${n}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
