// Pubivisabaarien koordinaattien KERTAGENEROINTI → data/pubivisa-koordinaatit.json
//
// MIKSI: pubivisat.fi antaa baareille vain nimen ja osoitteen. Ilman
// koordinaatteja visat eivät näy kartalla lainkaan (mitattu 6.9.2026:
// kartan Baari-suodatin oli tyhjä vaikka listalla oli 15 tapahtumaa).
// Ravintoladatan nimi+osoite-match kattaa vain osan (4/14), joten loput
// geokoodataan osoitteesta Nominatimilla (OpenStreetMap) ja tallennetaan
// pysyvästi — baarit eivät muuta. Uudelleenajo kun visalista kasvaa:
//   npx tsx scripts/geokoodaa-pubivisat.ts
//
// Nominatim-käytäntö: 1 pyyntö/s, tunnistava User-Agent. Tulokset rajataan
// pk-seudulle (59.9–60.5 / 24.4–25.5) — sen ulkopuolinen osuma hylätään
// mieluummin kuin näytetään pinni väärässä kaupungissa.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fetchVisas } from '../lib/pubivisat'

/** Katuavain: "Mäkelänkatu 45, 00550 Helsinki" → "mäkelänkatu 45" */
export function katuAvain(osoite: string): string {
  return osoite.toLowerCase().split(',')[0].trim().replace(/\s+/g, ' ')
}

const POLKU = 'data/pubivisa-koordinaatit.json'

async function geokoodaa(osoite: string): Promise<{ lat: number; lon: number } | null> {
  const q = encodeURIComponent(`${osoite.split(',')[0].trim()}, Helsinki, Finland`)
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`, {
    headers: { 'User-Agent': 'mitatanaan.fi geokoodaus (kertaluontoinen; yhteys: sivuston lomake)' },
  })
  if (!res.ok) return null
  const rivit = (await res.json()) as { lat: string; lon: string }[]
  if (!rivit.length) return null
  const lat = Number(rivit[0].lat)
  const lon = Number(rivit[0].lon)
  if (lat < 59.9 || lat > 60.5 || lon < 24.4 || lon > 25.5) return null
  return { lat, lon }
}

;(async () => {
  const vanhat: Record<string, { lat: number; lon: number; name: string }> =
    existsSync(POLKU) ? JSON.parse(readFileSync(POLKU, 'utf8')) : {}
  const visat = await fetchVisas()
  console.log(`visoja: ${visat.length}, olemassa olevia koordinaatteja: ${Object.keys(vanhat).length}`)
  let uusia = 0, ohi = 0
  for (const v of visat) {
    const avain = katuAvain(v.address)
    if (!avain || vanhat[avain]) continue
    await new Promise((r) => setTimeout(r, 1100))
    const koord = await geokoodaa(v.address)
    if (koord) {
      vanhat[avain] = { ...koord, name: v.name }
      uusia++
      console.log(`  OK ${v.name} (${avain}) → ${koord.lat.toFixed(4)}, ${koord.lon.toFixed(4)}`)
    } else {
      ohi++
      console.log(`  EI ${v.name} (${avain})`)
    }
  }
  writeFileSync(POLKU, JSON.stringify(vanhat, null, 1) + '\n')
  console.log(`VALMIS: uusia ${uusia}, ei löytynyt ${ohi}, yhteensä ${Object.keys(vanhat).length} → ${POLKU}`)
})()
