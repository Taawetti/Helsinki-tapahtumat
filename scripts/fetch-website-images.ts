// Hakee ravintoloiden ESITTELYKUVAT niiden omilta nettisivuilta ja kirjoittaa
// data/website-images.json. Ajetaan viikoittain GitHub Actionsissa.
//
//     npx tsx scripts/fetch-website-images.ts                    # tuotantolistaa vasten
//     RESTAURANTS_URL=http://localhost:3000/api/restaurants \
//       npx tsx scripts/fetch-website-images.ts                  # paikallista vasten
//
// MIKSI. Googlen kuvaosoitteet lahoavat viikoissa (mitattu 49 % kuolleita), ja
// kuvien tallentaminen itselle olisi tekijänoikeusriski. Nettisivun oma
// og:image on se kuva, jonka ravintola on ITSE valinnut linkkiesikatseluihin —
// eli nimenomaan ulkopuolisten näytettäväksi. Se on ilmainen, pysyvä, ja
// vaihtuessaan tämä sama ajo hakee uuden. Sama menetelmä kuin festivaalikuvissa
// (lib/og-image.ts) — tämä on ravintoloiden mittakaavaan sovitettu versio.
//
// VAROVAISUUS:
//   – jokainen löydetty kuvaosoite TARKISTETAAN (status + kuvatyyppi) ennen
//     tallennusta — logo-osoite joka ei lataudu ei päädy kortille
//   – sivun hakuvirhe EI poista vanhaa merkintää: tilapäisesti nurin oleva
//     sivusto ei saa viedä kuvaa pois viikoksi. Kuolleet osoitteet karsii
//     erillinen harava (scripts/sweep-dead-images.ts).
//   – haetaan vain etusivu, 8 s aikakatkaisu, tunnistautuva User-Agent

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'data', 'website-images.json')
const RESTAURANTS_URL = process.env.RESTAURANTS_URL || 'https://helsinki-tapahtumat.vercel.app/api/restaurants'
const UA = 'Mozilla/5.0 (compatible; MitaTanaanBot/1.0; +https://mitatanaan.fi)'
const CONCURRENCY = 16

export interface WebsiteImageFile {
  fetchedAt: string
  /** Montako sivustoa käytiin läpi tällä ajolla. */
  checkedSites: number
  /** Avain = r.www täsmälleen siinä muodossa kuin API sen antaa. */
  byWww: Record<string, string>
}

/** OSM:n www-arvo → haettava osoite. Arvot ovat kirjavia ("gron.fi",
 *  "https://gron.fi/"). */
function toUrl(www: string): string | null {
  const s = www.trim()
  if (!s || s.length > 200) return null
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try { new URL(url); return url } catch { return null }
}

/** Poimii sivun esittelykuvan metatiedoista. Järjestys: og:image ensin, koska
 *  se on nimenomaan jakoihin tarkoitettu; twitter:image varalle. */
function extractOgImage(html: string, baseUrl: string): string | null {
  const metas = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ]
  for (const re of metas) {
    const m = re.exec(html)
    if (!m) continue
    const raw = m[1].trim()
    if (!raw || raw.startsWith('data:')) continue
    try {
      const abs = new URL(raw, baseUrl).toString()
      if (/^https?:\/\//i.test(abs)) return abs
    } catch { /* kelvoton osoite — kokeile seuraavaa metaa */ }
  }
  return null
}

/** Toimiiko kuvaosoite oikeasti? Status ja sisältötyyppi tarkistetaan, runko
 *  hylätään heti — vain kelvollinen kuva pääsee kortille. */
async function imageAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000),
    })
    try { await res.body?.cancel() } catch { /* jo suljettu */ }
    if (!res.ok) return false
    const type = res.headers.get('content-type') ?? ''
    return type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url)
  } catch {
    return false
  }
}

async function fetchSite(www: string): Promise<string | null> {
  const url = toUrl(www)
  if (!url) return null
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (type && !type.includes('html')) return null
    const html = await res.text()
    const og = extractOgImage(html, res.url || url)
    if (!og) return null
    return (await imageAlive(og)) ? og : null
  } catch {
    return null
  }
}

function loadPrevious(): Record<string, string> {
  if (!existsSync(OUT)) return {}
  try {
    const f = JSON.parse(readFileSync(OUT, 'utf8')) as WebsiteImageFile
    return f.byWww ?? {}
  } catch {
    return {}
  }
}

async function main() {
  console.log(`  ravintolalista: ${RESTAURANTS_URL}`)
  const res = await fetch(RESTAURANTS_URL, { signal: AbortSignal.timeout(180_000) })
  if (!res.ok) throw new Error(`ravintolalista: HTTP ${res.status}`)
  const data = await res.json() as { restaurants?: { www?: string | null }[] }
  const sites = [...new Set(
    (data.restaurants ?? [])
      .map((r) => (r.www ?? '').trim())
      .filter((w) => w.length > 0),
  )]
  console.log(`  sivustoja: ${sites.length}`)
  if (sites.length < 500) throw new Error('epäilyttävän vähän sivustoja — ei kirjoiteta')

  const found: Record<string, string> = {}
  let done = 0
  const queue = [...sites]
  async function worker() {
    for (;;) {
      const www = queue.shift()
      if (www === undefined) return
      const og = await fetchSite(www)
      done++
      if (og) found[www] = og
      if (done % 300 === 0) console.log(`  ${done}/${sites.length} sivustoa, kuvia ${Object.keys(found).length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`  valmis: ${sites.length} sivustoa, kuvia löytyi ${Object.keys(found).length}`)

  // ROMAHDUSVAHTI: jos kuvia löytyi vain kourallinen, verkko oli nurin —
  // vanha tiedosto on parempi kuin tyhjennetty.
  if (Object.keys(found).length < 200) {
    console.error('  EI KIRJOITETA — alle 200 löydettyä viittaa verkkovikaan')
    process.exit(1)
  }

  // Vanha merkintä säilyy ellei tilalle löytynyt uutta: yksittäisen sivuston
  // huono päivä ei vie sen kuvaa. Kuolleet karsii viikkoharava.
  const prev = loadPrevious()
  const byWww = { ...prev, ...found }
  const file: WebsiteImageFile = {
    fetchedAt: new Date().toISOString(),
    checkedSites: sites.length,
    byWww,
  }
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
  console.log(`  kirjoitettu ${OUT} (${Object.keys(byWww).length} kuvaa, joista uusia/päivittyneitä ${Object.keys(found).length})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
