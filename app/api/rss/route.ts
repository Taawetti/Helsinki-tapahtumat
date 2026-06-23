import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// RSS-syötteet Helsinki-tapahtumapaikoilta
// Mukana vain syötteet joissa on jäsennettävät tapahtumatiedot (DD.MM.YYYY -päivät sisällössä).
// Poistettu: circushelsinki, harjula, williamk, baarikarpanen, telakka, tiivistamo,
//            kaivohuone, kaiku, svenskateatern (ei vastausta), storyville/lepakkomies/glivelab
//            (vanhentunut data), tavastia/hkt/ooppera/ryhmateatteri/suomenlinna (blogiposts, ei tapahtumasivuja).
// On the Rocks poistettu: nyt katettu api/cron/scrape-venues -cronilla (tarkempi kelloaika).
const RSS_FEEDS = [
  { url: 'https://www.dubrovnik.fi/feed/', city: 'Helsinki', venueName: 'Dubrovnik' },
]

function parseDate(str: string): string {
  try {
    return new Date(str).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function extractText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`))
  return (match?.[1] || match?.[2] || '').trim()
}

// Kaivaa oikean tapahtumapäivän RSS-sisällöstä.
// pubDate = syötteen rakentamisaika (esim. On the Rocks), ei tapahtuman päivä.
// Oikea päivä löytyy content:encoded -tekstistä (DD.MM.YYYY) tai description -kentästä
// (esim. Dubrovnik: "KE 25.11.2026").
function extractEventDate(rawContent: string, pubDate: string, rawDescription?: string): string {
  const text = rawContent.replace(/<[^>]+>/g, ' ')

  // Etsitään päivä content:encoded -tekstistä ensin
  let dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)

  // Fallback: description -kenttä (esim. Dubrovnik laittaa päivän sinne)
  if (!dateMatch && rawDescription) {
    const descText = rawDescription.replace(/<[^>]+>/g, ' ')
    dateMatch = descText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  }

  if (!dateMatch) return parseDate(pubDate)

  const day = parseInt(dateMatch[1], 10)
  const month = parseInt(dateMatch[2], 10)
  const year = parseInt(dateMatch[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2024 || year > 2030) {
    return parseDate(pubDate)
  }

  // Ajanparsinta: "klo 19:00" → "Aikataulu: 19:00" → "19:00 Ovet" → oletus 19:00
  let timeMatch = text.match(/klo\s+(\d{1,2})[.:](\d{2})/)
  if (!timeMatch) timeMatch = text.match(/[Aa]ikataulu:[\s\S]{0,60}?(\d{1,2}):(\d{2})/)
  if (!timeMatch) timeMatch = text.match(/(\d{1,2}):(\d{2})\s+[Oo]vet/)

  const hour = timeMatch ? parseInt(timeMatch[1], 10) : 19
  const minute = timeMatch ? parseInt(timeMatch[2], 10) : 0
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+03:00`
}

function parseRssItems(xml: string, city: string, feedUrl: string, venueName?: string): Event[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? []
  return items.slice(0, 15).map((item, i) => {
    const title = extractText(item, 'title') || 'Tapahtuma'
    const rawDescription = extractText(item, 'description')
    const fullContent = extractText(item, 'content:encoded') || rawDescription
    const description = fullContent.replace(/<[^>]+>/g, '').slice(0, 200)
    const link = extractText(item, 'link') || feedUrl
    const pubDate = extractText(item, 'pubDate') || extractText(item, 'dc:date')
    const image = item.match(/url="([^"]+\.(jpg|jpeg|png|webp))"/i)?.[1]
      || item.match(/<media:content[^>]+url="([^"]+)"/i)?.[1]
      || item.match(/<enclosure[^>]+url="([^"]+\.(jpg|jpeg|png|webp))"/i)?.[1]
      || null

    return {
      id: `rss-${Buffer.from(link).toString('base64').slice(0, 16)}-${i}`,
      title,
      shortDescription: description,
      description,
      startTime: extractEventDate(fullContent, pubDate, rawDescription),
      endTime: null,
      location: { name: venueName || '', streetAddress: '', city },
      image,
      isFree: false,
      price: null,
      ticketUrl: link,
      infoUrl: link,
      categories: ['Kulttuuri'],
      source: 'linked-events' as const,
    }
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]

  const results = await Promise.allSettled(
    RSS_FEEDS.map(({ url, city, venueName }) =>
      fetch(url, { next: { revalidate: 3600, tags: ['events'] }, signal: AbortSignal.timeout(5000) })
        .then((r) => r.text())
        .then((xml) => parseRssItems(xml, city, url, venueName))
    )
  )

  const startTs = new Date(start).getTime()
  const events: Event[] = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((e) => new Date(e.startTime).getTime() >= startTs - 86400000)

  return NextResponse.json({ events })
}
