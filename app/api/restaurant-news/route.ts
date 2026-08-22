import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

export interface NewsItem {
  title: string
  link: string
  source: string
  pubDate: string
}

// Hakuja LAAJENNETTU 4 → 12, koska juttuja ei enää lueta vain listana vaan ne
// yhdistetään ravintoloihin nimen perusteella (lib/restaurant-news-match).
// Osumia syntyy vain kun juttu mainitsee paikan nimeltä, joten kandidaatteja
// tarvitaan paljon enemmän. Mitattu: 4 kyselyä → 10 juttua → 3 osumaa;
// 12 kyselyä → 721 juttua → 79 ravintolaosumaa.
const QUERIES = [
  'Helsinki+uusi+ravintola',                           // new restaurant openings
  'Helsinki+ravintola+avasi',
  'Helsinki+ravintola+avautuu',
  'Helsinki+uusi+viinibaari',
  'Helsinki+uusi+kahvila',
  'Helsinki+baari+avasi',
  'Helsinki+bistro+uusi',
  'ravintola+Kallio+uusi',
  'Helsinki+pop-up+ravintola',
  'Helsinki+ravintola+Michelin+OR+arvostelu+OR+palkinto', // awards & reviews
  'Helsinki+ravintola+paras+OR+äänesti+OR+lista',      // rankings & voting
  'Helsinki+baari+OR+kahvila+uusi+OR+paras',           // bars & cafés
]

// Must contain at least one of these to be relevant
const POSITIVE = /ravintola|baari|kahvila|ruoka|kokki|menu|lounas|ruokapaikka|Michelin|bistro|gastropub/i

// Filter out titles clearly not helpful for choosing where to eat.
//
// KORJATTU 8/2026 — kaksi sanaa tappoi juuri ne jutut joita osio on olemassa
// näyttämään. Mitattu Google Newsin tuloksista:
//   'yrittäj' pudotti  "…tilalle avautui uusien YRITTÄJIEN Rogue Rouge"
//                      "TELLERIN yrittäjät avaavat Helsinkiin uuden viinibaarin"
//   'lento'   pudotti  "Helsinki-Vantaan LENTOasemalle avautui fiinimpi ravintola"
// Ravintolauutisessa "yrittäjä" on positiivinen sana, ei varoitusmerkki.
// Samaan aikaan läpi pääsi "Café Ursula PURETAAN" ja Tampereelle avautuva
// ravintola, joten purkaminen ja muut kaupungit on lisätty.
const NEGATIVE = /konkurssi|sulkee|suljettu|sulkeminen|lopettaa|puretaan|purkaa|puretaanko|kaaos|rakennustyö|lakko|työtaistelu|sakko|tuomio|velka|ryöst|huijaus/i

// Muualla kuin pääkaupunkiseudulla tapahtuva ei kuulu Helsingin ravintolasivulle.
// Mitattu läpivuotanut tapaus: "palkittu Bistro Bardot avautuu TAMPEREELLA".
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
    return []
  }
}

const _fetchNews = async (): Promise<NewsItem[]> => {
  const results = await Promise.all(QUERIES.map(fetchQuery))

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

  // Katko nostettu 10 → 60. Kymmenen riitti artikkelilistalle, mutta osumia
  // etsitään nyt nimen perusteella: mitä useampi juttu, sitä useampi paikka
  // saa syyn näkyä. Näytettävä artikkelilista leikataan vasta komponentissa.
  const cutoff = Date.now() - 30 * 24 * 3_600_000
  merged.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
  return merged.filter(i => new Date(i.pubDate).getTime() > cutoff).slice(0, 60)
}

const fetchNewsCached = unstable_cache(_fetchNews, ['restaurant-news-v5'], { revalidate: 3600 })

export async function GET() {
  const items = await fetchNewsCached()
  return NextResponse.json({ items })
}
