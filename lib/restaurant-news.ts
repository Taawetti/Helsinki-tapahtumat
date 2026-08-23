// Ravintolauutisten haku Google Newsin RSS:stä.
//
// MIKSI TÄMÄ ON LIB EIKÄ ENÄÄ ROUTE. Aiemmin uutiset näytettiin omana
// "Tuoreita artikkeleita valinnan tueksi" -karusellina. Omistaja poisti sen:
// yleiset artikkelit eivät auta valitsemaan paikkaa. Nyt jutut YHDISTETÄÄN
// ravintoloihin nimen perusteella (lib/restaurant-news-match.ts) ja uutinen
// näkyy suoraan sen ravintolan kortissa — ja nostaa kortin kärkeen niin kauan
// kuin uutinen on tuore. /api/restaurants kutsuu tätä palvelimella.
//
// Suodattimet (POSITIVE/NEGATIVE/OTHER_CITY) ovat mitattuja — jokainen sana
// on lisätty tai poistettu todellisen läpi menneen tai väärin pudonneen
// otsikon takia. Älä muokkaa ilman uutta mittausta.

import { unstable_cache } from 'next/cache'

export interface NewsItem {
  title: string
  link: string
  source: string
  pubDate: string
}

// Hakuja LAAJENNETTU 4 → 12 → 16. Ensimmäinen laajennus siksi, että juttuja
// ei lueta listana vaan ne yhdistetään ravintoloihin nimeltä (osumia syntyy
// vain kun juttu mainitsee paikan). Toinen laajennus omistajan pyynnöstä:
// avajaisten lisäksi halutaan TARJOUKSET, ERIKOISILLALLISET ja TAPAHTUMAT —
// "kaikkea mikä voisi auttaa asiakasta tekemään päätöksen".
const QUERIES = [
  'Helsinki+uusi+ravintola',                           // avajaiset
  'Helsinki+ravintola+avasi',
  'Helsinki+ravintola+avautuu',
  'Helsinki+uusi+viinibaari',
  'Helsinki+uusi+kahvila',
  'Helsinki+baari+avasi',
  'Helsinki+bistro+uusi',
  'ravintola+Kallio+uusi',
  'Helsinki+pop-up+ravintola',
  'Helsinki+ravintola+Michelin+OR+arvostelu+OR+palkinto', // palkinnot & arviot
  'Helsinki+ravintola+paras+OR+äänesti+OR+lista',      // listat & äänestykset
  'Helsinki+baari+OR+kahvila+uusi+OR+paras',           // baarit & kahvilat
  'Helsinki+ravintola+tarjous',                        // tarjoukset
  'Helsinki+ravintola+illallinen',                     // erikoisillalliset
  'Helsinki+ravintola+brunssi',
  'Helsinki+ravintola+uusi+menu',
]

// Tekemisen uutiset (saunat, museot, näyttelyt, elämykset) — sama putki
// syöttää myös /api/activities-syyt. Näihin EI sovelleta POSITIVE-ruokasana-
// suodatinta (se on ravintolakohtainen), mutta NEGATIVE ja OTHER_CITY pätevät.
// Nimiyhdistäjä on varsinainen portti tässäkin.
const ACTIVITY_QUERIES = [
  'Helsinki+uusi+sauna',
  'Helsinki+museo+uusi+näyttely',
  'Helsinki+näyttely+avautuu',
  'Helsinki+uusi+galleria',
  'Helsinki+teatteri+ensi-ilta',
  'Helsinki+uusi+pakohuone+OR+keilahalli+OR+kiipeilykeskus',
  'Helsinki+maauimala+OR+uimahalli+avautuu',
]

// Uutta Helsingissä -sivun avautumiskyselyt: kaikki mikä AUKEAA kaupunkiin —
// myös se mitä rekisterit eivät näe (hotellit, kaupat, kuntosalit) tai eivät
// näe vielä (juttu ilmestyy ennen lupaa). Samat suodattimet kuin
// tekemiskyselyillä: ei ruokasanavaadetta, NEGATIVE ja OTHER_CITY pätevät.
const OPENING_QUERIES = [
  'Helsinkiin+avautuu',
  'Helsinki+avaa+ovensa',
  'Helsinki+avajaiset',
  'Helsinki+uusi+hotelli',
  'Helsinki+uusi+kauppa+OR+myymälä+OR+putiikki',
  'Helsinki+uusi+kuntosali+OR+liikuntakeskus+OR+padel',
  'Suomen+ensimmäinen+avautuu+Helsinkiin',
]

// Sesonki tuo ne uutiset joita asiakas juuri nyt etsii: isänpäivälounaat
// marraskuussa, rapukausi elokuussa. Kuukausi luetaan hakuhetkellä; välimuisti
// vanhenee tunnissa, joten kuunvaihde vaihtaa kyselyt itsestään.
const SEASONAL: Record<number, string[]> = {
  2: ['Helsinki+ystävänpäivä+illallinen'],
  3: ['Helsinki+pääsiäinen+brunssi'],
  4: ['Helsinki+vappu+ravintola', 'Helsinki+pääsiäinen+brunssi'],
  5: ['Helsinki+äitienpäivä+lounas', 'Helsinki+vappu+brunssi'],
  6: ['Helsinki+juhannus+ravintola'],
  8: ['Helsinki+rapujuhlat+OR+rapukausi'],
  9: ['Helsinki+oktoberfest'],
  10: ['Helsinki+isänpäivä+lounas'],
  11: ['Helsinki+isänpäivä+lounas', 'Helsinki+pikkujoulu+ravintola'],
  12: ['Helsinki+joululounas+OR+joulumenu', 'Helsinki+uudenvuoden+illallinen'],
}

// Otsikossa on oltava jokin näistä, jotta se ylipäätään koskee syömistä.
const POSITIVE = /ravintola|baari|kahvila|ruoka|kokki|menu|lounas|ruokapaikka|Michelin|bistro|gastropub|brunssi|illallinen/i

// KORJATTU 8/2026 — 'yrittäj' ja 'lento' tappoivat juuri ne jutut joita osio
// on olemassa näyttämään (Rogue Rouge, Teller, lentoaseman uusi ravintola).
// Ravintolauutisessa "yrittäjä" on positiivinen sana. Purkaminen ja muut
// kaupungit lisättiin mitattujen läpivuotojen takia.
const NEGATIVE = /konkurssi|sulkee|suljettu|sulkeminen|lopettaa|puretaan|purkaa|puretaanko|kaaos|rakennustyö|lakko|työtaistelu|sakko|tuomio|velka|ryöst|huijaus/i

// Muualla kuin pääkaupunkiseudulla tapahtuva ei kuulu Helsingin sivulle.
// Mitattu läpivuoto: "palkittu Bistro Bardot avautuu TAMPEREELLA".
const OTHER_CITY = /\b(tampere|turku|oulu|jyväskyl|kuopio|lahti|lahte|vaasa|rovaniem|pori|joensuu|lappeenrant|hämeenlinn|seinäjo|kotka|mikkel)\w*/i

function extractText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`))
  return (m?.[1] || m?.[2] || '').trim()
}

function extractLink(item: string): string {
  const m = item.match(/<link>([^<]+)<\/link>/) || item.match(/<guid[^>]*>([^<]+)<\/guid>/)
  return m?.[1]?.trim() || ''
}

function extractSource(item: string): string {
  const m = item.match(/<source[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/source>/)
  return m?.[1]?.trim() || ''
}

async function fetchQuery(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${query}&hl=fi&gl=FI&ceid=FI:fi`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-tapahtumat/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const xml = await res.text()

    const items: NewsItem[] = []
    for (const block of (xml.match(/<item>([\s\S]*?)<\/item>/g) || [])) {
      let title = extractText(block, 'title')
      const source = extractSource(block)
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim()
      const link = extractLink(block)
      const pubDate = extractText(block, 'pubDate')
      if (title && link) items.push({ title, link, source, pubDate })
    }
    return items
  } catch {
    // Yksi epäonnistunut kysely ei kaada muita — ja uutisten puuttuminen ei
    // KOSKAAN saa kaataa ravintolalistaa, joten myös kutsuja suojautuu.
    return []
  }
}

// ── CITY.FI ─────────────────────────────────────────────────────────────────
// Ruoka ja ravintolat -kategoria WordPress REST -rajapinnasta (ei avainta,
// robots.txt puuttuu = ei rajoituksia). Mitattu 23.8.2026: 100 juttua / 90 pv,
// joista 2 nimesi ravintolan otsikossa (Fat Tony's; Grönin ja Borealin
// Michelin-tähdet) — vähän mutta laadukasta, ja hinta on yksi kutsu tunnissa.
async function fetchCityFi(): Promise<NewsItem[]> {
  try {
    const after = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString().slice(0, 19)
    const res = await fetch(
      `https://www.city.fi/wp-json/wp/v2/posts?categories=34&per_page=50&after=${after}&_fields=date,title,link`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-tapahtumat/1.0)' }, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return []
    const posts = await res.json() as { date?: string; title?: { rendered?: string }; link?: string }[]
    if (!Array.isArray(posts)) return []
    return posts.flatMap((p) => {
      const title = (p.title?.rendered ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
      return title && p.link && p.date ? [{ title, link: p.link, source: 'City.fi', pubDate: p.date }] : []
    })
  } catch {
    return []
  }
}

// ── TIME OUT HELSINKI, UUTISET ──────────────────────────────────────────────
// Suomenkielinen uutisosio kirjoittaa juuri siitä mitä tähän tarvitaan:
// arvosteluja ja pop-upeja nimillä (mitattu 23.8.2026: Fat Tony's, Tyyni,
// BUBS-pop-up, Birds of Paradise -arvostelu). Artikkelilinkit luetaan hubista
// ja otsikko + julkaisuaika kunkin artikkelin metasta. ~12 hakua tunnissa.
const TO_NEWS_HUB = 'https://www.timeout.com/fi/helsinki/uutiset'
const TO_NEWS_MAX = 12

async function fetchTimeOutNews(): Promise<NewsItem[]> {
  try {
    const hubRes = await fetch(TO_NEWS_HUB, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-tapahtumat/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!hubRes.ok) return []
    const hub = await hubRes.text()
    const slugs = [...new Set(
      [...hub.matchAll(/\/fi\/helsinki\/uutiset\/([a-z0-9-]+)/g)].map((m) => m[1]),
    )].slice(0, TO_NEWS_MAX)
    const items = await Promise.all(slugs.map(async (slug): Promise<NewsItem | null> => {
      try {
        const res = await fetch(`https://www.timeout.com/fi/helsinki/uutiset/${slug}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-tapahtumat/1.0)' },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return null
        const html = await res.text()
        const title = /<meta property="og:title" content="([^"]+)"/.exec(html)?.[1]
          ?? /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? ''
        const pub = /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1]
          ?? /<meta property="article:published_time" content="([^"]+)"/.exec(html)?.[1] ?? ''
        if (!title || !pub) return null
        return {
          title: title.replace(/\s*[|–]\s*Time Out.*$/i, '').trim(),
          link: `https://www.timeout.com/fi/helsinki/uutiset/${slug}`,
          source: 'Time Out Helsinki',
          pubDate: pub,
        }
      } catch { return null }
    }))
    return items.filter((x): x is NewsItem => x !== null)
  } catch {
    return []
  }
}

export const _fetchNewsUncached = async (): Promise<NewsItem[]> => {
  const month = new Date().getUTCMonth() + 1
  const queries = [...QUERIES, ...(SEASONAL[month] ?? [])]
  const [googleResults, activityResults, openingResults, cityFi, timeOutNews] = await Promise.all([
    Promise.all(queries.map(fetchQuery)),
    Promise.all(ACTIVITY_QUERIES.map(fetchQuery)),
    Promise.all(OPENING_QUERIES.map(fetchQuery)),
    fetchCityFi(),
    fetchTimeOutNews(),
  ])

  const seen = new Set<string>()
  const merged: NewsItem[] = []
  for (const item of googleResults.flat()) {
    if (seen.has(item.link)) continue
    if (!POSITIVE.test(item.title)) continue
    if (NEGATIVE.test(item.title)) continue
    if (OTHER_CITY.test(item.title)) continue
    seen.add(item.link)
    merged.push(item)
  }
  // Tekemisen ja avautumisten kyselyt: ruokasanavaade ei päde ("Uusi yleinen
  // sauna avautuu Merihakaan" ei sisällä ruokasanaa mutta on juuri oikea juttu).
  for (const item of [...activityResults.flat(), ...openingResults.flat()]) {
    if (seen.has(item.link)) continue
    if (NEGATIVE.test(item.title)) continue
    if (OTHER_CITY.test(item.title)) continue
    seen.add(item.link)
    merged.push(item)
  }
  // City.fi ja Time Out ovat jo ruoka-/Helsinki-toimituksia, joten POSITIVE-
  // sanavaadetta ei sovelleta ("BUBS-pop-up Helsingissä" ei sisällä ruokasanaa
  // mutta on juuri oikea juttu). Nimiyhdistäjä on varsinainen portti — ilman
  // nimiosumaa juttu ei näy missään. NEGATIVE ja OTHER_CITY pätevät silti.
  for (const item of [...cityFi, ...timeOutNews]) {
    if (seen.has(item.link)) continue
    if (NEGATIVE.test(item.title)) continue
    if (OTHER_CITY.test(item.title)) continue
    seen.add(item.link)
    merged.push(item)
  }

  // 30 pv riittää: yhdistäjä käyttää tuoreempia (14 pv) nostamiseen, mutta
  // hieman vanhemmat pidetään mukana diagnostiikkaa varten.
  const cutoff = Date.now() - 30 * 24 * 3_600_000
  merged.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
  return merged.filter(i => new Date(i.pubDate).getTime() > cutoff).slice(0, 130)
}

/** Tunnin välimuisti — sama kuin muillakin rikastuksilla. v9: avautumis-
 *  kyselyt (Uutta Helsingissä) mukaan; katto 110 → 130, jottei laajempi haku
 *  syrjäytä ravintola- ja tekemisjuttuja. */
export const fetchRestaurantNews = unstable_cache(_fetchNewsUncached, ['restaurant-news-v9'], {
  revalidate: 3600,
})
