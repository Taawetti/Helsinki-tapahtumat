// Hakee ravintoloiden SYYT ulkoisista lähteistä ja kirjoittaa
// data/restaurant-reasons.json. Ajetaan viikoittain GitHub Actionsissa
// (.github/workflows/restaurant-reasons.yml) — ei koskaan käsin.
//
//     npx tsx scripts/fetch-restaurant-reasons.ts          # kirjoita tiedosto
//     npx tsx scripts/fetch-restaurant-reasons.ts --dry    # näytä, älä kirjoita
//
// LÄHTEET, ja miksi juuri nämä. Kaikki mitattu 22.8.2026 ja tarkistettu
// robots.txt:stä. Suluissa osuma meidän 3583 ravintolaamme.
//
//   Michelin-opas       30 Helsinki (96 %)  CSV-peili, ~kk välein (ks. lisenssi alla)
//   Suomen 50 parasta   36 Helsinki (88 %)  Viisi Tähteä, WP REST, vuosittain
//   Time Out Helsinki   55 Helsinki (72 %)  toimituksen listat, päiv. kuukausittain
//   Vuoden ravintola    38 voittajaa        Suomen Gastronomien Seura, 1985→
//   Uudet avaukset     102 / 90 pv         anniskelulupa­rekisteri, CC BY 4.0
//
// HYLÄTYT, ja miksi — jottei näitä tutkita uudelleen:
//   guide.michelin.com  AWS WAF -haaste (403/202), robots sallisi. Käytä peiliä.
//   Wolt                käyttöehdot 13.6 kieltävät automaattisen keruun.
//   Tripadvisor, Yelp,  robots.txt nimeää ClaudeBotin ja kieltää kaiken.
//   Facebook, Instagram, TikTok — sama.
//   Google Places       ei "juuri avattu" -kenttää; openingDate vain
//                       FUTURE_OPENING-tilassa.
//   OSM start_date      2,3 % kattavuus, ja käyttäjät merkitsevät sillä
//                       historiallisia pubeja (Juttutupa 1908).
//   uudetraflat.fi      teknisesti auki, mutta sivuston koko kuratoitu
//                       tietokanta — samalla periaatteella kuin TableOnline,
//                       jätetään rauhaan. Lupa­rekisteri antaa 4× enemmän.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ReasonKind, RestaurantReason, ReasonFile } from '../lib/restaurant-reasons'
import { reasonKeyVariants, openingLabel, streetKey } from '../lib/restaurant-reasons'
import { readSheet } from '../lib/xlsx-read'

const OUT = join(process.cwd(), 'data', 'restaurant-reasons.json')
const DRY = process.argv.includes('--dry')
const UA = 'MitaTanaanBot/1.0 (+https://mitatanaan.fi; Helsinki restaurant guide)'
const TODAY = new Date()

/** Yksi lähteen tuottama rivi ennen avaimeksi muuntamista. */
interface Raw {
  name: string
  reason: RestaurantReason
}

// ── ALARAJAT ────────────────────────────────────────────────────────────────
// Sama periaate kuin tapahtumalähteissä: hiljainen romahdus on pahin vika.
// Jos lähde palauttaa vähemmän kuin alarajansa, koko ajo epäonnistuu eikä
// vanhaa tiedostoa ylikirjoiteta. Rajat on asetettu reilusti alle mitatun
// määrän, jotta normaali vaihtelu ei hälytä.
const FLOOR: Record<string, number> = {
  michelin: 20,          // mitattu 30
  top50: 20,             // mitattu 36
  timeout: 25,           // mitattu 55
  'vuoden-ravintola': 8, // mitattu 12 — kattaa vain VUODEN_YEARS vuotta
  uusi: 20,              // mitattu 118 / 150 pv
}

async function get(url: string): Promise<string>
async function get(url: string, kind: 'json'): Promise<unknown>
async function get(url: string, kind: 'buffer'): Promise<Buffer>
async function get(url: string, kind: 'text' | 'json' | 'buffer' = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  if (kind === 'json') return res.json()
  if (kind === 'buffer') return Buffer.from(await res.arrayBuffer())
  return res.text()
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#8217;|&#039;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim()
}

// ── 1. MICHELIN ─────────────────────────────────────────────────────────────
// Virallinen sivusto on AWS WAF:n takana (403 ClaudeBotille, 202 + JS-haaste
// selaimen otsakkeilla), vaikka robots.txt nimenomaan sallii meidät. Käytämme
// michelin-my-maps -peiliä, joka päivittyy noin kuukausittain ja jonka
// Award-sarake on suoraan oppaan oma luokitus.
//
// LISENSSI, ja miksi otetaan vain nimi ja luokka. Peilin KOODI on MIT, mutta
// sen datalle on merkitty docker/datasette/metadata.json:iin CC-BY-NC-4.0 eli
// ei-kaupallinen. Siksi tästä luetaan VAIN kaksi asiaa: ravintolan nimi ja
// oppaan luokka. Ne ovat tosiasioita ("Grönillä on kaksi tähteä"), joita
// tekijänoikeus ei suojaa ja jotka Michelin julkaisee itse. Kuvausteksti
// (Description-sarake) on Michelinin omaa tekstiä EIKÄ sitä oteta koskaan.
// Rivejä otetaan 30 kappaletta 19 460:stä, joten kyse ei ole tietokannan
// olennaisesta osasta.
const MICHELIN_CSV =
  'https://raw.githubusercontent.com/ngshiheng/michelin-my-maps/main/data/michelin_my_maps.csv'

/** CSV-rivin jäsennys, joka kestää lainausmerkeissä olevat pilkut. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else quoted = false
      } else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

/** Oppaan luokka → kortin teksti ja paremmuus. `tier` ratkaisee järjestyksen:
 *  ilman sitä Bib Gourmand nousi 2★:n ohi (mitattu ennen korjausta). */
const MICHELIN_LABEL: Record<string, { label: string; tier: number }> = {
  '3 Stars': { label: 'Michelin 3★', tier: 5 },
  '2 Stars': { label: 'Michelin 2★', tier: 4 },
  '1 Star': { label: 'Michelin 1★', tier: 3 },
  'Bib Gourmand': { label: 'Michelin Bib Gourmand', tier: 2 },
  'Selected Restaurants': { label: 'Michelin-oppaassa', tier: 1 },
}

async function fetchMichelin(): Promise<Raw[]> {
  const csv = await get(MICHELIN_CSV)
  const lines = csv.split('\n')
  const head = parseCsvLine(lines[0])
  const col = (n: string) => head.indexOf(n)
  const [iName, iLoc, iAward, iGreen, iUrl] =
    ['Name', 'Location', 'Award', 'GreenStar', 'Url'].map(col)
  if (iName < 0 || iLoc < 0 || iAward < 0) throw new Error('Michelin CSV: sarakkeet muuttuneet')

  const out: Raw[] = []
  for (const line of lines.slice(1)) {
    if (!line.includes('Helsinki, Finland')) continue   // nopea esikarsinta
    const f = parseCsvLine(line)
    if (f[iLoc]?.trim() !== 'Helsinki, Finland') continue
    const award = f[iAward]?.trim() ?? ''
    const tierInfo = MICHELIN_LABEL[award]
    if (!tierInfo) continue
    const green = f[iGreen]?.trim() === '1'
    out.push({
      name: f[iName].trim(),
      reason: {
        kind: 'michelin',
        label: green ? `${tierInfo.label} · vihreä tähti` : tierInfo.label,
        source: 'Michelin-opas',
        url: f[iUrl]?.trim() || undefined,
        tier: tierInfo.tier,
      },
    })
  }
  return out
}

// ── 2. SUOMEN 50 PARASTA RAVINTOLAA ─────────────────────────────────────────
// Viisi Tähteä julkaisee listan joka maaliskuu Gastro-messuilla; äänestäjinä
// alan ammattilaiset. Jokainen sija on oma WP-postinsa otsikolla
// "<sija> <nimi>, <kaupunki>". robots.txt on Yoastin allow-all.
//
// HUOM: oikea sivusto on viisitahtea.COM. Domain viisitahtea.fi on kaapattu ja
// sisältää neljä SEO-täytejuttua — älä käytä sitä.
const TOP50_CATEGORY_2026 = 7341
const TOP50_API = (cat: number) =>
  `https://viisitahtea.com/wp-json/wp/v2/posts?per_page=100&categories=${cat}&_fields=title,link,excerpt`

async function fetchTop50(): Promise<Raw[]> {
  const posts = await get(TOP50_API(TOP50_CATEGORY_2026), 'json') as {
    title?: { rendered?: string }
    link?: string
    excerpt?: { rendered?: string }
  }[]
  if (!Array.isArray(posts)) throw new Error('Viisi Tähteä: odotettiin taulukkoa')
  const out: Raw[] = []
  for (const p of posts) {
    const title = stripTags(p.title?.rendered ?? '')
    const m = /^(\d{1,2})\s+(.*)$/.exec(title)
    if (!m) continue                       // 4 kategorian postia kertoo äänestyksestä
    const rank = Number(m[1])
    let name = m[2]
    // "Grön, Helsinki" → nimi + kaupunki. Ilman pilkkua kaupunkia ei tiedetä;
    // ne otetaan mukaan, koska nimiosuma meidän Helsinki-listaamme ratkaisee.
    const comma = name.lastIndexOf(',')
    if (comma > 0) {
      const city = name.slice(comma + 1).trim().toLowerCase()
      if (city && city !== 'helsinki') continue
      name = name.slice(0, comma).trim()
    }
    const note = stripTags(p.excerpt?.rendered ?? '').slice(0, 160) || undefined
    out.push({
      name,
      reason: {
        kind: 'top50',
        label: `Suomen 50 parasta · sija ${rank}`,
        source: 'Viisi Tähteä',
        url: p.link,
        rank,
        note,
      },
    })
  }
  return out
}

// ── 3. TIME OUT HELSINKI ────────────────────────────────────────────────────
// Listat LÖYDETÄÄN hub-sivulta linkkeinä eikä kovakoodata, jotta automaatio
// kestää sen että Time Out nimeää listan uudelleen tai julkaisee uuden.
// Listasivulla nimet ovat numeroituja <h3>-otsikoita ("1. Plein").
// robots.txt (päiv. 4.3.2026) kieltää vain teknisiä polkuja — /helsinki/… on
// sallittu, eikä ClaudeBotia mainita.
const TO_HUB = 'https://www.timeout.com/helsinki/restaurants'

/** Listan otsikko kortin merkkiin. Sivun <h1> on kokonainen lause —
 *  "Helsinki's best restaurants, from budget bites to fine dining" ei mahdu
 *  pilleriin, joten se katkaistaan ensimmäisestä pilkusta tai ajatusviivasta.
 *  Jos otsikko ei ole listan otsikko (yksi sivu palautti "Time Out Worldwide",
 *  eli sivustotason otsakkeen), käytetään pelkkää lähteen nimeä. */
const TO_LABEL_MAX = 38
function timeOutLabel(h1: string): string {
  const head = h1.split(/[,–—:|]/)[0].trim()
  if (!head || head.length > TO_LABEL_MAX || /time\s*out/i.test(head)) {
    return 'Time Out Helsinki'
  }
  return `Time Out: ${head}`
}

async function fetchTimeOut(): Promise<Raw[]> {
  const hub: string = await get(TO_HUB)
  const slugs = [...new Set(
    [...hub.matchAll(/\/helsinki\/(?:restaurants|bars)\/([a-z0-9-]+)/g)].map((m) => m[1]),
  )]
  const out: Raw[] = []
  const seen = new Set<string>()
  for (const slug of slugs) {
    let html: string
    try {
      html = await get(`https://www.timeout.com/helsinki/restaurants/${slug}`)
    } catch { continue }                    // yksittäinen 404 ei kaada muita
    const listTitle = stripTags(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '')
    let found = 0
    for (const m of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)) {
      const t = stripTags(m[1])
      const n = /^\d+\.\s*(.+)$/.exec(t)
      if (!n) continue
      const name = n[1].trim()
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      found++
      out.push({
        name,
        reason: {
          kind: 'timeout',
          label: timeOutLabel(listTitle),
          source: 'Time Out Helsinki',
          url: `https://www.timeout.com/helsinki/restaurants/${slug}`,
          note: listTitle || undefined,
        },
      })
    }
    if (found) console.log(`    time out /${slug}: ${found}`)
  }
  return out
}

// ── 4. VUODEN RAVINTOLA ─────────────────────────────────────────────────────
// Suomen Gastronomien Seura, Suomen vanhin ravintolapalkinto (1985→).
// Sivulla vuosi ja voittaja ovat peräkkäisillä riveillä. robots.txt allow-all.
// Neljänä vuonna palkintoa ei jaettu; ne rivit sanovat sen tekstillä.
const VUODEN_URL = 'https://www.gastronomit.fi/vuoden-ravintola/'
/** Kuinka monelta vuodelta palkinto näytetään. Vanhempi voitto ei enää ole syy
 *  mennä tänään, mutta 12 vuotta kattaa ne joita ihmiset yhä muistavat. */
const VUODEN_YEARS = 12

async function fetchVuodenRavintola(): Promise<Raw[]> {
  const html: string = await get(VUODEN_URL)
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
  const lines = body.split(/<[^>]+>/).map((s) => stripTags(s)).filter(Boolean)
  const minYear = TODAY.getUTCFullYear() - VUODEN_YEARS
  const out: Raw[] = []
  for (let i = 0; i < lines.length - 1; i++) {
    const y = /^((?:19|20)\d\d)$/.exec(lines[i])
    if (!y) continue
    const year = Number(y[1])
    if (year < minYear) continue
    const name = lines[i + 1]
    if (!name || /ei valittu|ei jaettu/i.test(name) || name.length > 60) continue
    if (/^((?:19|20)\d\d)$/.test(name)) continue
    out.push({
      name,
      reason: {
        kind: 'vuoden-ravintola',
        label: `Vuoden ravintola ${year}`,
        source: 'Suomen Gastronomien Seura',
        url: VUODEN_URL,
        date: `${year}-01-01`,   // paino puoliintuu iän mukaan
      },
    })
  }
  return out
}

// ── 5. UUDET AVAUKSET — ANNISKELULUPAREKISTERI ──────────────────────────────
// Lupa- ja valvontavirasto julkaisee voimassa olevat anniskeluluvat XLSX:nä,
// CC BY 4.0, päivitys ~viikoittain. Lupa myönnetään PAIKALLE, joten `nimi` on
// se nimi jonka asiakas näkee, ja `alkamispaivamaara` on kova virallinen päivä.
// Rekisterissä on myös TULEVIA lupia — "avaa lokakuussa" on parasta sisältöä
// mitä sivulla voi olla, eikä sitä saa mistään muualta.
//
// KOLME MITATTUA ANSAA:
//
// 1. FESTARIT. 43 lupaa 102:sta 90 päivän ikkunassa on määräaikaisia. Erottelu
//    ei ole "onko päättymispäivää" vaan KUINKA PITKÄ lupa on:
//        Flow Festival 2026            2 pv
//        Helsinki Marathon After Runs  1 pv
//        Superterassi (10 riviä)      65 pv
//    mutta oikeat uudet ravintolat saavat vuoden koelupansa:
//        Figaro, QVEVRI, Caverna, VIBAe, Levain Galleria   364 pv
//    → raja 300 päivää erottaa nämä puhtaasti.
//
// 2. EI-RAVINTOLAT. Rekisterissä on teattereita, liikuntakeskuksia, laivoja ja
//    yksi kampaamo ("CAVA Hair & Make-up"). Nimipohjainen esto alla.
//
// 3. KETJUT JA PIKARUOKA. Fazer Café, Juvenes Oy Patisserie ×3, "Sörkän pippuri
//    kebab", "Hermannin Pizzeria", "POINT BUFFET & BURGERS". Omistaja on
//    sanonut suoraan ettei halua pizza- ja kebabpaikkoja sivulle.
//
// 4. LUVAN UUSIMINEN EI OLE AVAUS. Tämä oli vakavin: rekisterissä on vain
//    VOIMASSA OLEVAT luvat, joten omistajanvaihdos tai luvan uusiminen näyttää
//    tuoreelta alkupäivältä. Mitattu vääriä väitteitä:
//        Ihana Kahvila   lupa 8.6.2026  — mutta sama nimi luvalla jo 2020, 725 arvostelua
//        Kummisetä       lupa 17.8.2026 — sama nimi luvalla jo 2011
//        Hesari 13       lupa 1.8.2026  — sama nimi luvalla jo 2019
//        Maunulan maja   lupa 10.7.2026 — sama nimi luvalla jo 2023
//    Ratkaisu: haetaan MYÖS päättyneiden lupien tiedosto ja pudotetaan paikat
//    joiden NIMELLÄ on ollut lupa aiemmin. Osoitehistoria sen sijaan EI kelpaa
//    hylkäysperusteeksi — uusi ravintola avataan lähes aina vanhan tilalle
//    (Copitas, QVEVRI, Figaro, Levain Galleria, BasBas Sirkus ovat kaikki
//    "osoitteessa oli ennen jokin muu"), ja juuri ne ovat kiinnostavimpia.
const ALLU_XLSX =
  'https://avoindata.suomi.fi/data/dataset/80ebd0dc-6496-4919-958f-8b0a29af0466' +
  '/resource/54de813d-4ed0-4e5e-9d57-418df5831654/download/luparekisteri-voimassaolevat-alkoholiluvat.xlsx'
/** Päättyneet luvat — pelkkä historia, jotta uusiminen ei näytä avaukselta. */
const ALLU_ENDED_XLSX =
  'https://avoindata.suomi.fi/data/dataset/80ebd0dc-6496-4919-958f-8b0a29af0466' +
  '/resource/5b3a796b-e4a0-4dd4-91f8-bfec9ccb8e65/download/luparekisteri-paattyneet-alkoholiluvat.xlsx'

/** Alle tämän pituinen lupa on tapahtuma- tai kausilupa, ei uusi ravintola. */
const MIN_LICENCE_DAYS = 300
/** Kuinka vanha avaus on vielä uutinen. */
const OPENING_WINDOW_DAYS = 150

/** Paikat jotka eivät ole ravintoloita vaikka anniskelevat. */
const NOT_A_RESTAURANT =
  /teatteri|liikuntakeskus|areena|urheilu|pallokent|velodromi|stadion|halli\b|kartano|huvila|risteily|terminaali|\bm\/s\b|laiva|festival|hair|make.?up|kampaam|marathon|messu|kirkko|museo|golf|keila|jäähalli|uimahalli/i

/** Pikaruoka jota omistaja ei halua sivulle. */
const FAST_FOOD =
  /kebab|pizzeri|pizza\b|burger|hampurilai|grilli\b|buffet|hesburger|subway|kotipizza|mcdonald|taco bell/i

interface AlluRow { nimi: string; katuosoite: string; alku: string; loppu: string | null }

async function readAlluRows(url: string): Promise<AlluRow[]> {
  const buf: Buffer = await get(url, 'buffer')
  const rows = readSheet(buf, 'anniskelu')
  if (!rows.length) throw new Error('Allu: tyhjä välilehti')

  const head = (rows[0] ?? []).map((h) => (h ?? '').trim())
  const ix = (n: string) => head.indexOf(n)
  const [iNimi, iOsoite, iKunta, iAlku, iLoppu] =
    ['nimi', 'katuosoite', 'kunta', 'alkamispaivamaara', 'paattamispaivamaara'].map(ix)
  if (iNimi < 0 || iKunta < 0 || iAlku < 0) {
    throw new Error(`Allu: sarakkeet muuttuneet — ${head.join(',')}`)
  }
  const out: AlluRow[] = []
  for (const r of rows.slice(1)) {
    if ((r[iKunta] ?? '').trim().toLowerCase() !== 'helsinki') continue
    out.push({
      nimi: (r[iNimi] ?? '').trim(),
      katuosoite: (r[iOsoite] ?? '').trim(),
      alku: (r[iAlku] ?? '').trim(),
      loppu: (r[iLoppu] ?? '').trim() || null,
    })
  }
  return out
}

/** "29.04.2020" tai "2020-04-29" → Date, tai null. */
function parseFiDate(s: string): Date | null {
  const fi = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s)
  if (fi) return new Date(Date.UTC(+fi[3], +fi[2] - 1, +fi[1]))
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
  return null
}

/** Nimi → vertailuavain lupahistoriaa varten. Sama normalisointi kuin
 *  `reasonKey`, mutta ILMAN liitteiden poistoa: "Bar Om´pu" ja "Om'pu" ovat
 *  tässä sama paikka, mutta "Ravintola X" ja "X" halutaan pitää erillään vain
 *  jos ne oikeasti ovat eri paikkoja — käytännössä liitteiden poisto on
 *  turvallisempi, koska rekisteri kirjoittaa saman paikan eri tavoin eri
 *  vuosina ("Kummisetä" vs "Ravintola Kummisetä"). */
function historyKey(name: string): string {
  return reasonKeyVariants(name)[0] ?? ''
}

/** Kuinka paljon aiemman luvan pitää olla vanhempi, jotta se on eri asia kuin
 *  saman luvan tekninen jatko. Kuukausi riittää: uusimiset ovat vuosien päässä. */
const HISTORY_GAP_DAYS = 30

async function fetchNewOpenings(): Promise<Raw[]> {
  const [current, ended] = await Promise.all([
    readAlluRows(ALLU_XLSX),
    readAlluRows(ALLU_ENDED_XLSX).catch((e) => {
      // Historia on turvallisuustarkistus. Ilman sitä EI julkaista uutuuksia,
      // koska silloin luvan uusiminen näyttäisi avaukselta.
      throw new Error(`päättyneiden lupien tiedosto: ${(e as Error).message}`)
    }),
  ])

  /** Nimi → aikaisin tunnettu luvan alkupäivä (molemmista tiedostoista). */
  const firstSeen = new Map<string, number>()
  for (const r of [...ended, ...current]) {
    const d = parseFiDate(r.alku)
    const k = historyKey(r.nimi)
    if (!d || !k) continue
    const t = d.getTime()
    if (!firstSeen.has(k) || t < firstSeen.get(k)!) firstSeen.set(k, t)
  }

  const out: Raw[] = []
  const skipped = { kausi: 0, eiRavintola: 0, pikaruoka: 0, vanha: 0, uusittu: 0, eiOsoitetta: 0 }
  for (const r of current) {
    if (!r.nimi) continue
    const start = parseFiDate(r.alku)
    if (!start) continue
    const ageDays = (TODAY.getTime() - start.getTime()) / 86_400_000
    if (ageDays > OPENING_WINDOW_DAYS) { skipped.vanha++; continue }
    if (r.loppu) {
      const end = parseFiDate(r.loppu)
      const days = end ? (end.getTime() - start.getTime()) / 86_400_000 : 0
      if (days < MIN_LICENCE_DAYS) { skipped.kausi++; continue }
    }
    if (NOT_A_RESTAURANT.test(r.nimi)) { skipped.eiRavintola++; continue }
    if (FAST_FOOD.test(r.nimi)) { skipped.pikaruoka++; continue }

    // Sama nimi on ollut luvalla ennenkin → uusiminen, ei avaus.
    const prev = firstSeen.get(historyKey(r.nimi))
    if (prev !== undefined && start.getTime() - prev > HISTORY_GAP_DAYS * 86_400_000) {
      skipped.uusittu++
      continue
    }

    // Osoite ilman talonumeroa ei ole tarkistettavissa, eikä tarkistamatonta
    // uutuusväitettä julkaista. Mitattu: "Lonnan saari" pääsi läpi ilman tätä
    // ja antoi vuosia toimineelle saariravintolalle "Avattu toukokuussa".
    if (!r.katuosoite || !streetKey(r.katuosoite)) { skipped.eiOsoitetta++; continue }

    const iso = start.toISOString().slice(0, 10)
    const label = openingLabel(iso, TODAY)
    if (!label) continue
    out.push({
      name: r.nimi,
      reason: {
        kind: 'uusi',
        label,
        source: 'Anniskelulupa­rekisteri',
        url: 'https://avoindata.suomi.fi/data/fi/dataset/alkoholielinkeinorekisteri',
        date: iso,
        street: r.katuosoite,
      },
    })
  }
  console.log(
    `    ohitettu: kausiluvat ${skipped.kausi}, ei-ravintolat ${skipped.eiRavintola}, ` +
    `pikaruoka ${skipped.pikaruoka}, luvan uusimiset ${skipped.uusittu}, ` +
    `osoite ei tarkistettavissa ${skipped.eiOsoitetta}, yli ${OPENING_WINDOW_DAYS} pv ${skipped.vanha}`,
  )
  return out
}

// ── AJO ─────────────────────────────────────────────────────────────────────

const SOURCES: { kind: ReasonKind; name: string; run: () => Promise<Raw[]> }[] = [
  { kind: 'michelin', name: 'Michelin-opas', run: fetchMichelin },
  { kind: 'top50', name: 'Suomen 50 parasta', run: fetchTop50 },
  { kind: 'timeout', name: 'Time Out Helsinki', run: fetchTimeOut },
  { kind: 'vuoden-ravintola', name: 'Vuoden ravintola', run: fetchVuodenRavintola },
  { kind: 'uusi', name: 'Uudet avaukset', run: fetchNewOpenings },
]

async function main() {
  const byName: Record<string, RestaurantReason[]> = {}
  const counts: Record<string, number> = {}
  const failures: string[] = []

  for (const s of SOURCES) {
    process.stdout.write(`  ${s.name} … `)
    let rows: Raw[] = []
    try {
      rows = await s.run()
    } catch (e) {
      console.log(`VIRHE: ${(e as Error).message}`)
      failures.push(`${s.name}: ${(e as Error).message}`)
      continue
    }
    console.log(`${rows.length}`)
    counts[s.kind] = rows.length
    for (const { name, reason } of rows) {
      for (const key of reasonKeyVariants(name)) {
        const list = (byName[key] ??= [])
        // Sama lähde samalle paikalle vain kerran — Time Outilla sama ravintola
        // voi olla kahdella listalla, jolloin vahvempi (ensin luettu) jää.
        if (list.some((x) => x.kind === reason.kind)) continue
        list.push(reason)
      }
    }
  }

  // ── ROMAHDUSVAHTI ─────────────────────────────────────────────────────────
  // Kaikki tai ei mitään: yksikin alarajan alittava lähde estää kirjoituksen.
  // Vanha tiedosto on aina parempi kuin puolikas uusi.
  const low = SOURCES
    .filter((s) => (counts[s.kind] ?? 0) < (FLOOR[s.kind] ?? 0))
    .map((s) => `${s.name}: ${counts[s.kind] ?? 0} < ${FLOOR[s.kind]}`)

  const problems = [...failures, ...low]
  if (problems.length) {
    console.error('\nEI KIRJOITETA — lähteitä pielessä:')
    for (const p of problems) console.error(`  ✗ ${p}`)
    if (existsSync(OUT)) console.error(`  vanha ${OUT} jätetään ennalleen`)
    process.exit(1)
  }

  const file: ReasonFile = {
    fetchedAt: TODAY.toISOString(),
    byName,
    counts,
  }
  const total = Object.values(byName).flat().length
  console.log(`\n  ${Object.keys(byName).length} avainta, ${total} syytä`)

  if (DRY) {
    console.log('  --dry: ei kirjoiteta')
    return
  }
  // Vertailu edelliseen, jotta romahdus näkyy myös lokissa eikä vain diffissä.
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, 'utf8')) as ReasonFile
      for (const [k, v] of Object.entries(prev.counts ?? {})) {
        const now = counts[k] ?? 0
        const arrow = now === v ? '' : now > v ? ` (+${now - v})` : ` (${now - v})`
        console.log(`    ${k}: ${v} → ${now}${arrow}`)
      }
    } catch { /* vioittunut vanha tiedosto ei estä kirjoitusta */ }
  }
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
  console.log(`  kirjoitettu ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
