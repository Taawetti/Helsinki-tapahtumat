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

export const _fetchNewsUncached = async (): Promise<NewsItem[]> => {
  const month = new Date().getUTCMonth() + 1
  const queries = [...QUERIES, ...(SEASONAL[month] ?? [])]
  const results = await Promise.all(queries.map(fetchQuery))

  const seen = new Set<string>()
  const merged: NewsItem[] = []
  for (const item of results.flat()) {
    if (seen.has(item.link)) continue
    if (!POSITIVE.test(item.title)) continue
    if (NEGATIVE.test(item.title)) continue
    if (OTHER_CITY.test(item.title)) continue
    seen.add(item.link)
    merged.push(item)
  }

  // 30 pv riittää: yhdistäjä käyttää tuoreempia (14 pv) nostamiseen, mutta
  // hieman vanhemmat pidetään mukana diagnostiikkaa varten.
  const cutoff = Date.now() - 30 * 24 * 3_600_000
  merged.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
  return merged.filter(i => new Date(i.pubDate).getTime() > cutoff).slice(0, 80)
}

/** Tunnin välimuisti — sama kuin muillakin rikastuksilla. v6: sesonki- ja
 *  tarjouskyselyt mukaan, karuselli poistettu. */
export const fetchRestaurantNews = unstable_cache(_fetchNewsUncached, ['restaurant-news-v6'], {
  revalidate: 3600,
})
