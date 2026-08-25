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

  console.log(`Paikkoja käyty: ${scanned}`)
  console.log(`Kotisivuja kelpuutettu: ${Object.keys(sites).length}`)
  console.log(`Hylättyjä osoitteita (some/lomake/kilpailija/pdf): ${rejected}`)
  console.log(`Hylättyjä geneerisiä laskeutumissivuja (>${MAX_SHARED} paikkaa/osoite): ${generic}`)

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

main().catch((err) => {
  console.error('fetch-venue-sites epäonnistui:', err)
  process.exit(1)
})
