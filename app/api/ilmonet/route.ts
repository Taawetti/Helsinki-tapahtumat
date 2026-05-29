import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const ILMONET_KEY = process.env.ILMONET_API_KEY

interface IlmonetLocation {
  name?: string
  address?: string
  city?: string
}

interface IlmonetCourse {
  id: string
  code?: string
  name: string
  firstSession: string   // "YYYY-MM-DD HH:MM"
  firstSessionEND?: string
  lastSession?: string
  price?: string
  description?: string
  link?: string
  image?: string
  locations?: IlmonetLocation[]
}

function parseCourseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  const parts = dateStr.split(' ')
  return parts.length === 2
    ? `${parts[0]}T${parts[1]}:00`
    : `${parts[0]}T09:00:00`
}

function toIlmonetDate(iso: string): string {
  return iso.replace(/-/g, '').slice(2, 8) // "2026-05-29" → "260529"
}

export async function GET(req: NextRequest) {
  if (!ILMONET_KEY) {
    return NextResponse.json({ events: [] })
  }

  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword') || ''

  const params = new URLSearchParams({
    dat: `${toIlmonetDate(start)}_${toIlmonetDate(end)}`,
    limit: '50',
    offset: '0',
    lang: 'fi',
    desc: '1',  // include description
    lnk: '1',  // include link
    img: '1',  // include image
  })
  if (keyword) params.set('txt', keyword)

  try {
    const res = await fetch(
      `https://api.ilmonet.fi/pksilmoapix/v1/course/search?${params}`,
      {
        headers: { apikey: ILMONET_KEY },
        next: { revalidate: 3600, tags: ['events'] },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return NextResponse.json({ events: [] })

    const data = await res.json()
    const courses: IlmonetCourse[] = data.courselist?.course ?? []

    const events: Event[] = courses.map((c): Event => {
      const loc = c.locations?.[0]
      return {
        id: `ilmonet-${c.id}`,
        title: c.name,
        shortDescription: c.description?.slice(0, 200) ?? '',
        description: c.description ?? '',
        startTime: parseCourseDate(c.firstSession),
        endTime: c.lastSession ? parseCourseDate(c.lastSession) : null,
        location: loc
          ? {
              name: loc.name ?? '',
              streetAddress: loc.address ?? '',
              city: loc.city ?? 'Helsinki',
            }
          : null,
        image: c.image ?? null,
        isFree: !c.price || c.price === '0',
        price: c.price && c.price !== '0' ? c.price : null,
        ticketUrl: c.link ?? null,
        infoUrl: c.link ?? null,
        categories: ['Kurssi', 'Koulutus'],
        source: 'linked-events',
      }
    })

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Ilmonet error:', err)
    return NextResponse.json({ events: [] })
  }
}
