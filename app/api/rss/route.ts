import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// RSS-syötteet Helsinki-tapahtumapaikoilta ja kulttuurilaitoksilta
const RSS_FEEDS = [
  // Isommat kulttuuripaikat
  { url: 'https://www.korjaamo.fi/feed/', city: 'Helsinki', venueName: 'Kulttuuritehdas Korjaamo' },
  { url: 'https://tavastiaklubi.fi/feed/', city: 'Helsinki', venueName: 'Tavastia' },
  { url: 'https://circushelsinki.fi/feed/', city: 'Helsinki', venueName: 'Circus Helsinki' },
  { url: 'https://harjula.fi/feed/', city: 'Helsinki', venueName: 'Harjula' },
  { url: 'https://www.rocks.fi/tapahtumat/feed/', city: 'Helsinki', venueName: 'On the Rocks' },
  { url: 'https://www.dubrovnik.fi/feed/', city: 'Helsinki', venueName: 'Dubrovnik' },
  { url: 'https://hkt.fi/feed/', city: 'Helsinki', venueName: 'Helsingin Kaupunginteatteri' },
  { url: 'https://oopperabaletti.fi/feed/', city: 'Helsinki', venueName: 'Kansallisooppera' },
  // Baarit ja live-musiikkipaikat
  { url: 'https://storyville.fi/feed/', city: 'Helsinki', venueName: 'Storyville' },
  { url: 'https://williamk.fi/feed/', city: 'Helsinki', venueName: 'William K' },
  { url: 'https://glivelab.fi/feed/', city: 'Helsinki', venueName: 'G Livelab Helsinki' },
  { url: 'https://lepakkomies.fi/feed/', city: 'Helsinki', venueName: 'Lepakkomies' },
  { url: 'https://baarikarpanen.fi/feed/', city: 'Helsinki', venueName: 'Baarikärpänen' },
  { url: 'https://telakkahelsinki.fi/feed/', city: 'Helsinki', venueName: 'Telakka' },
  { url: 'https://www.tiivistamo.fi/feed/', city: 'Helsinki', venueName: 'Tiivistämö' },
  { url: 'https://kaivohuone.fi/feed/', city: 'Helsinki', venueName: 'Kaivohuone' },
  { url: 'https://kaiku.fi/feed/', city: 'Helsinki', venueName: 'Kaiku' },
  // Suomenlinna – maailmanperintökohde
  { url: 'https://suomenlinna.fi/tapahtumat/feed/', city: 'Helsinki', venueName: 'Suomenlinna' },
  // Teatterit
  { url: 'https://www.ryhmateatteri.fi/feed/', city: 'Helsinki', venueName: 'Ryhmäteatteri' },
  { url: 'https://www.svenskateatern.fi/feed/', city: 'Helsinki', venueName: 'Svenska Teatern' },
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

// Kaivaa oikean tapahtumapäivän RSS-kentän tekstisisällöstä.
// Useilla tapahtumapaikoilla (esim. On the Rocks) pubDate = syötteen
// uusintahetki, ei tapahtuman päivä. Oikea päivä on kuvauksessa
// muodossa "Ke 24.6.2026" tai "24.6.2026".
function extractEventDate(rawContent: string, pubDate: string): string {
  const text = rawContent.replace(/<[^>]+>/g, ' ')
  const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!dateMatch) return parseDate(pubDate)

  const day = parseInt(dateMatch[1], 10)
  const month = parseInt(dateMatch[2], 10)
  const year = parseInt(dateMatch[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2024 || year > 2030) {
    return parseDate(pubDate)
  }

  const timeMatch = text.match(/klo\s+(\d{1,2})[.:](\d{2})/)
  const hour = timeMatch ? parseInt(timeMatch[1], 10) : 19
  const minute = timeMatch ? parseInt(timeMatch[2], 10) : 0
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+03:00`
}

function parseRssItems(xml: string, city: string, feedUrl: string, venueName?: string): Event[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? []
  return items.slice(0, 15).map((item, i) => {
    const title = extractText(item, 'title') || 'Tapahtuma'
    const fullContent = extractText(item, 'content:encoded') || extractText(item, 'description')
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
      startTime: extractEventDate(fullContent, pubDate),
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
