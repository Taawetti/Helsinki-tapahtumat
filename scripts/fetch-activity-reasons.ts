// Hakee TEKEMISTÄ-sivun syyt ja kirjoittaa data/activity-reasons.json.
// Ajetaan viikoittain samassa GitHub Actions -jobissa kuin ravintolasyyt.
//
//     npx tsx scripts/fetch-activity-reasons.ts          # kirjoita tiedosto
//     npx tsx scripts/fetch-activity-reasons.ts --dry    # näytä, älä kirjoita
//
// MIKSI. Omistaja tekemistä-sivusta: "turistimainen sivu missä kaikki
// mahdolliset paikat … tällaisena se ei toimi". Sama tauti kuin ravintola-
// sivulla oli, sama lääke: paikka nousee kärkeen vain ULKOPUOLISELLA SYYLLÄ.
//
// LÄHTEET, kaikki mitattu 24.8.2026 (suluissa saanto):
//   museot.fi näyttelykalenteri   89 Helsinki-näyttelyä — museon nimi, näyttelyn
//                                 nimi ja ajankohta siistissä HTML:ssä. Robots
//                                 tyhjä (= sallittu). PARAS yksittäinen lähde:
//                                 museo ilman ajankohtaista näyttelyä on
//                                 turistikohde, sama museo uudella näyttelyllä
//                                 on syy helsinkiläiselle lähteä.
//   Time Out FI tekemistä         listat: parhaat nähtävyydet, kuntosalit,
//                                 teatterit, ilmainen tekeminen, elokuun vinkit
//   MyHelsinki                    things-to-do 10 + sauna 4 + aktiviteetit ym.
//                                 artikkelit sitemapista
//   Kotimaassa.fi                 23 nimeä listajutusta (robots tyhjä)
//   Happens.fi                    14 elämystä h4-otsikoissa ("Tarjoaja - Elämys")
//   Venuu.fi                      ~8 elämystä (robots sallii; crawl-delay 2 s
//                                 kunnioitetaan). Omistaja antoi lähteeksi.
//   OSM uudet vapaa-ajan paikat   6/180 pv: Merihaka Sauna, Solid Sauna,
//                                 Kampin Keilahalli… — juuri sitä mitä
//                                 omistaja pyysi ("uudet paikat ja saunat")
//
// TURISTIPERUSKOHTEET (Linnanmäki ym.) suodatetaan LUKUVAIHEESSA vasta
// API:ssa (lib/restaurant-reasons.ts: filterReasonsForBasics), koska sääntö
// on näkymälogiikkaa: uutinen ja näyttely saavat nostaa peruskohteenkin —
// omistajan nimenomainen linjaus.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ReasonKind, RestaurantReason, ReasonFile } from '../lib/restaurant-reasons'
import { reasonKeyVariants } from '../lib/restaurant-reasons'
import { get, stripTags, listTitleNote, listPill, extractListEntries, NOT_A_VENUE, looksLikeSentence } from '../lib/editorial-scrape'

const OUT = join(process.cwd(), 'data', 'activity-reasons.json')
const DRY = process.argv.includes('--dry')
const TODAY = new Date()

interface Raw {
  name: string
  reason: RestaurantReason
}

// Alarajat mitatusta — romahdus estää kirjoituksen (sama periaate kuin
// ravintolasyissä ja tapahtumalähteissä).
const FLOOR: Record<string, number> = {
  nayttely: 40,   // mitattu 89
  timeout: 30,    // mitattu: TO ~40 + MyHelsinki ~30 + kotimaassa 23 + happens 14
  uusi: 2,        // mitattu 6/180 pv — pieni ja arvokas
}

// ── 1. MUSEOT.FI — NÄYTTELYKALENTERI ────────────────────────────────────────
// Rakenne mitattu: <li>…<h2>Näyttelyn nimi</h2>…<p class="paikka">Museo,
// <span class="kunta">Helsinki</span></p><p class="ajankohta">6.6.2026 –
// 30.8.2026</p>…</li>. Suomen museoliiton ylläpitämä valtakunnallinen
// kalenteri; suodatetaan kunta=Helsinki.
const MUSEOT_URL = 'https://museot.fi/nayttelykalenteri/index.php?kaikki=1'

/** "6.6.2026" → Date UTC, tai null. */
function parseFiDate(s: string): Date | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim())
  if (!m) return null
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
}

/** Näyttely nostaa kunnes se on loppunut; alkava enintään 60 pv päässä.
 *  Pysyväisnäyttelyt (alkanut yli 2 v sitten) eivät ole "ajankohtaista". */
const EXHIBITION_UPCOMING_DAYS = 60
const EXHIBITION_MAX_AGE_DAYS = 730

async function fetchExhibitions(): Promise<Raw[]> {
  const html: string = await get(MUSEOT_URL)
  const out: Raw[] = []
  for (const li of html.matchAll(/<a class="normaali" href="(\/nayttelykalenteri\/index\.php\?nayttely_id=\d+)">([\s\S]*?)<\/a>/g)) {
    const [, href, block] = li
    const kunta = /<span class="kunta">\s*([^<]+?)\s*<\/span>/.exec(block)?.[1] ?? ''
    if (!/helsin/i.test(kunta)) continue
    const title = stripTags(/<h2>([\s\S]*?)<\/h2>/.exec(block)?.[1] ?? '').replace(/^TULOSSA PIAN:\s*/i, '')
    const museum = stripTags(/<p class="paikka">\s*([^<,]+?),/.exec(block)?.[1] ?? '')
    const period = stripTags(/<p class="ajankohta">\s*([\s\S]*?)\s*<\/p>/.exec(block)?.[1] ?? '')
    if (!title || !museum) continue
    const [startRaw, endRaw] = period.split(/[–-]/).map((x) => x.trim())
    const start = parseFiDate(startRaw ?? '')
    const end = parseFiDate(endRaw ?? '')
    if (!start) continue
    const startInDays = (start.getTime() - TODAY.getTime()) / 86_400_000
    if (startInDays > EXHIBITION_UPCOMING_DAYS) continue           // liian kaukana
    if (-startInDays > EXHIBITION_MAX_AGE_DAYS) continue           // pysyväisnäyttely
    if (end && end.getTime() < TODAY.getTime()) continue           // jo päättynyt
    out.push({
      name: museum,
      reason: {
        kind: 'nayttely',
        label: startInDays > 0 ? 'Uusi näyttely tulossa' : 'Ajankohtainen näyttely',
        source: 'museot.fi',
        url: `https://museot.fi${href}`,
        date: start.toISOString().slice(0, 10),
        // Kortin 🖼-rivi: näyttelyn nimi ja ajanjakso — museon oma sisältö on
        // tosiasia (nimi + päivät), ei kuvailutekstiä.
        note: `${title}${period ? ` (${period})` : ''}`.slice(0, 90),
        // byName-avain on normalisoitu pienaakkosiin — museon oikea
        // kirjoitusasu talteen Uutta Helsingissä -aikajanaa varten.
        venue: museum,
      },
    })
  }
  return out
}

// ── 2. TOIMITUKSELLISET LISTAT ──────────────────────────────────────────────
// Sama poimintakoneisto kuin ravintolapuolella (lib/editorial-scrape).

const TO_ACT_HUB = 'https://www.timeout.com/fi/helsinki/tekemista'
/** Tekemisen listasivut hubissa: tekemistä-, teatteri- ja lapsiosiot sekä
 *  juuritason listat joiden slugissa on tekemissana. */
const TO_ACT_HREF =
  /\/fi\/helsinki\/(?:(?:tekemista|teatterit|lapsille|tanssi)\/[a-z0-9-]+|[a-z0-9-]*(?:tekemista|nahtavyy|kuntosali|sauna|museo|galleria)[a-z0-9-]*)/g

async function fetchTimeOutActivities(): Promise<Raw[]> {
  const listUrls = new Set<string>()
  try {
    const hub: string = await get(TO_ACT_HUB)
    for (const m of hub.matchAll(TO_ACT_HREF)) listUrls.add(`https://www.timeout.com${m[0]}`)
  } catch { /* hubin kaatuminen ei estä muita lähteitä */ }

  const best = new Map<string, { name: string; rank?: number; note?: string; url: string }>()
  const goodness = (e: { rank?: number; note?: string }) =>
    (typeof e.rank === 'number' ? 1000 - e.rank : 0) + (e.note ? 1 : 0)
  for (const url of [...listUrls].sort()) {
    let html: string
    try { html = await get(url) } catch { continue }
    const note = listTitleNote(stripTags(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? ''))
    let found = 0
    for (const { name, rank } of extractListEntries(html)) {
      found++
      const key = name.toLowerCase()
      const cand = { name, rank, note, url }
      const prev = best.get(key)
      if (!prev || goodness(cand) > goodness(prev)) best.set(key, cand)
    }
    if (found) console.log(`    time out ${url.split('timeout.com')[1]}: ${found}`)
  }
  return [...best.values()].map((e) => ({
    name: e.name,
    reason: {
      kind: 'timeout',
      label: listPill('Time Out', e.rank),
      source: 'Time Out Helsinki',
      url: e.url,
      ...(typeof e.rank === 'number' ? { rank: e.rank } : {}),
      note: e.note,
    },
  }))
}

// MyHelsinki: tekemisen artikkelit sitemapista — saunat, talviuinti, saaristo,
// things-to-do. Sama h2/h3-poiminta kuin ruoka-artikkeleissa.
const MH_SITEMAPS = [
  'https://www.myhelsinki.fi/post-sitemap1.xml',
  'https://www.myhelsinki.fi/post-sitemap2.xml',
  'https://www.myhelsinki.fi/post-sitemap3.xml',
]
const MH_ACT_PATH = /\/(things-to-do|sauna|aktiviteetit|nae-ja-koe|see-and-do|merellinen-helsinki|design-and-architecture|design-ja-arkkitehtuuri|helsinki-for-kids|helsinki-lapsille)\//
const MH_MAX_AGE_DAYS = 365
const MH_MAX_ARTICLES = 15

async function fetchMyHelsinkiActivities(): Promise<Raw[]> {
  const articles: { url: string; lastmod: string }[] = []
  for (const sm of MH_SITEMAPS) {
    let xml: string
    try { xml = await get(sm) } catch { continue }
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?/g)) {
      const [, url, lastmod = ''] = m
      if (!MH_ACT_PATH.test(url)) continue
      const age = (TODAY.getTime() - Date.parse(lastmod)) / 86_400_000
      if (!Number.isFinite(age) || age > MH_MAX_AGE_DAYS) continue
      articles.push({ url, lastmod })
    }
  }
  articles.sort((a, b) => b.lastmod.localeCompare(a.lastmod))

  const out: Raw[] = []
  const seen = new Set<string>()
  for (const a of articles.slice(0, MH_MAX_ARTICLES)) {
    let html: string
    try { html = await get(a.url) } catch { continue }
    const h1 = stripTags(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '')
    let found = 0
    for (const m of html.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g)) {
      let t = stripTags(m[2]).replace(/^\d+\.\s*/, '')
      t = t.split(/\s+[–—]\s+/)[0].trim()
      if (t.length < 3 || t.length > 42 || NOT_A_VENUE.test(t) || looksLikeSentence(t)) continue
      if (seen.has(t.toLowerCase())) continue
      seen.add(t.toLowerCase())
      found++
      out.push({
        name: t,
        reason: {
          kind: 'timeout',
          label: 'MyHelsinki',
          source: 'MyHelsinki',
          url: a.url,
          note: listTitleNote(h1),
        },
      })
    }
    if (found) console.log(`    myhelsinki ${a.url.split('/').filter(Boolean).pop()}: ${found}`)
  }
  return out
}

// Kotimaassa.fi: yksi laadukas listajuttu, nimet <h3>-otsikoissa muodossa
// "Fööni – Vapaalentotunneli" → nimi ennen ajatusviivaa. Robots tyhjä.
const KOTIMAASSA_URL = 'https://www.kotimaassa.fi/parhaat-aktiviteetit-helsingissa/'

async function fetchKotimaassa(): Promise<Raw[]> {
  const html: string = await get(KOTIMAASSA_URL)
  const out: Raw[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g)) {
    let t = stripTags(m[2]).replace(/^\d+\.\s*/, '')
    t = t.split(/\s+[–—-]\s+/)[0].trim()
    if (t.length < 3 || t.length > 42 || NOT_A_VENUE.test(t) || looksLikeSentence(t)) continue
    if (seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push({
      name: t,
      reason: {
        kind: 'timeout',
        label: 'Kotimaassa.fi',
        source: 'Kotimaassa.fi',
        url: KOTIMAASSA_URL,
        note: 'Parhaat aktiviteetit Helsingissä',
      },
    })
  }
  return out
}

// Happens.fi: elämykset <h4>-otsikoissa muodossa "Tarjoaja - Elämys".
const HAPPENS_URL = 'https://happens.fi/aktiviteetit-helsinki'

async function fetchHappens(): Promise<Raw[]> {
  const html: string = await get(HAPPENS_URL)
  const out: Raw[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/g)) {
    const full = stripTags(m[1])
    const name = full.split(/\s+-\s+/)[0].trim()
    if (name.length < 3 || name.length > 42 || NOT_A_VENUE.test(name) || looksLikeSentence(name)) continue
    if (seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push({
      name,
      reason: {
        kind: 'timeout',
        label: 'Happens',
        source: 'Happens.fi',
        url: HAPPENS_URL,
        note: full.length > 5 && full !== name ? full.slice(0, 60) : 'Aktiviteetit Helsingissä',
      },
    })
  }
  return out
}

// Venuu.fi: elämyskortit linkkeinä /tilat/-polkuun; otsikko on linkkitekstin
// ensimmäinen rivi ("Elämys: Kellumo Kamppi | …"). robots.txt sallii (vain
// /listat, /api ja /dashboard kielletty) ja pyytää crawl-delay 2 s — tämä on
// yksi sivulataus, joten viive ei edes ehdi vaikuttaa.
const VENUU_URL = 'https://venuu.fi/elamykset-ja-aktiviteetit-helsinki'

async function fetchVenuu(): Promise<Raw[]> {
  const html: string = await get(VENUU_URL)
  const out: Raw[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(/<a[^>]+href="\/tilat\/[^"]+"[^>]*>([\s\S]*?)<\/a>/g)) {
    const firstLine = stripTags(m[1]).split('\n')[0].trim()
    let name = firstLine.replace(/^Elämys:\s*/i, '').split('|')[0].trim()
    name = name.split(/\s+[–—-]\s+/)[0].trim()
    if (name.length < 3 || name.length > 42 || NOT_A_VENUE.test(name) || looksLikeSentence(name)) continue
    if (seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push({
      name,
      reason: {
        kind: 'timeout',
        label: 'Venuu',
        source: 'Venuu.fi',
        url: VENUU_URL,
        note: 'Elämykset ja aktiviteetit Helsingissä',
      },
    })
  }
  return out
}

// ── 3. UUDET VAPAA-AJAN PAIKAT (OSM) ────────────────────────────────────────
// Sama menetelmä kuin ravintoloiden kartoitusseurannassa: OpenStreetMapiin
// juuri LUOTU kohde (version==1) on vahva uutuussignaali — kartoittajat
// lisäävät paikan viikoissa avaamisesta. Mitattu 180 pv: Merihaka Sauna,
// Solid Sauna, Kampin Keilahalli & Biljardi, Finnfoto Galleria.
const OSM_WINDOW_DAYS = 180
const OVERPASS = 'https://overpass-api.de/api/interpreter'

async function fetchNewLeisure(): Promise<Raw[]> {
  const since = new Date(TODAY.getTime() - OSM_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 19) + 'Z'
  const q = `[out:json][timeout:120];
area["boundary"="administrative"]["admin_level"="8"]["name"="Helsinki"]->.hki;
(
  nwr["leisure"~"^(sauna|escape_game|trampoline_park|climbing|bowling_alley|amusement_arcade|miniature_golf)$"](area.hki)(newer:"${since}");
  nwr["tourism"~"^(museum|gallery|attraction)$"](area.hki)(newer:"${since}");
  nwr["amenity"~"^(public_bath|planetarium|cinema|arts_centre)$"](area.hki)(newer:"${since}");
  nwr["amenity"~"^(cafe|restaurant|bar|pub|biergarten|ice_cream)$"](area.hki)(newer:"${since}");
  nwr["shop"~"^(bakery|pastry|confectionery|chocolate|coffee|deli|cheese|wine|books|music|second_hand)$"](area.hki)(newer:"${since}");
);
out tags center meta;`
  const res = await fetch(OVERPASS, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(q),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass palauttaa 406 ilman tunnistautuvaa User-Agentia — mitattu.
      'User-Agent': 'MitaTanaanBot/1.0 (+https://mitatanaan.fi)',
    },
    signal: AbortSignal.timeout(150_000),
  })
  if (!res.ok) throw new Error(`overpass: HTTP ${res.status}`)
  const data = await res.json() as { elements?: { type: string; id: number; version?: number; timestamp?: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] }
  const out: Raw[] = []
  const MONTHS = ['tammikuussa', 'helmikuussa', 'maaliskuussa', 'huhtikuussa', 'toukokuussa', 'kesäkuussa', 'heinäkuussa', 'elokuussa', 'syyskuussa', 'lokakuussa', 'marraskuussa', 'joulukuussa']
  // Ruoka- ja kauppapaikat menevät VAIN newPlaces-osioon (Uutta Helsingissä
  // -sivu). byName syöttää nimiosumia tekemistä-korteille, ja uusi kahvila
  // samalla nimellä kuin vanha aktiviteetti antaisi väärän "Uusi paikka"
  // -merkin.
  const FOOD_OR_SHOP = /^(cafe|restaurant|bar|pub|biergarten|ice_cream|bakery|pastry|confectionery|chocolate|coffee|deli|cheese|wine|books|music|second_hand)$/
  for (const el of data.elements ?? []) {
    if (el.version !== 1 || !el.tags?.name || !el.timestamp) continue
    const d = new Date(el.timestamp)
    const venueType = el.tags.leisure || el.tags.tourism || el.tags.amenity || el.tags.shop || ''
    const reason: RestaurantReason = {
      kind: 'uusi',
      label: `Uusi paikka · ${MONTHS[d.getUTCMonth()]}`,
      source: 'OpenStreetMap',
      url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      date: el.timestamp.slice(0, 10),
      venue: el.tags.name,
      // Solmulla koordinaatit ovat suoraan, way/relation saa niiden
      // keskipisteen (out center) — Uutta Helsingissä -sivun karttalinkkiä
      // ja kaupunginosaa varten.
      lat: el.lat ?? el.center?.lat,
      lon: el.lon ?? el.center?.lon,
      venueType,
      // Ei katuosoitetta → matchReasons hyväksyy vain uniikilla nimellä,
      // mikä on juuri oikein: nimi tulee samasta OSM:stä kuin paikkakin.
    }
    NEW_PLACES.push(reason)
    if (!FOOD_OR_SHOP.test(venueType)) out.push({ name: el.tags.name, reason })
  }
  return out
}

/** KAIKKI OSM:n uudet paikat — myös ne jotka eivät kuulu tekemistä-sivulle.
 *  fetchNewLeisure täyttää; main() kirjoittaa tiedoston newPlaces-osioon. */
const NEW_PLACES: RestaurantReason[] = []

// ── AJO ─────────────────────────────────────────────────────────────────────

const SOURCES: { kind: ReasonKind; name: string; run: () => Promise<Raw[]> }[] = [
  { kind: 'nayttely', name: 'museot.fi näyttelyt', run: fetchExhibitions },
  { kind: 'timeout', name: 'Time Out tekemistä', run: fetchTimeOutActivities },
  { kind: 'timeout', name: 'MyHelsinki tekemistä', run: fetchMyHelsinkiActivities },
  { kind: 'timeout', name: 'Kotimaassa.fi', run: fetchKotimaassa },
  { kind: 'timeout', name: 'Happens.fi', run: fetchHappens },
  { kind: 'timeout', name: 'Venuu.fi', run: fetchVenuu },
  { kind: 'uusi', name: 'OSM uudet paikat', run: fetchNewLeisure },
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
    counts[s.kind] = (counts[s.kind] ?? 0) + rows.length
    for (const { name, reason } of rows) {
      for (const key of reasonKeyVariants(name)) {
        const list = (byName[key] ??= [])
        // Näyttelyissä sallitaan USEAMPI saman lajin syy per museo (Kiasmalla
        // on monta näyttelyä) — muissa lajeissa ensimmäinen (vahvin) voittaa.
        if (reason.kind !== 'nayttely' && list.some((x) => x.kind === reason.kind)) continue
        if (reason.kind === 'nayttely' && list.filter((x) => x.kind === 'nayttely').length >= 3) continue
        list.push(reason)
      }
    }
  }

  const low = Object.entries(FLOOR)
    .filter(([kind, floor]) => (counts[kind] ?? 0) < floor)
    .map(([kind, floor]) => `${kind}: ${counts[kind] ?? 0} < ${floor}`)
  const problems = [...failures, ...low]
  if (problems.length) {
    console.error('\nEI KIRJOITETA — lähteitä pielessä:')
    for (const p of problems) console.error(`  ✗ ${p}`)
    if (existsSync(OUT)) console.error(`  vanha ${OUT} jätetään ennalleen`)
    process.exit(1)
  }

  // Uutta Helsingissä -sivun lattia: jos Overpass onnistui mutta paikkoja on
  // epäilyttävän vähän, kyse on kyselyviasta — vanha tiedosto on parempi.
  if (!failures.some((f) => f.startsWith('OSM')) && NEW_PLACES.length < 2) {
    console.error(`\nEI KIRJOITETA — newPlaces ${NEW_PLACES.length} < 2`)
    process.exit(1)
  }
  const file: ReasonFile = { fetchedAt: TODAY.toISOString(), byName, counts, newPlaces: NEW_PLACES }
  const total = Object.values(byName).flat().length
  console.log(`\n  ${Object.keys(byName).length} avainta, ${total} syytä`)
  if (DRY) { console.log('  --dry: ei kirjoiteta'); return }
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, 'utf8')) as ReasonFile
      for (const [k, v] of Object.entries(prev.counts ?? {})) {
        const now = counts[k] ?? 0
        console.log(`    ${k}: ${v} → ${now}${now === v ? '' : now > v ? ` (+${now - v})` : ` (${now - v})`}`)
      }
    } catch { /* vioittunut vanha ei estä */ }
  }
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
  console.log(`  kirjoitettu ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
