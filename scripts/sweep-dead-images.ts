// Haravoi kuolleet kuvaosoitteet ja kirjoittaa data/dead-images.json.
// Ajetaan viikoittain samassa GitHub Actions -jobissa kuin syyt.
//
//     npx tsx scripts/sweep-dead-images.ts          # tarkista ja kirjoita
//
// MIKSI. Kuvat tulevat Googlen lh3.googleusercontent.com-osoitteista, ja ne
// LAHOAVAT: osoite toimii viikkoja–kuukausia ja alkaa sitten palauttaa 403.
// Mitattu 24.8.2026: satunnaisotos 60 kuvaa → 32 kuollutta (53 %). Sivu näytti
// rikkinäisiä kuvakkeita (omistaja: "tämä näyttää huonolta") ja — pahempaa —
// järjestys suosi kuvallisia kortteja tietämättä että kuva on kuollut.
//
// Tämä skripti tarkistaa jokaisen tallennetun kuvaosoitteen oikeasti (HTTP)
// ja kirjaa kuolleet. /api/restaurants ohittaa kirjatut osoitteet, jolloin
// kortti putoaa siististi emoji-laattaan ja kuvabonus poistuu. Ilmaista —
// ei yhtään maksullista hakua.
//
// VAATII: SUPABASE_URL (tai NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'data', 'dead-images.json')

/** Montako tarkistusta rinnakkain. lh3 on Googlen CDN — 16 rinnakkaista on
 *  kohteliasta ja koko haravointi kestää silti alle viisi minuuttia. */
const CONCURRENCY = 16

/** Nämä statukset tarkoittavat että osoite on aidosti kuollut. Verkkovirhe
 *  tai aikakatkaisu EI ole näyttöä — silloin kuvaa ei merkitä kuolleeksi. */
const DEAD_STATUSES = new Set([403, 404, 410])

export interface DeadImageFile {
  sweptAt: string
  checked: number
  dead: string[]
}

async function collectUrls(): Promise<string[]> {
  const urls = new Set<string>()

  // 1) Supabase-rikastuksen kuvat (ravintolat JA aktiviteetit — act:-avaimet
  //    ovat samassa taulussa).
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) throw new Error('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY vaaditaan')
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(
      `${base}/rest/v1/venue_ratings?select=main_image&main_image=not.is.null&limit=1000&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
    if (!res.ok) throw new Error(`venue_ratings: HTTP ${res.status}`)
    const rows = await res.json() as { main_image: string | null }[]
    if (!rows.length) break
    for (const r of rows) if (r.main_image) urls.add(r.main_image)
    if (rows.length < 1000) break
  }

  // 2) Uutuuskorttien kuvat (data/new-openings.json).
  const openingsPath = join(process.cwd(), 'data', 'new-openings.json')
  if (existsSync(openingsPath)) {
    try {
      const f = JSON.parse(readFileSync(openingsPath, 'utf8')) as { openings?: { image?: string | null }[] }
      for (const o of f.openings ?? []) if (o.image) urls.add(o.image)
    } catch { /* vioittunut tiedosto ei estä haravointia */ }
  }

  // 3) Nettisivuilta haetut esittelykuvat (data/website-images.json) — nekin
  //    voivat kadota kun sivusto uudistuu; harava huomaa, API ohittaa, ja
  //    seuraava nettisivuhaku tuo uuden osoitteen.
  const wwwPath = join(process.cwd(), 'data', 'website-images.json')
  if (existsSync(wwwPath)) {
    try {
      const f = JSON.parse(readFileSync(wwwPath, 'utf8')) as { byWww?: Record<string, string> }
      for (const u of Object.values(f.byWww ?? {})) urls.add(u)
    } catch { /* vioittunut tiedosto ei estä haravointia */ }
  }

  return [...urls]
}

/** true = kuollut, false = elossa, null = ei tietoa (verkkovirhe). */
async function probe(url: string): Promise<boolean | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-tapahtumat/1.0)' },
        signal: AbortSignal.timeout(10_000),
      })
      // Runko pois heti — vain status kiinnostaa.
      try { await res.body?.cancel() } catch { /* jo suljettu */ }
      if (res.ok) return false
      if (DEAD_STATUSES.has(res.status)) return true
      return null                       // 5xx tms. — ei tuomita
    } catch {
      // yritä kerran uudelleen; toisen epäonnistumisen jälkeen ei tietoa
    }
  }
  return null
}

async function main() {
  const urls = await collectUrls()
  console.log(`  tarkistettavia kuvaosoitteita: ${urls.length}`)
  if (urls.length < 100) throw new Error('epäilyttävän vähän osoitteita — ei kirjoiteta')

  const dead: string[] = []
  let checked = 0
  let unknown = 0
  const queue = [...urls]
  async function worker() {
    for (;;) {
      const url = queue.shift()
      if (!url) return
      const verdict = await probe(url)
      checked++
      if (verdict === true) dead.push(url)
      else if (verdict === null) unknown++
      if (checked % 500 === 0) console.log(`  ${checked}/${urls.length} tarkistettu, kuolleita ${dead.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const deadShare = dead.length / Math.max(1, checked - unknown)
  console.log(`  valmis: ${checked} tarkistettu, ${dead.length} kuollutta (${Math.round(deadShare * 100)} %), ${unknown} ilman tietoa`)

  // ROMAHDUSVAHTI: jos lähes kaikki näyttää kuolleelta, vika on verkossa tai
  // Googlen päässä hetkellisesti — vanha tiedosto on parempi kuin väärä.
  if (deadShare > 0.9) {
    console.error('  EI KIRJOITETA — yli 90 % kuolleita viittaa verkkovikaan')
    process.exit(1)
  }

  const file: DeadImageFile = { sweptAt: new Date().toISOString(), checked, dead: dead.sort() }
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
  console.log(`  kirjoitettu ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
