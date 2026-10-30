// Hakee OSM-ravintoloiden OTOKSEN Overpassista ja kirjoittaa
// data/ravintolat-osm.json — pyyntöpolun POHJAOTOS, jota /api/restaurants
// käyttää kun Supabase Storagen otosta ei ole (ensimmäinen deploy, Storage
// alhaalla, paikallinen kehitys ilman avaimia). Tuotannossa otoksen päivittää
// päivittäin /api/cron/osm-ravintolat; tämä skripti on sama putki käsin.
//
//     npx tsx scripts/hae-osm-ravintolat.ts                                              # hae ja kirjoita tiedosto
//     node --env-file=.env.local --import tsx scripts/hae-osm-ravintolat.ts --varastoon  # + vie Storageen
//     npx tsx scripts/hae-osm-ravintolat.ts --tiedostosta /polku/overpass.json           # karsi valmis Overpass-vastaus
//
// ROMAHDUSVAHTI (tarkistaRavintolaOtos): alle 2 000 kohdetta, alle 1 000
// ravintolaa, alle 300 kahvilaa tai alle 250 baaria tarkoittaa hakuvikaa
// (30.10.2026: 3 583 / 1 868 / 626 / 513), eikä tiedostoa kirjoiteta —
// vanha otos on parempi kuin vajaa.

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  haeOsmRavintolat,
  karsiRavintolaElementit,
  tarkistaRavintolaOtos,
  kirjoitaRavintolaOtosVarastoon,
  lueRavintolaOtosVarastosta,
  ravintolaOtosTiedostoksi,
  type RavintolaOtos,
  type OsmElement,
} from '../lib/osm-ravintolat'

const OUT = join(process.cwd(), 'data', 'ravintolat-osm.json')
const args = process.argv.slice(2)
const VARASTOON = args.includes('--varastoon')
const tiedostoIdx = args.indexOf('--tiedostosta')
const TIEDOSTOSTA = tiedostoIdx >= 0 ? args[tiedostoIdx + 1] : null

async function main() {
  const edellinen: RavintolaOtos | null = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as RavintolaOtos) : null
  if (edellinen) console.log(`Edellinen pohjaotos: ${edellinen.elements.length} kohdetta (${edellinen.fetchedAt})`)

  let otos: RavintolaOtos
  if (TIEDOSTOSTA) {
    const raaka = JSON.parse(readFileSync(TIEDOSTOSTA, 'utf8')) as { elements?: OsmElement[]; remark?: string; osm3s?: { timestamp_osm_base?: string } }
    if (raaka.remark) console.warn(`  HUOM Overpass remark: ${raaka.remark}`)
    // fetchedAt on Overpassin oma tietokantaleima, jos vastauksessa on sellainen:
    // se kertoo DATAN iän, ei tiedoston kirjoitushetkeä.
    otos = {
      fetchedAt: raaka.osm3s?.timestamp_osm_base ?? new Date().toISOString(),
      peili: `tiedosto:${basename(TIEDOSTOSTA)}`,
      elements: karsiRavintolaElementit(raaka.elements ?? []),
    }
  } else {
    console.log('Haetaan Overpassista…')
    const haku = await haeOsmRavintolat({ budjettiMs: 300_000, aikakatkaisuMs: 120_000 })
    for (const y of haku.yritykset) console.log(`  ${new URL(y.peili).host}: ${y.virhe ?? 'ok'} (${y.ms} ms)`)
    otos = { fetchedAt: new Date().toISOString(), peili: haku.peili, elements: haku.elements }
  }

  const lkm = (...amenityt: string[]) => otos.elements.filter((e) => amenityt.includes(e.tags?.amenity ?? '')).length
  console.log(`  kohteita ${otos.elements.length}: ravintoloita ${lkm('restaurant')}, kahviloita ${lkm('cafe')}, baareja ${lkm('bar', 'pub', 'biergarten')}, pikaruokaa ${lkm('fast_food', 'food_court')}, yökerhoja ${lkm('nightclub')}`)

  const tarkistus = tarkistaRavintolaOtos(otos.elements, edellinen?.elements ?? null)
  if (!tarkistus.ok) {
    console.error(`  EI KIRJOITETA — ${tarkistus.syy}`)
    process.exit(1)
  }

  writeFileSync(OUT, ravintolaOtosTiedostoksi(otos))
  console.log(`  kirjoitettu ${OUT} (${Math.round(statSync(OUT).size / 1024)} kt)`)

  if (VARASTOON) {
    const vanha = await lueRavintolaOtosVarastosta()
    const { tavua } = await kirjoitaRavintolaOtosVarastoon(otos)
    console.log(`  viety Storageen (${Math.round(tavua / 1024)} kt); edellinen otos varastossa: ${vanha?.fetchedAt ?? 'ei ollut'}`)
    const luettu = await lueRavintolaOtosVarastosta()
    if (!luettu || luettu.fetchedAt !== otos.fetchedAt) {
      console.error('  LUKU TAKAISIN EPÄONNISTUI — varastossa ei ole juuri vietyä otosta')
      process.exit(1)
    }
    console.log(`  luku takaisin ok: ${luettu.elements.length} kohdetta, ${luettu.fetchedAt}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
