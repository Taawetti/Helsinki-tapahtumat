// Backfill: hakee festivaalikuvat festareiden omilta sivuilta ja päivittää
// Supabase `festivals.image`-kentän kuvattomille aktiivisille festivaaleille.
//
// Turvallinen oletus: KUIVA-AJO (näyttää mitä tekisi, ei kirjoita mitään).
//   npx tsx scripts/backfill-festival-images.ts              → kuiva-ajo, näyte 8
//   npx tsx scripts/backfill-festival-images.ts --sample 20  → kuiva-ajo, näyte 20
//   npx tsx scripts/backfill-festival-images.ts --write      → KIRJOITA kaikki kuvattomat
//
// Ympäristö: aja `set -a; source .env.local; set +a` ensin (SUPABASE_SERVICE_ROLE_KEY).

import { fetchFestivalImage } from '../lib/og-image'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const WRITE = process.argv.includes('--write')
// --borrow: täytä yhä kuvattomat festarit lainaamalla kuva SAMAN sarjan
// tapahtumalta live-feedistä (esim. Craft Beer Garden festivals-rivi lainaa
// LinkedEventsin "Craft Beer Garden Festival 2026" -kuvan). Pysyvä (tauluun).
const BORROW = process.argv.includes('--borrow')
const FEED_BASE = process.env.FEED_BASE ?? 'http://localhost:3000'
const sampleIdx = process.argv.indexOf('--sample')
const SAMPLE = sampleIdx >= 0 ? parseInt(process.argv[sampleIdx + 1] ?? '8', 10) : (WRITE ? Infinity : 8)
const BATCH = 6

interface Fest { id: string; name: string; info_url: string | null; ticket_url: string | null; start_date?: string; end_date?: string }

const seriesKey = (title: string): string => {
  const base = (title || '')
    .replace(/\s*\|.*$/, '').replace(/\b20\d{2}\b/g, '').replace(/\s*\(päivä\s*\d+\/\d+\)/gi, '')
    .replace(/[^\wäöåÄÖÅ\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const w = base.split(' ').filter(Boolean)
  return w.length >= 3 ? w.slice(0, 3).join(' ') : ''
}

async function patchImage(id: string, image: string): Promise<boolean> {
  const up = await fetch(`${SUPABASE_URL}/rest/v1/festivals?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ image }),
  })
  return up.ok
}

// Borrow-vaihe: hakee festarin omalta ajanjaksolta feedin ja etsii saman sarjan
// (3 ensimmäistä sanaa) kuvallisen tapahtuman toisesta lähteestä.
async function borrowPass() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/festivals?select=id,name,start_date,end_date&active=eq.true&image=is.null`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  )
  const rows = (await res.json()) as Fest[]
  console.log(`Borrow-vaihe: ${rows.length} yhä kuvatonta. Feed: ${FEED_BASE}. Tila: ${WRITE ? 'KIRJOITA' : 'KUIVA-AJO'}\n`)
  let borrowed = 0, written = 0
  for (const f of rows) {
    const key = seriesKey(f.name)
    if (!key || !f.start_date) continue
    // Ikkuna festarin ympärille (−3…end+3 pv): kattaa festarin päivät sekä saman
    // sarjan tapahtumat muista lähteistä, myös hieman ennen tallennettua alkua
    // (esim. Craft Beer Garden LinkedEventsissä pe, festivals-rivi alkaa la).
    const winStart = new Date(new Date(f.start_date).getTime() - 3 * 86400000).toISOString().slice(0, 10)
    const winEnd = new Date(new Date(f.end_date || f.start_date).getTime() + 3 * 86400000).toISOString().slice(0, 10)
    let img: string | null = null
    try {
      const feed = await fetch(`${FEED_BASE}/api/events?start=${winStart}&end=${winEnd}&municipality=helsinki`, { signal: AbortSignal.timeout(60000) })
      const evs = (await feed.json()).events ?? []
      for (const e of evs) {
        if (e.image && seriesKey(e.title) === key && e.source !== 'festivals') { img = e.image; break }
      }
    } catch { /* feed-haku epäonnistui */ }
    if (img) {
      borrowed++
      console.log(`✓ ${f.name}\n    ↩ ${img.slice(0, 80)}`)
      if (WRITE && await patchImage(f.id, img)) written++
    }
  }
  console.log(`\n── Borrow yhteenveto ──\nLainattu: ${borrowed}${WRITE ? `, kirjoitettu ${written}` : ''} (${rows.length} kuvattomasta)`)
}

async function main() {
  if (!SUPABASE_URL || !KEY) {
    console.error('Puuttuu NEXT_PUBLIC_SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY. Aja: set -a; source .env.local; set +a')
    process.exit(1)
  }
  if (BORROW) { await borrowPass(); return }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/festivals?select=id,name,info_url,ticket_url&active=eq.true&image=is.null`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  )
  const rows = (await res.json()) as Fest[]
  if (!Array.isArray(rows)) { console.error('Kysely epäonnistui:', JSON.stringify(rows).slice(0, 200)); process.exit(1) }

  const target = SAMPLE === Infinity ? rows : rows.slice(0, SAMPLE)
  console.log(`Kuvattomia aktiivisia festareita: ${rows.length}`)
  console.log(`Tila: ${WRITE ? '🖊  KIRJOITA' : '🔍 KUIVA-AJO (ei kirjoita)'}${SAMPLE !== Infinity ? `, näyte ${target.length}` : ''}\n`)

  let found = 0, missing = 0, written = 0
  const misses: string[] = []

  for (let i = 0; i < target.length; i += BATCH) {
    const batch = target.slice(i, i + BATCH)
    await Promise.all(batch.map(async (f) => {
      const img = await fetchFestivalImage(f.info_url, f.ticket_url)
      if (img) {
        found++
        console.log(`✓ ${f.name}\n    → ${img}`)
        if (WRITE) {
          const up = await fetch(`${SUPABASE_URL}/rest/v1/festivals?id=eq.${encodeURIComponent(f.id)}`, {
            method: 'PATCH',
            headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ image: img }),
          })
          if (up.ok) written++
          else console.log(`    ⚠️ kirjoitus epäonnistui (${up.status})`)
        }
      } else {
        missing++
        misses.push(f.name)
      }
    }))
  }

  console.log(`\n── Yhteenveto ──`)
  console.log(`Kuva löytyi:     ${found}`)
  console.log(`Ei kuvaa:        ${missing}`)
  if (WRITE) console.log(`Kirjoitettu:     ${written}`)
  console.log(`Käsitelty:       ${target.length}/${rows.length}`)
  if (misses.length) console.log(`\nIlman kuvaa jääneet:\n  ${misses.slice(0, 30).join('\n  ')}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
