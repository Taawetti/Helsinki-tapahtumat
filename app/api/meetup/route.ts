import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// Meetup public GraphQL — ei vaadi API-avainta julkisiin ryhmiin
const MEETUP_GQL = 'https://api.meetup.com/gql'

interface MeetupEvent {
  id: string
  title: string
  description?: string
  dateTime: string
  endTime?: string
  eventUrl: string
  imageUrl?: string
  isFree?: boolean
  venue?: {
    name?: string
    address?: string
    city?: string
    lat?: number
    lon?: number
  }
  group?: { name: string }
}

function normalize(raw: MeetupEvent): Event {
  return {
    id: `meetup-${raw.id}`,
    title: raw.title,
    shortDescription: raw.description?.replace(/<[^>]+>/g, '').slice(0, 160) ?? '',
    description: raw.description?.replace(/<[^>]+>/g, '') ?? '',
    startTime: raw.dateTime,
    endTime: raw.endTime ?? null,
    location: raw.venue
      ? {
          name: raw.venue.name ?? '',
          streetAddress: raw.venue.address ?? '',
          city: raw.venue.city ?? 'Helsinki',
          lat: raw.venue.lat,
          lon: raw.venue.lon,
        }
      : null,
    image: raw.imageUrl ?? null,
    isFree: raw.isFree ?? true,
    price: null,
    ticketUrl: raw.eventUrl,
    infoUrl: raw.eventUrl,
    categories: raw.group?.name ? [raw.group.name] : ['Meetup'],
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword') || ''

  const query = `
    query {
      keywordSearch(
        filter: {
          query: "${keyword || 'Helsinki'}"
          lat: 60.1699
          lon: 24.9384
          radius: 30
          startDateRange: "${start}T00:00:00"
          endDateRange: "${end}T23:59:59"
          source: EVENTS
        }
        first: 40
      ) {
        edges {
          node {
            result {
              ... on Event {
                id
                title
                description
                dateTime
                endTime
                eventUrl
                imageUrl
                isFree
                venue { name address city lat lon }
                group { name }
              }
            }
          }
        }
      }
    }
  `

  try {
    const res = await fetch(MEETUP_GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      next: { revalidate: 300, tags: ['events'] },
    })
    if (!res.ok) return NextResponse.json({ events: [] })

    const data = await res.json()
    const edges = data?.data?.keywordSearch?.edges ?? []
    const events: Event[] = edges
      .map((e: { node: { result: MeetupEvent } }) => e.node?.result)
      .filter(Boolean)
      .map(normalize)

    return NextResponse.json({ events })
  } catch {
    return NextResponse.json({ events: [] })
  }
}
