import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Event } from '@/lib/types'

// Venue-sijaintitiedot — kovakoodattu, ei muutu
const VENUE_LOCATIONS: Record<string, { streetAddress: string; city: string }> = {
  'on-the-rocks': { streetAddress: 'Mikonkatu 15', city: 'Helsinki' },
  tavastia:        { streetAddress: 'Urho Kekkosen katu 4-6', city: 'Helsinki' },
  semifinal:       { streetAddress: 'Urho Kekkosen katu 4-6', city: 'Helsinki' },
  korjaamo:        { streetAddress: 'Töölönkatu 51 b', city: 'Helsinki' },
  kaiku:           { streetAddress: 'Kaikukatu 4', city: 'Helsinki' },
}

export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ events: [] })
  }

  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start

  // Haetaan tapahtumat pyydetyllä aikavälillä (+ 1 päivä buffer yöllisten tapahtumien takia)
  const startTs = new Date(start)
  startTs.setDate(startTs.getDate() - 1)

  const { data, error } = await supabase
    .from('scraped_events')
    .select('*')
    .gte('start_datetime', startTs.toISOString())
    .lte('start_datetime', `${end}T23:59:59+03:00`)
    .order('start_datetime', { ascending: true })

  if (error || !data) {
    return NextResponse.json({ events: [] })
  }

  const events: Event[] = data.map((row) => {
    const loc = VENUE_LOCATIONS[row.venue_id] ?? { streetAddress: '', city: 'Helsinki' }
    return {
      id: row.id,
      title: row.title,
      shortDescription: '',
      description: '',
      startTime: row.start_datetime,
      endTime: null,
      location: {
        name: row.venue_name,
        streetAddress: loc.streetAddress,
        city: loc.city,
      },
      image: row.image_url ?? null,
      isFree: row.is_free,
      price: row.price_info ?? null,
      ticketUrl: row.ticket_url,
      infoUrl: row.ticket_url,
      categories: ['Kulttuuri'],
      source: 'scraped',
    }
  })

  return NextResponse.json({ events })
}
