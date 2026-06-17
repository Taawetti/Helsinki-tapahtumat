import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

interface SportsDBEvent {
  idEvent: string
  strEvent: string
  strHomeTeam: string
  strAwayTeam: string
  dateEvent: string          // "YYYY-MM-DD"
  strTime: string            // "HH:MM:SS+00:00" or "HH:MM:SS"
  strHomeTeamBadge?: string
  strAwayTeamBadge?: string
  strVenue?: string
  strCity?: string
  strThumb?: string
  strResult?: string
}

const HARTWALL_ARENA = {
  name: 'Veikkaus Arena',
  streetAddress: 'Arenankuja 1',
  city: 'Helsinki',
  lat: 60.2052,
  lon: 24.9286,
}

const HELSINKI_TEAMS = ['hifk', 'jokerit']

function isHelsinkiTeam(team: string): boolean {
  const t = team.toLowerCase()
  return HELSINKI_TEAMS.some((ht) => t.includes(ht))
}

function buildStartTime(dateEvent: string, strTime: string): string {
  // Strip timezone suffix (e.g. "+00:00") — treat as UTC approximation
  const timePart = strTime ? strTime.replace(/[+-]\d{2}:\d{2}$/, '').trim() : ''
  const time = timePart || '18:00:00'
  return `${dateEvent}T${time}`
}

function toEvent(e: SportsDBEvent): Event {
  return {
    id: `liiga-${e.idEvent}`,
    title: e.strEvent,
    shortDescription: 'Jääkiekko · Liiga — Hartwall Arena',
    description: '',
    startTime: buildStartTime(e.dateEvent, e.strTime),
    endTime: null,
    location: HARTWALL_ARENA,
    image: e.strThumb || e.strHomeTeamBadge || null,
    isFree: false,
    price: null,
    ticketUrl: 'https://www.veikkausarena.fi/',
    infoUrl: 'https://www.liiga.fi/',
    categories: ['Jääkiekko', 'Urheilu', 'Liiga'],
    source: 'linked-events' as const,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  try {
    // Query current and upcoming season — Liiga 2025-26 ends spring 2026, 2026-27 starts fall 2026
    const currentYear = new Date().getFullYear()
    const seasons = [`${currentYear}-${currentYear + 1}`, `${currentYear - 1}-${currentYear}`]
    const seasonResults = await Promise.allSettled(
      seasons.map((s) =>
        fetch(`https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4931&s=${s}`, {
          next: { revalidate: 86400, tags: ['events'] },
          signal: AbortSignal.timeout(8000),
        }).then((r) => r.json())
      )
    )

    const raw: SportsDBEvent[] = seasonResults
      .flatMap((r) => (r.status === 'fulfilled' ? (r.value.events ?? []) : []))

    const startTs = new Date(start).getTime()
    const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

    const events = raw
      .filter((e) => {
        // Must involve a Helsinki team
        if (!isHelsinkiTeam(e.strHomeTeam) && !isHelsinkiTeam(e.strAwayTeam)) return false
        // Only home games — Helsinki team must be the home team
        if (!isHelsinkiTeam(e.strHomeTeam)) return false
        // Date range filter
        if (!e.dateEvent) return false
        const ts = new Date(buildStartTime(e.dateEvent, e.strTime)).getTime()
        return ts >= startTs && ts <= endTs
      })
      .map(toEvent)

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Liiga API error:', err)
    return NextResponse.json({ events: [] })
  }
}
