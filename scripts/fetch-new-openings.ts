// Hakee JUURI AVATTUJEN ravintoloiden kortit ja kirjoittaa
// data/new-openings.json. Ajetaan viikoittain samassa GitHub Actions -jobissa
// kuin syiden haku, heti sen jälkeen.
//
//     npx tsx scripts/fetch-new-openings.ts          # hae ja kirjoita
//     npx tsx scripts/fetch-new-openings.ts --dry    # näytä, älä kirjoita
//     npx tsx scripts/fetch-new-openings.ts --limit 5
//
// MIKSI TÄMÄ ON OLEMASSA. Anniskeluluparekisteri kertoo 86 uudesta helsinki-
// läisestä ravintolasta, mutta vain 12 niistä on OpenStreetMapissa — juuri
// avatusta paikasta ei yleensä vielä ole karttamerkintää. Näkymättä jäivät siis
// juuri kiinnostavimmat: Copitas, QVEVRI, BasBas Sirkus, Weckström Roastery,
// KATANA, Miller's BBQ (avaa syyskuussa), Ravintola Iki (avaa lokakuussa).
//
// Rekisteristä saa nimen, osoitteen ja päivän — mutta ei kuvaa. Kuvaton kortti
// on juuri se "litania" jonka omistaja hylkäsi, joten paikat haetaan Googlesta
// (DataForSEO, sama palvelu jota sovellus jo käyttää) yhdellä kutsulla per
// paikka. Vastaus antaa kuvan, arvosanan, koordinaatit, aukiolot ja kategorian.
//
// MAKSAA VAIN UUSISTA. Jo haetut säilyvät tiedostossa eikä niitä kysytä
// uudelleen. Ensimmäinen ajo ~86 kutsua, sen jälkeen vain viikon uudet
// (mitattu ~5–8 kuukaudessa). Toistuva kulu on siis käytännössä olematon.
//
// NELJÄ TARKISTUSTA, koska Google-haku voi palauttaa VÄÄRÄN paikan:
//   1. osoitteen on täsmättävä rekisterin katuun ja numeroon
//   2. kaupungin on oltava Helsinki
//   3. koordinaatit vaaditaan — ilman niitä kortti ei mene kartalle
//   4. Googlen kategorian on oltava ruoka- tai juomapaikka (ei hotelli,
//      ei kokouskeskus, ei kampaamo) eikä pizza|kebab|burger
// Väärä kortti on pahempi kuin puuttuva kortti.
//
// VAATII: DATAFORSEO_TOKEN

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { streetKey, sameStreet } from '../lib/restaurant-reasons'
import type { ReasonFile, RestaurantReason } from '../lib/restaurant-reasons'
import { googleTimetableToOsm } from '../lib/google-hours'
import { googleCategoriesToCuisine } from '../lib/cuisine'

const REASONS = join(process.cwd(), 'data', 'restaurant-reasons.json')
const OUT = join(process.cwd(), 'data', 'new-openings.json')
const DRY = process.argv.includes('--dry')
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit')
  return i > 0 ? Number(process.argv[i + 1]) || 0 : 0
})()

/** Yksi valmis kortti. API täydentää lopun `Restaurant`-muotoon. */
export interface NewOpening {
  /** Vakaa tunniste: nimi + katuavain. Sama paikka saa saman id:n joka ajolla. */
  key: string
  name: string
  address: string
  lat: number
  lon: number
  image: string | null
  www: string | null
  phone: string | null
  category: string | null
  cuisineCategories: string[]
  openingHours: string | null
  priceLevel: string | null
  googleRating: number | null
  reviewCount: number | null
  /** Anniskeluluvan alkupäivä. */
  openedAt: string
  /** Milloin haettu Googlesta. */
  fetchedAt: string
}

interface OpeningFile {
  fetchedAt: string
  openings: NewOpening[]
  /** Paikat joita ei löytynyt tai jotka eivät läpäisseet tarkistusta. Muistiin,
   *  jottei samaa turhaa hakua makseta joka viikko. */
  misses: { key: string; why: string; triedAt: string }[]
}

/** Vakaa avain: nimi + katuavain. Päivä EI ole mukana — luvan päivä voi
 *  tarkentua rekisterissä, eikä se saa tuottaa uutta maksullista hakua. */
function openingKey(name: string, street: string): string {
  const s = streetKey(street) ?? street.toLowerCase().trim()
  return `${name.toLowerCase().trim()}|${s}`
}

// ── MIKÄ ON RAVINTOLA ───────────────────────────────────────────────────────
// Googlen oma kategoria on paras erottelija, koska se kertoo mitä paikka
// OIKEASTI on — parempi kuin nimestä arvaaminen. Mitattu koeajossa:
//     Horisontin Huippu   → "Kokouskeskus"                    ei ravintola
//     Hotel Rantapuisto   → "Hotelli"                          ei ravintola
//     Luu's Wine Shop     → "Viinimyymälä" + "Viinibaari"      kelpaa (baari)
//     Copitas             → "Baari" + "Ravintola"              kelpaa
//     QVEVRI              → "Gruusialainen ravintola" + …      kelpaa
// Riittää että YKSI kategoria on ruoka- tai juomapaikka: hotellin ravintola
// kelpaa, pelkkä hotelli ei.
const FOOD_CATEGORY =
  /ravintola|kahvila|baari|\bbaari\b|pubi|kuppila|bistro|konditoria|leipomo|kahvipaahtimo|jäätelö|sushi|caf[eé]\b|\bbar\b|restaurant|panimo|brewery|yökerho|ruokala|noutoravintola|olutravintola|viinibaari|kokteilibaari|tapasbaari/i

/**
 * Pikaruoka jätetään pois myös kategorian perusteella, ei vain nimen.
 *
 * PIZZA EI OLE TÄSSÄ. Omistaja tarkensi: "artesaani/napolipizza paikat myös
 * [saavat tulla]. tarkoitin kebabpizzerioita jotka eivät ole varsinaisia
 * ravintoloita." Mitattu ero: klassisella kebabpizzerialla on OSM:ssä sekä
 * pizza että kebab (88 paikkaa), artesaaneilla pelkkä pizza. Googlen
 * kategoriassa sama näkyy sanana "kebab" tai "döner" — Bröner Kallio oli
 * "Dönerkebabravintola" ja pudotettiin oikein.
 */
const FAST_FOOD_CATEGORY = /hampurilais|burger|kebab|döner|doner|shawarma|pikaruoka|grillikioski/i

/** Epäonnistunut haku yritetään uudelleen kuukauden päästä — paikka voi
 *  ilmestyä Googleen vasta avaamisen jälkeen. */
const MISS_RETRY_DAYS = 14
/** Avaus poistuu listalta kun se ei enää ole uutinen. */
const KEEP_DAYS = 200
/** Kuinka monta hakua rinnakkain. Palvelu jonottaa kutsut, ja mitattu kesto on
 *  ~25 s per kutsu, joten neljä rinnakkain pitää ajon alle kymmenessä
 *  minuutissa mutta ei ruuhkauta. */
const CONCURRENCY = 4

// ── GOOGLE-HAKU ─────────────────────────────────────────────────────────────

interface Business {
  found: boolean
  address?: string
  city?: string
  lat?: number
  lon?: number
  image: string | null
  www: string | null
  phone: string | null
  category: string | null
  categories: string[]
  workTime?: unknown
  priceLevel: string | null
  rating: number | null
  reviewCount: number | null
}

/**
 * "Ei hakutuloksia" (40102) EI OLE LUOTETTAVA VASTAUS. Mitattu: Weckström
 * Roastery, Omu Raisu ja Shanghai Taste palauttivat 40102 erässä, mutta
 * TÄSMÄLLEEN sama hakusana löysi ne heti perään. Palvelu on skrape, ja skrape
 * epäonnistuu välillä hiljaa. Jos tyhjä vastaus uskottaisiin, paikkoja katoaisi
 * satunnaisesti — juuri se vika jota tässä projektissa vältetään kaikkein
 * eniten. Siksi tyhjä yritetään uudelleen, ja vasta kolme peräkkäistä tyhjää
 * kirjataan osumattomaksi.
 */
const EMPTY_RETRIES = 3
const RETRY_PAUSE_MS = 1500

async function lookupWithRetry(query: string): Promise<Business | null> {
  let last: Business | null = null
  for (let i = 0; i < EMPTY_RETRIES; i++) {
    const r = await lookup(query)
    if (r === null) return null            // tekninen virhe → ei kirjata mitään
    if (r.found) return r
    last = r
    if (i < EMPTY_RETRIES - 1) await new Promise((s) => setTimeout(s, RETRY_PAUSE_MS))
  }
  return last
}

/** null = tekninen virhe (yritetään uudelleen). `found:false` = ei Googlessa. */
async function lookup(query: string): Promise<Business | null> {
  const token = process.env.DATAFORSEO_TOKEN
  if (!token) throw new Error('DATAFORSEO_TOKEN puuttuu')
  let data: {
    tasks?: { status_code?: number; result?: { items?: Record<string, unknown>[] }[] }[]
  }
  const empty = {
    found: false, image: null, www: null, phone: null, category: null,
    categories: [], priceLevel: null, rating: null, reviewCount: null,
  }
  try {
    const res = await fetch(
      'https://api.dataforseo.com/v3/business_data/google/my_business_info/live',
      {
        method: 'POST',
        headers: { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          keyword: query,
          location_name: 'Helsinki,Helsinki,Uusimaa,Finland',
          language_name: 'Finnish',
        }]),
        signal: AbortSignal.timeout(60_000),   // mitattu ~25 s onnistuessaankin
      },
    )
    if (!res.ok) return null
    data = await res.json()
  } catch {
    return null
  }
  const task = data?.tasks?.[0]
  if (!task) return null
  if (task.status_code === 40102) return empty        // "No Search Results"
  if (task.status_code !== 20000) return null

  const item = task.result?.[0]?.items?.[0] as Record<string, unknown> | undefined
  if (!item) return empty

  const info = item.address_info as { city?: string } | undefined
  const cats: string[] = []
  if (typeof item.category === 'string') cats.push(item.category)
  if (Array.isArray(item.additional_categories)) cats.push(...(item.additional_categories as string[]))

  return {
    found: true,
    address: typeof item.address === 'string' ? item.address : undefined,
    city: info?.city,
    lat: typeof item.latitude === 'number' ? item.latitude : undefined,
    lon: typeof item.longitude === 'number' ? item.longitude : undefined,
    image: typeof item.main_image === 'string' ? item.main_image : null,
    www: typeof item.url === 'string' ? item.url : null,
    phone: typeof item.phone === 'string' ? item.phone : null,
    category: typeof item.category === 'string' ? item.category : null,
    categories: cats,
    workTime: item.work_time,
    priceLevel: typeof item.price_level === 'string' ? item.price_level : null,
    rating: (item.rating as { value?: number } | undefined)?.value ?? null,
    reviewCount: (item.rating as { votes_count?: number } | undefined)?.votes_count ?? null,
  }
}

// ── AJO ─────────────────────────────────────────────────────────────────────

function loadPrevious(): OpeningFile {
  if (!existsSync(OUT)) return { fetchedAt: '', openings: [], misses: [] }
  try {
    const f = JSON.parse(readFileSync(OUT, 'utf8')) as OpeningFile
    return {
      fetchedAt: f.fetchedAt ?? '',
      openings: Array.isArray(f.openings) ? f.openings : [],
      misses: Array.isArray(f.misses) ? f.misses : [],
    }
  } catch {
    // Vioittunut tiedosto ei saa estää ajoa, mutta se maksaa uudet haut.
    console.warn('  varoitus: vanhaa tiedostoa ei voitu lukea, haetaan kaikki uudelleen')
    return { fetchedAt: '', openings: [], misses: [] }
  }
}

const dayDiff = (a: Date, b: string) => (a.getTime() - Date.parse(b)) / 86_400_000

async function main() {
  const today = new Date()
  if (!existsSync(REASONS)) throw new Error(`${REASONS} puuttuu — aja fetch-restaurant-reasons ensin`)
  const reasons = JSON.parse(readFileSync(REASONS, 'utf8')) as ReasonFile

  // Uusi-syyt uniikeiksi paikoiksi. Sama syy toistuu tiedostossa nimen eri
  // kirjoitusasuilla, joten avain on nimi + katu.
  const wanted = new Map<string, { name: string; street: string; date: string }>()
  for (const list of Object.values(reasons.byName ?? {})) {
    for (const r of list as RestaurantReason[]) {
      if (r.kind !== 'uusi' || !r.street || !r.date || !r.venue) continue
      const k = openingKey(r.venue, r.street)
      if (!wanted.has(k)) wanted.set(k, { name: r.venue, street: r.street, date: r.date })
    }
  }
  console.log(`  syytiedostossa uusia avauksia: ${wanted.size}`)
  if (!wanted.size) throw new Error('ei yhtään uusi-syytä — onko fetch-restaurant-reasons ajettu?')

  const prev = loadPrevious()
  const have = new Map(prev.openings.map((o) => [o.key, o]))
  const missed = new Map(prev.misses.map((m) => [m.key, m]))
  console.log(`  tallessa jo: ${have.size} korttia, ${missed.size} osumatonta`)

  // Mitä pitää hakea: ei vielä tallessa, eikä äskettäin epäonnistunut —
  // SEKÄ vanhentuneet kortit: Googlen kuvaosoite lahoaa viikoissa (mitattu
  // 49 % kuolleita), joten yli 60 pv vanha kortti haetaan uudelleen ja saa
  // tuoreen kuvan. Hinta on muutama sentti viikossa.
  const IMAGE_REFRESH_DAYS = 60
  const todo = [...wanted.entries()].filter(([k]) => {
    const h = have.get(k)
    if (h) return dayDiff(today, h.fetchedAt) > IMAGE_REFRESH_DAYS
    const m = missed.get(k)
    return !m || dayDiff(today, m.triedAt) > MISS_RETRY_DAYS
  })
  const batch = LIMIT > 0 ? todo.slice(0, LIMIT) : todo
  console.log(`  haetaan Googlesta: ${batch.length}${LIMIT ? ` (--limit ${LIMIT}, jonossa ${todo.length})` : ''}`)

  const fresh: NewOpening[] = []
  const newMisses: OpeningFile['misses'] = []
  let done = 0

  async function worker(queue: typeof batch) {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      const [key, w] = next
      const biz = await lookupWithRetry(`${w.name} ${w.street} Helsinki`)
      done++
      const tag = `[${String(done).padStart(3)}/${batch.length}] ${w.name.slice(0, 30)}`
      if (biz === null) { console.log(`${tag} — tekninen virhe, yritetään ensi kerralla`); continue }
      if (!biz.found) { newMisses.push({ key, why: 'ei Googlessa', triedAt: today.toISOString() }); console.log(`${tag} — ei Googlessa`); continue }

      // TARKISTUS 1 — osoitteen on täsmättävä. Google-haku voi palauttaa
      // samannimisen paikan muualta; osoite on ainoa varma tunniste.
      if (!sameStreet(w.street, biz.address)) {
        newMisses.push({ key, why: `osoite ei täsmää (${biz.address ?? '—'})`, triedAt: today.toISOString() })
        console.log(`${tag} — osoite ei täsmää: "${biz.address ?? '—'}" ≠ "${w.street}"`)
        continue
      }
      // TARKISTUS 2 — Helsinki.
      if (biz.city && !/^helsinki$/i.test(biz.city.trim())) {
        newMisses.push({ key, why: `väärä kaupunki (${biz.city})`, triedAt: today.toISOString() })
        console.log(`${tag} — väärä kaupunki: ${biz.city}`)
        continue
      }
      // TARKISTUS 3 — koordinaatit, muuten kortti ei mene kartalle.
      if (typeof biz.lat !== 'number' || typeof biz.lon !== 'number') {
        newMisses.push({ key, why: 'ei koordinaatteja', triedAt: today.toISOString() })
        console.log(`${tag} — ei koordinaatteja`)
        continue
      }
      // TARKISTUS 4 — onko tämä ravintola. Googlen kategoria kertoo sen
      // paremmin kuin nimi: "Horisontin Huippu" on kokouskeskus.
      const catText = biz.categories.join(' | ')
      if (!biz.categories.some((c) => FOOD_CATEGORY.test(c))) {
        newMisses.push({ key, why: `ei ravintola (${catText || '—'})`, triedAt: today.toISOString() })
        console.log(`${tag} — ei ravintola: ${catText || '—'}`)
        continue
      }
      if (biz.categories.every((c) => FAST_FOOD_CATEGORY.test(c) || !FOOD_CATEGORY.test(c))) {
        newMisses.push({ key, why: `pikaruoka (${catText})`, triedAt: today.toISOString() })
        console.log(`${tag} — pikaruoka: ${catText}`)
        continue
      }

      fresh.push({
        key,
        name: w.name,
        address: biz.address ?? w.street,
        lat: biz.lat,
        lon: biz.lon,
        image: biz.image,
        www: biz.www,
        phone: biz.phone,
        category: biz.category,
        cuisineCategories: googleCategoriesToCuisine(biz.categories),
        openingHours: biz.workTime ? googleTimetableToOsm(biz.workTime) : null,
        priceLevel: biz.priceLevel,
        googleRating: biz.rating,
        reviewCount: biz.reviewCount,
        openedAt: w.date,
        fetchedAt: today.toISOString(),
      })
      console.log(`${tag} — OK${biz.image ? ' + kuva' : ' (ei kuvaa)'}`)
    }
  }

  const queue = [...batch]
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker(queue)))

  // Yhdistä: vanhat säilyvät, uudet lisätään, liian vanhat ja rekisteristä
  // kadonneet poistuvat.
  const merged = new Map(have)
  for (const o of fresh) merged.set(o.key, o)
  const kept = [...merged.values()].filter((o) => {
    if (!wanted.has(o.key)) return false                    // ei enää rekisterissä
    return dayDiff(today, o.openedAt) <= KEEP_DAYS          // ei enää uutinen
  })
  kept.sort((a, b) => b.openedAt.localeCompare(a.openedAt))

  const missMerged = new Map(missed)
  for (const m of newMisses) missMerged.set(m.key, m)
  const missKept = [...missMerged.values()].filter((m) => wanted.has(m.key))

  const withImage = kept.filter((o) => o.image).length
  console.log(`\n  kortteja yhteensä ${kept.length} (kuvallisia ${withImage}), osumattomia ${missKept.length}`)
  console.log(`  uusia tällä ajolla ${fresh.length}, epäonnistuneita ${newMisses.length}`)

  if (DRY) { console.log('  --dry: ei kirjoiteta'); return }

  // Ei tyhjennetä olemassa olevaa tiedostoa jos haku epäonnistui kokonaan.
  if (!kept.length && have.size > 0) {
    console.error('  EI KIRJOITETA — tulos tyhjä vaikka vanhassa oli kortteja')
    process.exit(1)
  }
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  const file: OpeningFile = { fetchedAt: today.toISOString(), openings: kept, misses: missKept }
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
  console.log(`  kirjoitettu ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
