// Lisää käännösavaimia lib/i18n.ts:ään MOLEMPIIN lohkoihin kerralla.
//
//     npx tsx scripts/i18n-add.ts '{"nav.notif_on":["Tilaa ilmoitukset","Get notifications"]}'
//     npx tsx scripts/i18n-add.ts --file uudet.json
//
// MIKSI SKRIPTI. Taulussa on kaksi erillistä lohkoa (fi rivit ~5-464, en
// ~466-925) ja avain on lisättävä molempiin täsmälleen samalla nimellä.
// Käsin tehtynä toinen unohtuu, ja koska getTranslation kaatuu hiljaa
// suomeen (lib/i18n.ts:930), puuttuva englanti EI näy virheenä vaan
// suomenkielisenä tekstinä englanninkielisessä käyttöliittymässä.
// Sama syy miksi tests-lohko tarkistaa avainparit.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILE = join(process.cwd(), 'lib', 'i18n.ts')

type Pairs = Record<string, [string, string]>   // avain: [suomi, englanti]

function pad(key: string): string {
  // Taulussa arvot on tasattu sarakkeeseen; jäljitellään sitä.
  const target = 31
  const quoted = `'${key}':`
  return quoted.length >= target ? quoted + ' ' : quoted + ' '.repeat(target - quoted.length)
}

function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function addKeys(src: string, pairs: Pairs): { out: string; added: string[]; skipped: string[] } {
  const added: string[] = []
  const skipped: string[] = []
  let out = src

  // Lohkojen rajat: fi alkaa 'fi: {', en alkaa 'en: {', molemmat päättyvät
  // riviin jossa on pelkkä '  },' tai '  }' samalla sisennyksellä.
  for (const [key, [fi, en]] of Object.entries(pairs)) {
    if (new RegExp(`^\\s*'${key.replace(/\./g, '\\.')}':`, 'm').test(out)) { skipped.push(key); continue }
    added.push(key)
    // Lisätään kummankin lohkon LOPPUUN. EN ENSIN, koska se on tiedostossa
    // jäljempänä: jos fi-lohkoon lisätään ensin, en-lohkon indeksi siirtyy ja
    // seuraava lisäys osuu takaisin fi-lohkoon (mitattu bugi 25.8.2026 —
    // molemmat avaimet päätyivät suomeen ja en jäi ilman).
    for (const marker of ['\n  en: {', '\n  fi: {'] as const) {
      const value = marker.includes('en:') ? en : fi
      const blockStart = out.indexOf(marker)
      if (blockStart < 0) throw new Error(`lohkoa ${marker.trim()} ei löytynyt`)
      const closeIdx = out.indexOf('\n  },', blockStart)
      if (closeIdx < 0) throw new Error('lohkon sulkua ei löytynyt')
      const line = `    ${pad(key)}'${esc(value)}',\n`
      out = out.slice(0, closeIdx + 1) + line + out.slice(closeIdx + 1)
    }
  }
  return { out, added, skipped }
}

function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error("Käyttö: npx tsx scripts/i18n-add.ts '{\"avain\":[\"suomi\",\"english\"]}'")
    process.exit(1)
  }
  const json = arg === '--file'
    ? readFileSync(process.argv[3], 'utf8')
    : arg
  const pairs = JSON.parse(json) as Pairs
  const src = readFileSync(FILE, 'utf8')
  const { out, added, skipped } = addKeys(src, pairs)
  writeFileSync(FILE, out, 'utf8')
  console.log(`Lisätty ${added.length} avainta${skipped.length ? `, ohitettu ${skipped.length} (oli jo)` : ''}`)
  if (skipped.length) console.log('  ohitetut:', skipped.join(', '))
}

if (process.argv[1]?.includes('i18n-add')) main()
