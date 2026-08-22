// Pieni XLSX-lukija ilman riippuvuuksia.
//
// MIKSI OMA. Anniskelulupa­rekisteri julkaistaan vain XLSX:nä (tarkistettu
// CKAN-rajapinnasta: dataset 80ebd0dc… tarjoaa kaksi resurssia, molemmat
// XLSX). Vaihtoehdot olisivat olleet uusi npm-riippuvuus (adm-zip, xlsx) tai
// transitiivinen `fflate`, joka voi kadota minkä tahansa npm-päivityksen
// mukana. XLSX on zip + XML, ja Noden oma zlib osaa purkaa deflaten, joten
// koko homma on ~120 riviä täysin omassa hallinnassa.
//
// TÄMÄ EI OLE YLEISKÄYTTÖINEN XLSX-KIRJASTO. Se lukee solut merkkijonoina,
// eikä ymmärrä kaavoja, muotoiluja tai päivämäärä­sarjanumeroita. Rekisterin
// päivät ovat tekstiä muodossa "29.04.2020", joten sitä ei tarvita.

import { inflateRawSync } from 'node:zlib'

/** Zipin keskushakemiston tietue: mistä tiedosto löytyy ja miten pakattu. */
interface ZipEntry {
  name: string
  method: number
  offset: number
  compressedSize: number
}

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50
const SIG_ZIP64_LOCATOR = 0x07064b50

/** Etsii End of Central Directory -tietueen lopusta taaksepäin. */
function findEocd(buf: Buffer): number {
  // EOCD on vähintään 22 tavua ja kommentti enintään 65535 → riittää katsoa
  // viimeiset 65557 tavua.
  const start = Math.max(0, buf.length - 65_557)
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i
  }
  throw new Error('XLSX: zip-hakemistoa ei löytynyt')
}

function readEntries(buf: Buffer): Map<string, ZipEntry> {
  const eocd = findEocd(buf)
  if (buf.readUInt32LE(eocd - 20) === SIG_ZIP64_LOCATOR) {
    // Yli 65535 tiedostoa tai yli 4 GB. XLSX ei koskaan ole sellainen, ja
    // hiljainen väärä luenta olisi pahempi kuin selkeä virhe.
    throw new Error('XLSX: zip64 ei tuettu')
  }
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map<string, ZipEntry>()
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) throw new Error('XLSX: hakemisto rikki')
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const offset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    out.set(name, { name, method, offset, compressedSize })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

function extract(buf: Buffer, e: ZipEntry): string {
  // Paikallinen otsake: 30 tavua + nimi + extra. Extra-kentän pituus voi
  // POIKETA keskushakemiston vastaavasta, joten se on luettava täältä.
  const nameLen = buf.readUInt16LE(e.offset + 26)
  const extraLen = buf.readUInt16LE(e.offset + 28)
  const start = e.offset + 30 + nameLen + extraLen
  const data = buf.subarray(start, start + e.compressedSize)
  if (e.method === 0) return data.toString('utf8')       // tallennettu sellaisenaan
  if (e.method === 8) return inflateRawSync(data).toString('utf8')
  throw new Error(`XLSX: tuntematon pakkaus ${e.method} (${e.name})`)
}

/** XML-entiteetit takaisin merkeiksi. */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')   // viimeisenä, muuten "&amp;lt;" purkautuisi väärin
}

/** Sarakekirjaimet → 0-pohjainen indeksi. "A"→0, "Z"→25, "AA"→26. */
export function columnIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Lukee yhden välilehden riveinä. Puuttuvat solut ovat tyhjiä merkkijonoja,
 * ja rivin pituus vastaa viimeistä täytettyä saraketta.
 */
export function readSheet(xlsx: Buffer, sheetName: string): string[][] {
  const entries = readEntries(xlsx)
  const get = (path: string) => {
    const e = entries.get(path)
    return e ? extract(xlsx, e) : ''
  }

  // Jaetut merkkijonot. XLSX tallentaa tekstisolut tänne ja viittaa indeksillä.
  const shared: string[] = []
  const ss = get('xl/sharedStrings.xml')
  for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // <si> voi sisältää useita <t>-paloja (rikasteksti) — ne liitetään yhteen.
    let text = ''
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1]
    shared.push(unescapeXml(text))
  }

  // Välilehden nimi → tiedostopolku workbookin ja relsien kautta. Nimi ei
  // takaa järjestystä, joten sheet1.xml-arvaus olisi väärä.
  const wb = get('xl/workbook.xml')
  const esc = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sheetTag = new RegExp(`<sheet[^>]*name="${esc}"[^>]*>`).exec(wb)?.[0]
  if (!sheetTag) throw new Error(`XLSX: välilehteä "${sheetName}" ei löytynyt`)
  const rid = /r:id="([^"]+)"/.exec(sheetTag)?.[1]
  if (!rid) throw new Error(`XLSX: välilehdellä "${sheetName}" ei ole r:id:tä`)
  const rels = get('xl/_rels/workbook.xml.rels')
  const relTag = new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*>`).exec(rels)?.[0]
  const target = relTag ? /Target="([^"]+)"/.exec(relTag)?.[1] : undefined
  if (!target) throw new Error(`XLSX: välilehden "${sheetName}" tiedostoa ei löytynyt`)
  const path = target.startsWith('/')
    ? target.slice(1)
    : `xl/${target.replace(/^\.\//, '')}`
  const sheet = get(path)
  if (!sheet) throw new Error(`XLSX: ${path} on tyhjä`)

  const rows: string[][] = []
  for (const r of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    let auto = 0
    for (const c of r[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attrs = c[1] ?? c[3] ?? ''
      const body = c[2] ?? ''
      const ref = /\sr="([A-Z]+)\d+"/.exec(attrs)?.[1]
      const idx = ref ? columnIndex(ref) : auto
      auto = idx + 1
      const type = /\st="([^"]+)"/.exec(attrs)?.[1]
      let val: string
      if (type === 's') {
        const n = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
        val = shared[n] ?? ''
      } else if (type === 'inlineStr') {
        let text = ''
        for (const t of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1]
        val = unescapeXml(text)
      } else {
        val = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
      }
      for (let i = cells.length; i < idx; i++) cells[i] = ''
      cells[idx] = val
    }
    rows.push(cells)
  }
  return rows
}
