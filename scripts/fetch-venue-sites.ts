// Hakee TAPAHTUMAPAIKKOJEN OMAT KOTISIVUT LinkedEventsin place-rajapinnasta ja
// kirjoittaa data/venue-sites.json. Ajetaan viikoittain samassa GitHub Actions
// -jobissa kuin muut haut. Ei salaisuuksia, ei kustannuksia.
//
//     npx tsx scripts/fetch-venue-sites.ts          # hae ja kirjoita
//
// MIKSI. Kun tapahtumalla ei ole omaa lippu-/järjestäjälinkkiä, infopaneeli
// tarjoaa paikan oman sivun (app/api/venue-site). Ilman tätä tiedostoa lähteinä
// ovat vain kuratoidut venue-sivut ja OSM, ja kattavuus oli mitatusti 28 %
// niistä paikoista jotka linkkiä tarvitsevat. LinkedEventsin place-datassa on
// info_url 80 %:lla paikoista, ja se osuu juuri puuttuviin tyyppeihin:
// kirjastot (helmet.fi), seniorikeskukset (hel.fi), elokuvateatterit.
// Mitattu 25.8.2026: kattavuus nousee 28 % → 68 %.
//
// SAMA LÄHDE JOTA KÄYTETÄÄN JO TAPAHTUMILLE — avointa Helsinki-dataa, ei
// skrapausta, ei kilpailijan sivuja.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'data', 'venue-sites.json')
const API = 'https://api.hel.fi/linkedevents/v1/place/'
const PAGE_SIZE = 100
const MAX_PAGES = 60          // 3345 paikkaa / 100 = 34 sivua; varaa kasvulle

// Alaraja: jos tulos alittaa tämän, tiedostoa EI kirjoiteta. Hiljainen
// romahdus on pahin vika (sama linjaus kuin fetch-restaurant-reasons.ts).
const FLOOR = 700

// ── Osoitteen elossaolo ─────────────────────────────────────────────────────
const TARKISTUS_UA = 'Mozilla/5.0 (compatible; MitaTanaanBot/1.0; +https://mitatanaan.fi)'
const TARKISTUS_TIMEOUT_MS = 8000
const TARKISTUS_RINNAKKAIN = 20
/** Yhteystason virheet. Nämä lasketaan kuolleeksi VASTA jos ne toistuvat —
 *  yksittäinen ECONNRESET on usein hetkellinen tai robottiesto. */
const YHTEYSVIRHEET = [
  'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'ERR_SSL_WRONG_VERSION_NUMBER',
]

type Tila = 'elossa' | 'kuollut' | 'epavarma' | 'yhteysvirhe'

async function yritaOsoitetta(url: string): Promise<Tila> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TARKISTUS_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow', headers: { 'User-Agent': TARKISTUS_UA } })
    // Runkoa ei ladata: otsikot riittävät ja lataus olisi turhaa kuormaa.
    res.body?.cancel().catch(() => {})
    // VAIN nämä ovat palvelimen oma ilmoitus siitä ettei sivua ole.
    if (res.status === 404 || res.status === 410) return 'kuollut'
    return 'elossa'
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } }
    // Aikakatkaisu EI koskaan tapa: hidas sivu on yhä olemassa.
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return 'epavarma'
    const code = String(e?.cause?.code ?? '')
    return YHTEYSVIRHEET.includes(code) ? 'yhteysvirhe' : 'epavarma'
  } finally {
    clearTimeout(t)
  }
}

/** Kuolinsyy erotellaan, koska se ratkaisee onko kyse SIVUSTON vai VERKON
 *  viasta: 'http' tarkoittaa että palvelin vastasi 404/410 (sivu on poissa,
 *  isäntä elää), 'yhteys' että yhteyttä ei saatu KAHDESTI (isäntä voi olla
 *  alhaalla). Vartijat alempana luottavat tähän eroon. */
export type Kuolinsyy = 'http' | 'yhteys'

async function onKuollut(url: string): Promise<Kuolinsyy | null> {
  const a = await yritaOsoitetta(url)
  if (a === 'kuollut') return 'http'
  if (a !== 'yhteysvirhe') return null
  await new Promise((r) => setTimeout(r, 1500))
  return (await yritaOsoitetta(url)) === 'yhteysvirhe' ? 'yhteys' : null
}

/** Kuolleet osoitteet joukosta. Rinnakkaisuus rajattu, jottei viikkoajo
 *  paukuta satoja sivustoja yhtä aikaa. */
async function etsiKuolleet(urlit: string[]): Promise<Map<string, Kuolinsyy>> {
  const kuolleet = new Map<string, Kuolinsyy>()
  let i = 0
  const tyontekija = async () => {
    while (i < urlit.length) {
      const url = urlit[i++]
      try {
        const syy = await onKuollut(url)
        if (syy) kuolleet.set(url, syy)
      } catch { /* epäselvä → säilytetään */ }
    }
  }
  console.log(`Tarkistetaan ${urlit.length} osoitteen elossaolo...`)
  await Promise.all(Array.from({ length: Math.min(TARKISTUS_RINNAKKAIN, urlit.length) }, tyontekija))
  if (kuolleet.size) {
    const http = [...kuolleet.values()].filter((x) => x === 'http').length
    console.log(`  kuolleita: ${kuolleet.size} (404/410: ${http}, yhteys ei muodostu: ${kuolleet.size - http})`)
    for (const [u, syy] of [...kuolleet].slice(0, 20)) console.log(`    [${syy}] ${u}`)
  }
  return kuolleet
}

/** Pudotetaanko kuolleet osoitteet, vai onko syytä epäillä omaa verkkoa?
 *  Puhdas funktio, jotta molemmat vartijat saa testien alle (scripts/
 *  test-categories.ts) — ne on MITATTU eivätkä arvattu, ks. kommentit sisällä. */
export function arvioiPudotus(
  sites: Record<string, string>,
  kuolleet: Map<string, Kuolinsyy>,
): { poistuvat: string[]; esto: string | null } {
  const parit = Object.entries(sites).filter(([, url]) => kuolleet.has(url))
  const poistuvat = parit.map(([k]) => k)
  const avaimia = Object.keys(sites).length
  if (!poistuvat.length || !avaimia) return { poistuvat: [], esto: null }

  // VARTIJA 1 — osuus mitataan AVAIMISTA, ei uniikeista osoitteista. Yksi
  // osoite voi olla kymmenien avainten takana (hel.fi-alasivut), joten
  // osoitepohjainen osuus ALIARVIOI vahingon: mitattu 13.9.2026 — www.hel.fi
  // on 238 uniikkia osoitetta (14,1 %) mutta 300 avainta (16,7 %).
  const osuus = poistuvat.length / avaimia
  if (osuus > 0.15) {
    return { poistuvat, esto: `${poistuvat.length} avainta (${Math.round(osuus * 100)} %) näytti kuolleelta` }
  }

  // VARTIJA 2 — isännän katko. Koskee VAIN yhteysvirheitä: oikeassa
  // siivouksessa www.hel.fi menetti tasan 40 avainta, mutta kaikki vastasivat
  // 404 (kaupunki uudisti sivustonsa, isäntä on pystyssä). Jos tämä laskisi
  // myös 404:t, se estäisi juuri sen siivouksen jota varten tarkistus tehtiin.
  const katkot = new Map<string, number>()
  for (const [, url] of parit) {
    if (kuolleet.get(url) !== 'yhteys') continue
    try {
      const h = new URL(url).hostname.toLowerCase()
      katkot.set(h, (katkot.get(h) ?? 0) + 1)
    } catch { /* kelvoton osoite — ei laske isäntää */ }
  }
  const pahin = [...katkot.entries()].sort((a, b) => b[1] - a[1])[0]
  if (pahin && pahin[1] >= 25) {
    return { poistuvat, esto: `yhden isännän (${pahin[0]}) ${pahin[1]} osoitetta EI VASTANNUT lainkaan` }
  }
  return { poistuvat, esto: null }
}

/** Sivut joita EI kelpuuteta paikan "omaksi sivuksi". */
const REJECT = [
  // Kilpailevat tapahtumakalenterit — sama lista kuin lib/event-links.ts
  'stadissa.fi', 'menokone.hs.fi', 'meno.hs.fi',
  // Sosiaalinen media ei ole paikan kotisivu (ja moni niistä vaatii kirjautumisen)
  'facebook.com', 'fb.me', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
  'youtube.com', 'linkedin.com',
  // Lomakkeet ja uutiskirjeet eivät kerro paikasta mitään
  'docs.google.com', 'forms.gle', 'forms.office.com', 'webropolsurveys.com',
  'creamailer.fi', 'eepurl.com',
]

/** Polut jotka eivät ole paikan esittely vaan viranomaisohje. Mitattu:
 *  21 puistoa osoitti yrityksille suunnattuun tapahtumaLUVAN hakuohjeeseen. */
const REJECT_PATH = [
  '/yritykset-ja-tyo/',        // hel.fi: tapahtumailmoitukset ja -luvat
  '/tapahtumailmoitukset',
]

export interface VenueSiteFile {
  fetchedAt: string
  /** avain = paikan nimi normalisoituna, arvo = kotisivun osoite */
  sites: Record<string, string>
}

/** Sama normalisointi kuin app/api/venue-site: pilkun jälkeinen tarkenne pois
 *  ("Kiasma, nykytaiteen museo" → "kiasma"), pienet kirjaimet, tuplavälit pois. */
export function venueKey(name: string): string {
  return name.split(',')[0].toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Kelpaako osoite paikan kotisivuksi? */
export function acceptSite(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  if (REJECT.some((d) => host === d || host.endsWith(`.${d}`))) return null
  if (REJECT_PATH.some((p) => url.toLowerCase().includes(p))) return null
  // PDF ei ole kotisivu
  if (/\.pdf($|\?)/i.test(url)) return null
  return url
}

interface LEPlace {
  name?: { fi?: string; sv?: string; en?: string }
  info_url?: string | { fi?: string; sv?: string; en?: string } | null
  n_events?: number
  has_upcoming_events?: boolean
  deleted?: boolean
}

function pickUrl(info: LEPlace['info_url']): string | null {
  if (!info) return null
  if (typeof info === 'string') return info
  return info.fi ?? info.en ?? info.sv ?? null
}

async function main() {
  const sites: Record<string, string> = {}
  let scanned = 0
  let rejected = 0

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${API}?${new URLSearchParams({
      page: String(page), page_size: String(PAGE_SIZE), format: 'json',
    })}`
    let data: { data?: LEPlace[]; meta?: { next?: string | null } }
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MitaTanaanBot/1.0 (+https://mitatanaan.fi)' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) {
        console.error(`  sivu ${page}: HTTP ${res.status} — lopetetaan`)
        break
      }
      data = await res.json()
    } catch (err) {
      console.error(`  sivu ${page} epäonnistui:`, String(err).slice(0, 80))
      break
    }

    const rows = data.data ?? []
    for (const p of rows) {
      if (p.deleted) continue
      scanned++
      const name = p.name?.fi ?? p.name?.en ?? p.name?.sv
      if (!name) continue
      const site = acceptSite(pickUrl(p.info_url))
      if (!site) { if (pickUrl(p.info_url)) rejected++; continue }
      const key = venueKey(name)
      if (!key || sites[key]) continue          // ensimmäinen voittaa
      sites[key] = site
    }
    if (!data.meta?.next) break
    // Kevyt tahti — lähde on kaupungin oma rajapinta, ei kuormiteta turhaan.
    await new Promise((r) => setTimeout(r, 250))
  }

  // DUPLIKAATTIVARTIJA — pakollinen. Rekisterissä moni paikka osoittaa samaan
  // GENEERISEEN laskeutumissivuun, joka ei kerro kyseisestä paikasta mitään:
  // mitattu 25.8.2026 hamhelsinki.fi 35 paikalle (julkiset veistokset),
  // hel.fi/yritykset-ja-tyo 21 puistolle (tapahtumaLUVAN hakuohje yrityksille!),
  // espoo.fi/liikunta 17, leikkipuistojen laskeutumissivu 15, VR:n etusivu 10.
  // Nappi "Ala-Malmin puisto →" ei saa viedä lupahakemusohjeeseen.
  // Raja 2: sama osoite voi aidosti kuulua kahdelle (talon kaksi salia),
  // mutta kolme on jo merkki siitä ettei sivu ole paikkakohtainen.
  const MAX_SHARED = 2
  const useCount = new Map<string, number>()
  for (const url of Object.values(sites)) useCount.set(url, (useCount.get(url) ?? 0) + 1)
  let generic = 0
  for (const [k, url] of Object.entries(sites)) {
    if ((useCount.get(url) ?? 0) > MAX_SHARED) { delete sites[k]; generic++ }
  }

  // ELOSSAOLOTARKISTUS — lisätty 13.9.2026. Omistaja löysi tuotannosta napin
  // "Galleria Pirkko-Liisa Topelius →", joka ei vienyt mihinkään: gallerian
  // verkkotunnus oli vanhentunut (http palautti "Domain registration has
  // expired", https ei vastannut lainkaan). Mitattu samalla kertaa: napin
  // käyttämistä 168 osoitteesta 6 oli kuollut. Tämä tiedosto generoidaan
  // viikoittain uudelleen, joten käsin poistaminen EI pysyisi — tarkistuksen
  // on oltava täällä.
  //
  // SÄÄNTÖ ON TARKOITUKSELLA VAROVAINEN, koska väärä pudotus veisi toimivan
  // linkin sadoilta tapahtumilta: pudotetaan VAIN kun palvelin sanoo 404/410
  // tai kun yhteys ei muodostu KAHDELLA yrityksellä. Aikakatkaisu, 403, 429
  // ja 5xx EIVÄT pudota — ne ovat robottiestoja ja hetkellisiä häiriöitä.
  // Validoitu 16 oikealla osoitteella: 6/6 kuollutta tunnistui, 10/10 elävää
  // säilyi.
  const kuolleet = await etsiKuolleet([...new Set(Object.values(sites))])
  const paatos = arvioiPudotus(sites, kuolleet)
  let kuollutPudotettu = 0
  if (paatos.esto) {
    console.error(`\nVAROITUS: ${paatos.esto}.`)
    console.error('Se on liikaa ollakseen totta — elossaolotarkistus ohitetaan tällä ajolla.')
  } else {
    for (const k of paatos.poistuvat) { delete sites[k]; kuollutPudotettu++ }
  }

  console.log(`Paikkoja käyty: ${scanned}`)
  console.log(`Kotisivuja kelpuutettu: ${Object.keys(sites).length}`)
  console.log(`Hylättyjä osoitteita (some/lomake/kilpailija/pdf): ${rejected}`)
  console.log(`Hylättyjä geneerisiä laskeutumissivuja (>${MAX_SHARED} paikkaa/osoite): ${generic}`)
  console.log(`Hylättyjä kuolleita osoitteita (404/410 tai yhteys ei muodostu): ${kuollutPudotettu}`)

  if (Object.keys(sites).length < FLOOR) {
    console.error(`\nVIRHE: vain ${Object.keys(sites).length} kotisivua (alaraja ${FLOOR}).`)
    console.error('Tiedostoa EI kirjoitettu — vanha data jää voimaan.')
    process.exit(1)
  }

  const out: VenueSiteFile = {
    fetchedAt: new Date().toISOString(),
    // Aakkosjärjestys → diffit ovat luettavia viikosta toiseen
    sites: Object.fromEntries(Object.entries(sites).sort(([a], [b]) => a.localeCompare(b, 'fi'))),
  }
  const dir = join(process.cwd(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log(`\nKirjoitettu ${OUT}`)
}

// Aja VAIN kun tiedosto käynnistetään suoraan. Ilman tätä pelkkä
// `import { venueKey } from './fetch-venue-sites'` (esim. testeissä) laukaisi
// koko haun ja kirjoitti data/venue-sites.json:n uusiksi — mitattu 25.8.2026.
if (process.argv[1]?.includes('fetch-venue-sites')) {
  main().catch((err) => {
    console.error('fetch-venue-sites epäonnistui:', err)
    process.exit(1)
  })
}
