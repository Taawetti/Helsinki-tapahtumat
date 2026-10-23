// Hakee OSM-aktiviteettien OTOKSEN Overpassista ja kirjoittaa
// data/aktiviteetit-osm.json — pyyntöpolun POHJAOTOS, jota /api/activities
// käyttää kun Supabase Storagen otosta ei ole (ensimmäinen deploy, Storage
// alhaalla, paikallinen kehitys ilman avaimia). Tuotannossa otoksen päivittää
// päivittäin /api/cron/osm-otos; tämä skripti on sama putki käsin ajettuna.
//
//     npx tsx scripts/hae-osm-otos.ts                                          # hae ja kirjoita tiedosto
//     node --env-file=.env.local --import tsx scripts/hae-osm-otos.ts --varastoon   # + vie Storageen
//     npx tsx scripts/hae-osm-otos.ts --tiedostosta /polku/overpass.json          # tulkitse valmis Overpass-vastaus
//
// ROMAHDUSVAHTI (tarkistaOtos): alle 1 500 kohdetta, alle 20 saunaa tai alle
// 40 museota tarkoittaa hakuvikaa (23.10.2026: 3 175 / 43 / 92), eikä
// tiedostoa kirjoiteta — vanha otos on parempi kuin vajaa.

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  haeOsmAktiviteetit,
  elementitAktiviteeteiksi,
  tarkistaOtos,
  kirjoitaOtosVarastoon,
  lueOtosVarastosta,
  type OsmOtos,
  type OsmElement,
} from '../lib/osm-aktiviteetit'

const OUT = join(process.cwd(), 'data', 'aktiviteetit-osm.json')
const args = process.argv.slice(2)
const VARASTOON = args.includes('--varastoon')
const tiedostoIdx = args.indexOf('--tiedostosta')
const TIEDOSTOSTA = tiedostoIdx >= 0 ? args[tiedostoIdx + 1] : null

/** Yksi kohde per rivi: git-diff näyttää muuttuneet kohteet eikä yhtä
 *  700 kt:n riviä, ja tiedosto pysyy puolta pienempänä kuin sisennettynä. */
export function otosTiedostoksi(otos: OsmOtos): string {
  const rivit = otos.activities.map((a) => '  ' + JSON.stringify(a))
  return `{"fetchedAt":${JSON.stringify(otos.fetchedAt)},"peili":${JSON.stringify(otos.peili)},"activities":[\n${rivit.join(',\n')}\n]}\n`
}

async function main() {
  const edellinen: OsmOtos | null = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as OsmOtos) : null
  if (edellinen) console.log(`Edellinen pohjaotos: ${edellinen.activities.length} kohdetta (${edellinen.fetchedAt})`)

  let otos: OsmOtos
  if (TIEDOSTOSTA) {
    const raaka = JSON.parse(readFileSync(TIEDOSTOSTA, 'utf8')) as { elements?: OsmElement[]; remark?: string }
    if (raaka.remark) console.warn(`  HUOM Overpass remark: ${raaka.remark}`)
    otos = { fetchedAt: new Date().toISOString(), peili: `tiedosto:${TIEDOSTOSTA}`, activities: elementitAktiviteeteiksi(raaka.elements ?? []) }
  } else {
    console.log('Haetaan Overpassista…')
    const haku = await haeOsmAktiviteetit({ budjettiMs: 300_000, aikakatkaisuMs: 120_000 })
    for (const y of haku.yritykset) console.log(`  ${new URL(y.peili).host}: ${y.virhe ?? 'ok'} (${y.ms} ms)`)
    otos = { fetchedAt: new Date().toISOString(), peili: haku.peili, activities: haku.activities }
  }

  const lkm = (c: string) => otos.activities.filter((a) => a.category === c).length
  console.log(`  kohteita ${otos.activities.length}: saunoja ${lkm('sauna')}, museoita ${lkm('museo')}, gallerioita ${lkm('galleria')}, puistoja ${lkm('puisto')}`)

  const tarkistus = tarkistaOtos(otos.activities, edellinen?.activities ?? null)
  if (!tarkistus.ok) {
    console.error(`  EI KIRJOITETA — ${tarkistus.syy}`)
    process.exit(1)
  }

  writeFileSync(OUT, otosTiedostoksi(otos))
  console.log(`  kirjoitettu ${OUT} (${Math.round(statSync(OUT).size / 1024)} kt)`)

  if (VARASTOON) {
    const vanha = await lueOtosVarastosta()
    const { tavua } = await kirjoitaOtosVarastoon(otos)
    console.log(`  viety Storageen (${Math.round(tavua / 1024)} kt); edellinen otos varastossa: ${vanha?.fetchedAt ?? 'ei ollut'}`)
    const luettu = await lueOtosVarastosta()
    if (!luettu || luettu.fetchedAt !== otos.fetchedAt) {
      console.error('  LUKU TAKAISIN EPÄONNISTUI — varastossa ei ole juuri vietyä otosta')
      process.exit(1)
    }
    console.log(`  luku takaisin ok: ${luettu.activities.length} kohdetta, ${luettu.fetchedAt}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
