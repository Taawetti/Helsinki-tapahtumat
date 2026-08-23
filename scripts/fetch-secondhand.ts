// Hakee KIRPPUTORIT JA SECOND HAND -LIIKKEET OpenStreetMapista ja kirjoittaa
// data/secondhand.json. Ajetaan viikoittain samassa GitHub Actions -jobissa
// kuin muutkin haut. Ei salaisuuksia, ei kustannuksia.
//
//     npx tsx scripts/fetch-secondhand.ts          # hae ja kirjoita
//
// MIKSI. /kirpputorit-opas (omistajan valinta): second hand -Helsinkiä ei ole
// koottu missään — liikkeet + viikonlopun kirppistapahtumat yhdessä. Liikkeet
// tulevat OSM:stä samalla Overpass-kuviolla kuin aktiviteetit; tapahtumat
// hakee sivu itse LinkedEventsistä.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'data', 'secondhand.json')
const OVERPASS = 'https://overpass-api.de/api/interpreter'

export interface SecondhandShop {
  name: string
  lat: number
  lon: number
  address: string | null
  openingHours: string | null
  www: string | null
}

export interface SecondhandFile {
  fetchedAt: string
  shops: SecondhandShop[]
}

async function main() {
  // Koko pääkaupunkiseutu — kirppisreissu ulottuu Espooseen ja Vantaalle.
  const q = `[out:json][timeout:120];
(
  area["boundary"="administrative"]["admin_level"="8"]["name"="Helsinki"];
  area["boundary"="administrative"]["admin_level"="8"]["name"="Espoo"];
  area["boundary"="administrative"]["admin_level"="8"]["name"="Vantaa"];
)->.pks;
nwr["shop"~"^(second_hand|charity|antiques)$"](area.pks);
out tags center;`
  const res = await fetch(OVERPASS, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(q),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass palauttaa 406 ilman tunnistautuvaa User-Agentia — mitattu.
      'User-Agent': 'MitaTanaanBot/1.0 (+https://mitatanaan.fi)',
    },
    signal: AbortSignal.timeout(150_000),
  })
  if (!res.ok) throw new Error(`overpass: HTTP ${res.status}`)
  const data = await res.json() as {
    elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]
  }

  const seen = new Set<string>()
  const shops: SecondhandShop[] = []
  for (const el of data.elements ?? []) {
    const t = el.tags ?? {}
    if (!t.name) continue
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (typeof lat !== 'number' || typeof lon !== 'number') continue
    // Sama liike solmuna ja alueena → yksi rivi.
    const key = `${t.name.toLowerCase()}|${lat.toFixed(3)}|${lon.toFixed(3)}`
    if (seen.has(key)) continue
    seen.add(key)
    const address = t['addr:street']
      ? `${t['addr:street']}${t['addr:housenumber'] ? ' ' + t['addr:housenumber'] : ''}`
      : null
    shops.push({
      name: t.name,
      lat, lon,
      address,
      openingHours: t.opening_hours ?? null,
      www: t.website ?? t['contact:website'] ?? null,
    })
  }
  shops.sort((a, b) => a.name.localeCompare(b.name, 'fi'))
  console.log(`  liikkeitä: ${shops.length}`)

  // ROMAHDUSVAHTI: pääkaupunkiseudulla on kymmeniä second hand -liikkeitä —
  // vähempi tarkoittaa hakuvikaa, ja vanha tiedosto on parempi kuin tyhjä.
  if (shops.length < 15) {
    console.error('  EI KIRJOITETA — alle 15 liikettä viittaa hakuvikaan')
    if (existsSync(OUT)) {
      const prev = JSON.parse(readFileSync(OUT, 'utf8')) as SecondhandFile
      console.error(`  vanhassa tiedostossa ${prev.shops?.length ?? 0} liikettä — jätetään ennalleen`)
    }
    process.exit(1)
  }

  const file: SecondhandFile = { fetchedAt: new Date().toISOString(), shops }
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
  console.log(`  kirjoitettu ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
