import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { PubVisa, fetchVisas, PUBIVISAT_SOURCE_URL } from '@/lib/pubivisat'
import { helsinkiISO } from '@/lib/helsinki-time'

function generateOccurrences(visa: PubVisa, startDate: Date, endDate: Date, index: number): Event[] {
  const events: Event[] = []
  const cursor = new Date(startDate)
  cursor.setHours(0, 0, 0, 0)

  // Skip address cleanup — keep as-is, strip postal code for street display
  const streetAddress = visa.address.replace(/,?\s*\d{5}\s*\w+\s*$/, '').trim()

  while (cursor <= endDate) {
    if (cursor.getDay() === visa.weekday) {
      // Quiz times are Helsinki wall-clock — build the ISO with the Helsinki
      // offset so a 20.00 quiz doesn't shift to 23.00 on a UTC server.
      const y = cursor.getFullYear()
      const mo = cursor.getMonth() + 1
      const d = cursor.getDate()
      const startIso = helsinkiISO(y, mo, d, visa.hour, visa.minute)
      const endIso = new Date(new Date(startIso).getTime() + 2 * 60 * 60 * 1000).toISOString() // 2h default

      const dateKey = `${y}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}`
      events.push({
        id: `pubivisa-${index}-${dateKey}`,
        title: `Tietovisa – ${visa.name}`,
        shortDescription: `Viikoittainen tietovisa ${visa.name}ssa`,
        description: `Viikoittainen tietovisa. Lähde: pubivisat.fi`,
        startTime: startIso,
        endTime: endIso,
        location: {
          name: visa.name,
          streetAddress,
          city: 'Helsinki',
        },
        image: null,
        isFree: true,
        price: null,
        ticketUrl: null,
        infoUrl: PUBIVISAT_SOURCE_URL,
        categories: ['Tietovisa', 'Pubivisa', 'Baari'],
        source: 'linked-events',
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return events
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  try {
    const visas = await fetchVisas()
    const startDate = new Date(start)
    const endDate = new Date(end)
    endDate.setHours(23, 59, 59, 999)

    const events: Event[] = visas.flatMap((v, i) =>
      generateOccurrences(v, startDate, endDate, i)
    )
    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    return NextResponse.json({ events, total: events.length, source: 'pubivisat' })
  } catch (err) {
    console.error('pubivisat error:', err)
    return NextResponse.json({ events: [] })
  }
}
