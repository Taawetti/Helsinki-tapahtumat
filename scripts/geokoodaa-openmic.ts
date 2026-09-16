// Open Mic Finland -paikkojen koordinaattien KERTAGENEROINTI
// → data/openmic-koordinaatit.json
//
// MIKSI: rajapinta antaa paikoille osoitteen mutta ei koordinaatteja
// (mitattu 16.9.2026: geo_lat 0/50). Ilman koordinaatteja jamit eivät näy
// kartalla eikä oppaan karttatilassa. Sama malli kuin geokoodaa-pubivisat.ts:
// Nominatim, 1 pyyntö/s, pk-seuturajaus, tulos tallennetaan pysyvästi ja
// uudelleenajo geokoodaa vain UUDET paikat:
//   npx tsx scripts/geokoodaa-openmic.ts

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fetchOpenmicRaw, mapOpenmicEvent, koordAvain, katuosoite, type Koordinaatit } from '../lib/openmic'
import { helsinkiDateRange } from '../lib/helsinki-time'

const POLKU = 'data/openmic-koordinaatit.json'
const UA = 'mitatanaan.fi geokoodaus (kertaluontoinen; yhteys: sivuston lomake)'

async function nominatim(q: string): Promise<{ lat: number; lon: number } | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) return null
  const rivit = (await res.json()) as { lat: string; lon: string }[]
  if (!rivit.length) return null
  const lat = Number(rivit[0].lat), lon = Number(rivit[0].lon)
  // Pk-seuturajaus: osuma väärässä kaupungissa hylätään mieluummin kuin
  // näytetään pinni Tampereella.
  if (lat < 59.9 || lat > 60.5 || lon < 24.4 || lon > 25.5) return null
  return { lat, lon }
}

;(async () => {
  const vanhat: Koordinaatit = existsSync(POLKU) ? JSON.parse(readFileSync(POLKU, 'utf8')) : {}
  const { start, end } = helsinkiDateRange(120)
  const raakat = await fetchOpenmicRaw(start, end)
  // Uniikit pk-seudun paikat (mapOpenmicEvent karsii muun Suomen)
  const paikat = new Map<string, { nimi: string; osoite: string; zip: string; city: string }>()
  for (const r of raakat) {
    const e = mapOpenmicEvent(r)
    if (!e || Array.isArray(r.venue) || !r.venue) continue
    const avain = koordAvain(r.venue.address, r.venue.city)
    if (!katuosoite(r.venue.address) || paikat.has(avain)) continue
    paikat.set(avain, { nimi: e.location?.name ?? '', osoite: katuosoite(r.venue.address), zip: r.venue.zip ?? '', city: r.venue.city ?? '' })
  }
  console.log(`raakarivejä ${raakat.length}, pk-seudun paikkoja ${paikat.size}, olemassa ${Object.keys(vanhat).length}`)
  let uusia = 0, ohi = 0
  for (const [avain, p] of paikat) {
    if (vanhat[avain]) continue
    await new Promise((r) => setTimeout(r, 1100))
    // Ensin tarkka (postinumero mukana), sitten pelkkä katu + kaupunki.
    const koord = (await nominatim(`${p.osoite}, ${p.zip} ${p.city}, Finland`))
      ?? (await (async () => { await new Promise((r) => setTimeout(r, 1100)); return nominatim(`${p.osoite}, ${p.city}, Finland`) })())
    if (koord) { vanhat[avain] = { ...koord, name: p.nimi }; uusia++; console.log(`  OK ${p.nimi} (${avain}) → ${koord.lat.toFixed(4)}, ${koord.lon.toFixed(4)}`) }
    else { ohi++; console.log(`  EI ${p.nimi} (${avain})`) }
  }
  writeFileSync(POLKU, JSON.stringify(vanhat, null, 1) + '\n')
  console.log(`VALMIS: uusia ${uusia}, ei löytynyt ${ohi}, yhteensä ${Object.keys(vanhat).length} → ${POLKU}`)
})()
