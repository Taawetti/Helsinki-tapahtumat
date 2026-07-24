// Superterassi (Kasarmitori) — viikko-ohjelman skrapperi.
//
// Korvaa aiemmin KOVAKOODATUT Superterassi-merkinnät app/api/recurring:ssa.
// Superterassin oma sivu superterassi.fi/ohjelma julkaisee kesän viikko-ohjelman
// staattisena HTML:nä. Jokaisella viikonpäivällä on oma otsikko:
//   <h4>MAANANTAI &ndash; Ole Fitissä Maanantait</h4> ... klo 10.30–11.15 ...
// ja sivu ilmoittaa kauden: "12.6.–13.8.2026".
//
// PERIAATE (laatu > kattavuus, ei koskaan väärää tapahtumaa):
//  • Kausi-ikkuna luetaan sivulta → tapahtumia EI generoida ikkunan ulkopuolelle
//    (ei haamuja avaus-/sulkupäivien reunoilla, ei viime kauden ohjelmaa uudelleen).
//  • Kunkin päivän YLEINEN viikkoaika luetaan vain otsikon jälkeisestä
//    alkutekstistä, ENNEN ensimmäistä päivättyä ("18.7. …") kertaesiintymää.
//    Jos yleistä aikaa ei ole (esim. lauantain "Food & Fun" listaa vain päivättyjä
//    keikkoja), päivä JÄTETÄÄN POIS — parempi ei mitään kuin keksitty aika.
//  • Jos sivu ei lataudu tai ei sisällä yhtään päiväotsikkoa (talvi/uudistus),
//    palautetaan tyhjä → ei tapahtumia, ei kaatumista.
//
// Malli: lib/pubivisat.ts (sama "webbisivun viikko-ohjelma → toistuvat" -kuvio).

export interface RecurringDef {
  id: string
  title: string
  shortDescription: string
  venue: string
  address: string
  lat?: number
  lon?: number
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
  startHour: number
  startMinute: number
  durationMinutes: number
  isFree: boolean
  price?: string
  ticketUrl?: string
  infoUrl?: string
  categories: string[]
  activeMonths?: number[]
  // Kausiraja (YYYY-MM-DD, inklusiivinen) sivulta luettuna. generateEvents ei
  // emittoi tämän ulkopuolelle. Ensisijainen vartija; activeMonths on varasuoja.
  seasonStart?: string
  seasonEnd?: string
}

const SUPERTERASSI_URL = 'https://www.superterassi.fi/ohjelma'
const VENUE = 'Superterassi'
const ADDRESS = 'Eteläinen Makasiinikatu 4, Helsinki'
const LAT = 60.1658
const LON = 24.9459
// Varasuoja jos kausi-ikkuna ei parsiudu: kesäterassi = kesäkuukaudet.
const ACTIVE_MONTHS = [6, 7, 8]

// Finnish weekday header (uppercase on page) → JS getDay() index.
const WEEKDAY_JS: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  sunnuntai: 0, maanantai: 1, tiistai: 2, keskiviikko: 3,
  torstai: 4, perjantai: 5, lauantai: 6,
}

// Kuratoidut, VAKAAT kategoriat per viikonpäivä (Superterassin kesäkonsepti ei
// muutu viikoittain). Skrapataan aikataulu/teema; kategoriat tulevat tästä, jotta
// tapahtumat luokittuvat oikeisiin välilehtiin. Koodivakio, EI ylläpidettävää dataa.
const WEEKDAY_CATEGORIES: Record<number, string[]> = {
  1: ['Urheilu', 'Hyvinvointi', 'Ilmainen', 'Ulkoilma'],       // ma – jooga/liikunta
  2: ['Tanssi', 'Ilmainen', 'Ulkoilma'],                       // ti – tanssi
  3: ['Keikka', 'Live', 'Musiikki', 'Ilmainen', 'Ulkoilma'],   // ke – keikkakeskiviikko
  4: ['Musiikki', 'Ilmainen', 'Ulkoilma', 'Yhteislaulu'],      // to – yhteislaulu
  5: ['Afterwork', 'Musiikki', 'Ilmainen', 'Ulkoilma', 'Baari'], // pe – after work
  6: ['Ruoka', 'Ulkoilma', 'Ilmainen'],                        // la – food & fun
  0: ['Perhe', 'Lapset', 'Ilmainen', 'Ulkoilma'],              // su – perheohjelma
}

function decodeHtml(str: string): string {
  return str
    .replace(/<[^>]+>/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&auml;/g, 'ä').replace(/&Auml;/g, 'Ä')
    .replace(/&ouml;/g, 'ö').replace(/&Ouml;/g, 'Ö')
    .replace(/&aring;/g, 'å').replace(/&Aring;/g, 'Å')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, '’').replace(/&#039;/g, "'").replace(/&#8211;/g, '–')
    .replace(/&#[0-9]+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Ensimmäisen KELVOLLISEN päivämäärätunnisteen (DD.M.) indeksi merkkijonossa,
 *  tai -1. Erottaa päivämäärän ("18.7.") kellonajasta ("18.00"): vaatii
 *  loppupisteen jota ei seuraa numero, ja päivä 1-31 / kuukausi 1-12. */
function firstDateTokenIndex(s: string): number {
  const re = /(\d{1,2})\.(\d{1,2})\.(?!\d)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    const day = parseInt(m[1], 10)
    const mon = parseInt(m[2], 10)
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) return m.index
  }
  return -1
}

/** Kauden aikaikkuna sivulta, esim. "12.6.-13.8.2026" → {start,end} YYYY-MM-DD. */
export function parseSeason(html: string): { start: string; end: string } | null {
  const m = html.match(
    /(\d{1,2})\.(\d{1,2})\.(\d{4})?\s*(?:&ndash;|–|-)\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/
  )
  if (!m) return null
  const [, sd, sm, sy, ed, em, ey] = m
  const year = sy || ey
  const p = (n: string) => n.padStart(2, '0')
  const start = `${year}-${p(sm)}-${p(sd)}`
  const end = `${ey}-${p(em)}-${p(ed)}`
  if (start > end) return null
  return { start, end }
}

/** Parsii viikko-ohjelman HTML:stä. Puhdas funktio → testattava ilman verkkoa. */
export function parseSuperterassi(html: string): RecurringDef[] {
  const defs: RecurringDef[] = []
  const seen = new Set<number>()
  const season = parseSeason(html)

  // Viikonpäiväotsikko + sitä seuraava lohko (seuraavaan otsikkoon asti).
  // <h[2-4]> jotta CMS-muutos (h4→h3) ei riko; viikonpäivänimi on ankkuri.
  const headerRe = /<h[2-4][^>]*>\s*(MAANANTAI|TIISTAI|KESKIVIIKKO|TORSTAI|PERJANTAI|LAUANTAI|SUNNUNTAI)\s*(?:&ndash;|–|-)?\s*([\s\S]*?)<\/h[2-4]>([\s\S]*?)(?=<h[2-4][^>]*>|$)/gi

  for (const m of html.matchAll(headerRe)) {
    const dayName = m[1].toLowerCase().trim()
    const weekday = WEEKDAY_JS[dayName]
    if (weekday === undefined || seen.has(weekday)) continue

    const theme = decodeHtml(m[2])
    const rawSection = m[3]

    // Yleinen viikkoaika = "klo HH.MM" sellaisessa kappaleessa JOSSA EI OLE
    // päivämäärää. Sivun rakenne on epäsäännöllinen (päivämäärät voivat olla
    // ennen tai jälkeen ajan), joten pilkomme lohkon kappaleisiin ja poimimme
    // ajat vain päivämäärättömistä kappaleista. Näin päivätyt kertaesiintymät
    // ("18.7. klo 18.00", "7.7. Mummodisko klo 13.00") EIVÄT muutu viikkoajaksi,
    // ja pelkkiä päivättyjä listaava päivä (lauantai) putoaa pois.
    // Yleinen viikkoaika on AIKAVÄLI ("klo 15.00–18.00") tai "klo 19.30 alkaen".
    // Yksittäinen "klo 14.00 Three Shots on the Rocks" on kertaesiintymän
    // alaesiintymä (lauantain "Lauantai Live"), EI viikkoaika → ei kelpaa.
    const timeRe = /klo\s*(\d{1,2})[.:](\d{2})(?:\s*(?:&ndash;|–|-)\s*(\d{1,2})[.:](\d{2}))?(\s*alkaen)?/gi
    // Jaetaan vain KAPPALETASOLLA (ei <br>:llä): päivätty lohko pysyy koossa →
    // päivämäärä pitää sen erossa yleisistä ajoista.
    const chunks = rawSection.split(/<\/?(?:p|h[1-6]|div|li|ul|ol)[^>]*>/i)
    const times: { h: number; min: number; endH: number | null; endMin: number | null }[] = []
    for (const chunk of chunks) {
      if (firstDateTokenIndex(chunk) >= 0) continue // päivätty kappale → ohita
      for (const mm of chunk.matchAll(timeRe)) {
        const isRange = mm[3] !== undefined
        const hasAlkaen = mm[5] !== undefined
        if (!isRange && !hasAlkaen) continue // yksittäinen aika = kertaesiintymä
        const h = parseInt(mm[1], 10)
        const min = parseInt(mm[2], 10)
        if (h > 23 || min > 59) continue
        times.push({
          h, min,
          endH: isRange ? parseInt(mm[3], 10) : null,
          endMin: isRange ? parseInt(mm[4], 10) : null,
        })
      }
    }
    if (times.length === 0) continue // ei yleistä viikkoaikaa → jätä pois

    // Keikka/klubi-tyyppisen päivän pääohjelma on illalla, vaikka lohkossa on
    // aiempi iltapäiväslotti (ke: 14.00 uusi musiikki + 19.30 keikka).
    const isEvening = /keikka|klubi|live|ilta|dj|konsertti/i.test(theme)
    const chosen = (isEvening && times.find((x) => x.h >= 17)) || times[0]
    const startHour = chosen.h
    const startMinute = chosen.min

    let durationMinutes = 180 // oletus: terassitapahtumat ovat pitkiä
    if (chosen.endH !== null && chosen.endMin !== null) {
      const diff = (chosen.endH * 60 + chosen.endMin) - (startHour * 60 + startMinute)
      if (diff > 0 && diff <= 12 * 60) durationMinutes = diff
    }

    const title = theme && theme.length >= 3 ? theme : `Superterassi (${dayName})`

    seen.add(weekday)
    defs.push({
      id: `superterassi-${dayName}`,
      title,
      shortDescription: `${title} Superterassilla Kasarmitorilla. Vapaa pääsy. Ohjelma: superterassi.fi/ohjelma`,
      venue: VENUE,
      address: ADDRESS,
      lat: LAT,
      lon: LON,
      weekday,
      startHour,
      startMinute,
      durationMinutes,
      isFree: true,
      infoUrl: SUPERTERASSI_URL,
      categories: WEEKDAY_CATEGORIES[weekday] ?? ['Ilmainen', 'Ulkoilma'],
      activeMonths: season ? undefined : ACTIVE_MONTHS,
      seasonStart: season?.start,
      seasonEnd: season?.end,
    })
  }

  return defs
}

let cached: RecurringDef[] | null = null
let cacheTime = 0
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h — ohjelma muuttuu harvoin

/** Hakee ja parsii Superterassin viikko-ohjelman. Virhe/tyhjä → [] (ei kaada
 *  syötettä, ei haamutapahtumia). Välimuisti 24h kuten pubivisat.
 *  Ei anna hetkellisen VAJAAN parsen ylikirjoittaa täydempää välimuistia. */
export async function fetchSuperterassiProgram(): Promise<RecurringDef[]> {
  if (cached && Date.now() - cacheTime < CACHE_TTL) return cached
  try {
    const res = await fetch(SUPERTERASSI_URL, {
      headers: { 'User-Agent': 'mitatanaan.fi event aggregator (+https://mitatanaan.fi)' },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 86400 },
    })
    if (!res.ok) return cached ?? []
    const html = await res.text()
    const defs = parseSuperterassi(html)
    if (defs.length === 0) return cached ?? []
    // Älä anna vajaan parsen (esim. markup-drift pudotti osan päivistä)
    // ylikirjoittaa täydempää välimuistia TTL:n sisällä.
    if (cached && defs.length < cached.length && Date.now() - cacheTime < CACHE_TTL) {
      console.warn(`[superterassi] parse regressed ${cached.length}→${defs.length}, pidetään välimuisti`)
      return cached
    }
    cached = defs
    cacheTime = Date.now()
    return defs
  } catch {
    return cached ?? []
  }
}
