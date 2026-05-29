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

function parseRssItems(xml: string, city: string, feedUrl: string, venueName?: string): Event[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? []
  return items.slice(0, 15).map((item, i) => {
    const title = extractText(item, 'title') || 'Tapahtuma'
    const description = extractText(item, 'description').replace(/<[^>]+>/g, '').slice(0, 200)
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
      startTime: parseDate(pubDate),
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
