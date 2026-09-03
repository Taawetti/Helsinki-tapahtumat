// Sivutusvartija: jokaisella Supabasen .range()-sivutuksella on oltava
// .order() — muuten Postgres saa palauttaa rivit eri järjestyksessä eri
// sivuilla, jolloin rivejä putoaa väliin tai kahdentuu SATUNNAISESTI.
//
// Tämä on projektin toistuva bugiluokka: sama vika korjattiin analytiikan
// sivutuksesta (app/api/admin/stats) ja löytyi uudelleen ravintolareitin
// rikastushausta 3.9.2026 (app/api/restaurants). Oireet ovat ilkeitä, koska
// vika on satunnainen: kortti menettää kuvansa/arvosanansa yhdellä ajolla ja
// saa ne takaisin seuraavalla. Siksi vartija, ei muistinvarainen sääntö.
//
// Sääntö: .range(-kutsua saa edeltää korkeintaan 10 riviä ilman .order(-
// kutsua samassa ketjussa. Väärä hälytys kuitataan lisäämällä .order() —
// se ei ole koskaan haitaksi sivutuksessa.
//
// Ajetaan prebuildissa (package.json) — rikkova koodi ei pääse tuotantoon.
// Tahallaan ILMAN gitiä, jotta toimii myös Vercelin build-ympäristössä.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const KANSIOT = ['app', 'lib', 'scripts']
const IKKUNA = 10 // riviä taaksepäin joilta .order( on löydyttävä

function keraa(kansio: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(kansio, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(kansio, e.name)
    if (e.isDirectory()) out.push(...keraa(p))
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) out.push(p)
  }
  return out
}

const tiedostot = KANSIOT.flatMap(keraa)

let virheet = 0
for (const polku of tiedostot) {
  // Vartija itse puhuu .range():sta kommenteissa ja koodissa — ohitetaan.
  if (polku.endsWith('audit-pagination.ts')) continue
  const rivit = readFileSync(polku, 'utf8').split('\n')
  rivit.forEach((rivi, i) => {
    // Kommenttirivin .range()-maininta ei ole sivutuskutsu.
    const siisti = rivi.trim()
    if (siisti.startsWith('//') || siisti.startsWith('*')) return
    if (!rivi.includes('.range(')) return
    const alku = Math.max(0, i - IKKUNA)
    const ketju = rivit.slice(alku, i + 1).join('\n')
    if (!ketju.includes('.order(')) {
      console.error(`${polku}:${i + 1} — .range() ilman .order():a sivutusikkunassa`)
      virheet++
    }
  })
}

if (virheet > 0) {
  console.error(`\nSIVUTUSVARTIJA: ${virheet} sivutusta ilman järjestystä — lisää .order() ennen .range():a.`)
  process.exit(1)
}
console.log(`sivutusvartija: ${tiedostot.length} tiedostoa, kaikki .range()-kutsut järjestettyjä ✓`)
