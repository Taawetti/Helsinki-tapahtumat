import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// Static festival data — update annually when dates are confirmed
// Sources: festival official sites, Songkick, MyHelsinki

interface FestivalDef {
  id: string
  name: string
  shortName: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD (inclusive)
  time: string       // local start time HH:MM
  venueName: string
  address: string
  city: string
  ticketUrl: string
  infoUrl: string
  image: string | null
  categories: string[]
  isFree: boolean
  description: string
}

const FESTIVALS_2026: FestivalDef[] = [
  {
    id: 'hcf-2026',
    name: 'Helsinki City Festival 2026',
    shortName: 'Helsinki City Festival',
    startDate: '2026-06-12',
    endDate: '2026-06-14',
    time: '12:00',
    venueName: 'Nordis / Helsingin Jäähalli',
    address: 'Nordenskiöldinkatu 11-13',
    city: 'Helsinki',
    ticketUrl: 'https://www.helsinkicityfestival.fi/en/',
    infoUrl: 'https://www.helsinkicityfestival.fi/en/',
    image: null,
    categories: ['Musiikki', 'Festivaali'],
    isFree: false,
    description: 'Kansainvälinen musiikkifestivaali Nordis-alueella. 50+ artistia kolmena päivänä.',
  },
  {
    id: 'tuska-2026',
    name: 'Tuska Open Air Metal Festival 2026',
    shortName: 'Tuska',
    startDate: '2026-06-26',
    endDate: '2026-06-28',
    time: '12:00',
    venueName: 'Suvilahti',
    address: 'Koksikatu 4',
    city: 'Helsinki',
    ticketUrl: 'https://tuska.fi/en/tickets/',
    infoUrl: 'https://tuska.fi/en/',
    image: null,
    categories: ['Musiikki', 'Festivaali', 'Metal'],
    isFree: false,
    description: 'Pohjoismaiden suurin metallifestivaali Suvilahden entisellä voimalaitosalueella.',
  },
  {
    id: 'flow-2026',
    name: 'Flow Festival 2026',
    shortName: 'Flow Festival',
    startDate: '2026-08-14',
    endDate: '2026-08-16',
    time: '12:00',
    venueName: 'Suvilahti',
    address: 'Koksikatu 4',
    city: 'Helsinki',
    ticketUrl: 'https://www.flowfestival.com/en/tickets/',
    infoUrl: 'https://www.flowfestival.com/en/',
    image: null,
    categories: ['Musiikki', 'Festivaali'],
    isFree: false,
    description: 'Premium musiikki- ja taidefestivaali Suvilahden teollisuusalueella. 90 000 kävijää kolmena päivänä.',
  },
  {
    id: 'juhlaviikot-2026',
    name: 'Helsingin juhlaviikot 2026',
    shortName: 'Juhlaviikot',
    startDate: '2026-08-18',
    endDate: '2026-09-05',
    time: '10:00',
    venueName: 'Useita paikkoja',
    address: '',
    city: 'Helsinki',
    ticketUrl: 'https://helsinkifestival.fi/en/',
    infoUrl: 'https://helsinkifestival.fi/en/',
    image: null,
    categories: ['Kulttuuri', 'Festivaali', 'Taide', 'Musiikki'],
    isFree: false,
    description: 'Helsingin suurin kulttuurifestivaali — konsertit, teatteri, tanssi ja taide ympäri kaupunkia.',
  },
  {
    id: 'taiteidentyo-2026',
    name: 'Taiteiden yö 2026',
    shortName: 'Taiteiden yö',
    startDate: '2026-08-20',
    endDate: '2026-08-20',
    time: '18:00',
    venueName: 'Koko Helsinki',
    address: '',
    city: 'Helsinki',
    ticketUrl: 'https://helsinkifestival.fi/taiteidenyo/en/',
    infoUrl: 'https://helsinkifestival.fi/taiteidenyo/en/',
    image: null,
    categories: ['Kulttuuri', 'Taide', 'Ilmainen'],
    isFree: true,
    description: 'Yöllinen taidetapahtuma — museot, galleriat, teatterit ja kaupunkitila avautuvat ilmaiseksi yöhön asti.',
  },
]

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

  const events: Event[] = []

  for (const fest of FESTIVALS_2026) {
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
        source: 'linked-events',
      })
    }
  }

  return NextResponse.json({ events })
}
