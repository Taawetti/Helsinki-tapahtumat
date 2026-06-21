import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { supabase, isSupabaseConfigured, DbFestival } from '@/lib/supabase'
import { FestivalDef, FESTIVALS_STATIC, fromDb } from '@/lib/festivals-data'

function daysBetween(start: string, end: string): string[] {
  const days: string[] = []
  const current = new Date(start)
  const last = new Date(end)
  while (current <= last) {
    days.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  return days
}

function festivalDayNumber(festivalStart: string, day: string): number {
  const start = new Date(festivalStart)
  const current = new Date(day)
  return Math.round((current.getTime() - start.getTime()) / 86400000) + 1
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword')?.toLowerCase() || ''

  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

  // Try Supabase first; fall back to static list if not configured
  let festivals: FestivalDef[] = FESTIVALS_STATIC
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('festivals')
        .select('*')
        .eq('active', true)
      if (!error && data && data.length > 0) {
        festivals = (data as DbFestival[]).map(fromDb)
      }
    } catch {
      // Supabase unavailable — use static fallback
    }
  }

  const events: Event[] = []

  for (const fest of festivals) {
    if (keyword && !fest.name.toLowerCase().includes(keyword) && !fest.shortName.toLowerCase().includes(keyword)) {
      continue
    }

    const festDays = daysBetween(fest.startDate, fest.endDate)
    const totalDays = festDays.length

    for (const day of festDays) {
      const ts = new Date(`${day}T${fest.time}:00`).getTime()
      if (ts < startTs || ts >= endTs) continue

      const dayNum = festivalDayNumber(fest.startDate, day)
      const titleSuffix = totalDays > 1 ? ` (päivä ${dayNum}/${totalDays})` : ''

      events.push({
        id: `festival-${fest.id}-${day}`,
        title: `${fest.shortName}${titleSuffix}`,
        shortDescription: fest.description,
        description: fest.description,
        startTime: `${day}T${fest.time}:00`,
        endTime: null,
        location: {
          name: fest.venueName,
          streetAddress: fest.address,
          city: fest.city,
        },
        image: fest.image,
        isFree: fest.isFree,
        price: null,
        ticketUrl: fest.ticketUrl,
        infoUrl: fest.infoUrl,
        categories: fest.categories,
        source: 'festivals',
      })
    }
  }

  return NextResponse.json({ events })
}
