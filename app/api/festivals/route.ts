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
  {
    id: 'suuretoluet-2026',
    name: 'Suuret Oluet – Pienet Panimot Helsinki 2026',
    shortName: 'Suuret Oluet Helsinki',
    startDate: '2026-07-12',
    endDate: '2026-07-27',
    time: '12:00',
    venueName: 'Rautatientori',
    address: 'Rautatientori',
    city: 'Helsinki',
    ticketUrl: 'https://www.tiketti.fi/',
    infoUrl: 'https://suuretoluet.fi/helsinki/',
    image: null,
    categories: ['Olut', 'Ruoka & juoma', 'Festivaali', 'Ulkoilma'],
    isFree: false,
    description: 'Suomen suurin craft beer -tapahtuma Rautatientorilla. 50+ pientä panimoa, 200+ olutta.',
  },
  {
    id: 'kallioblockparty-2026',
    name: 'Kallio Block Party 2026',
    shortName: 'Kallio Block Party',
    startDate: '2026-08-01',
    endDate: '2026-08-01',
    time: '12:00',
    venueName: 'Kallio, Helsinki',
    address: 'Fleminginkatu / Helsinginkatu',
    city: 'Helsinki',
    ticketUrl: 'https://www.kallioblockparty.org/',
    infoUrl: 'https://www.kallioblockparty.org/',
    image: null,
    categories: ['Musiikki', 'Festivaali', 'Ilmainen', 'Ulkoilma'],
    isFree: true,
    description: 'Kallion vuotuinen ilmainen katufestivaali — live-musiikkia, ruokaa ja yhteisöllisyyttä koko päivä.',
  },
  {
    id: 'wejazz-2026',
    name: 'We Jazz Festival 2026',
    shortName: 'We Jazz',
    startDate: '2026-11-05',
    endDate: '2026-11-08',
    time: '18:00',
    venueName: 'Useita paikkoja',
    address: '',
    city: 'Helsinki',
    ticketUrl: 'https://wejazz.fi/',
    infoUrl: 'https://wejazz.fi/',
    image: null,
    categories: ['Jazz', 'Musiikki', 'Festivaali'],
    isFree: false,
    description: 'Helsingin kansainvälinen jazzfestivaali — esiintymispaikkoja ympäri kaupunkia.',
  },
  {
    id: 'slush-2026',
    name: 'Slush 2026',
    shortName: 'Slush',
    startDate: '2026-11-18',
    endDate: '2026-11-19',
    time: '09:00',
    venueName: 'Messukeskus',
    address: 'Messuaukio 1',
    city: 'Helsinki',
    ticketUrl: 'https://slush.org/',
    infoUrl: 'https://slush.org/',
    image: null,
    categories: ['Teknologia', 'Startup', 'Verkostoituminen'],
    isFree: false,
    description: 'Maailman johtava startup- ja teknologiatapahtuma. 13 000+ kävijää Messukeskuksessa.',
  },
  {
    id: 'pride-2026',
    name: 'Helsinki Pride 2026',
    shortName: 'Helsinki Pride',
    startDate: '2026-06-27',
    endDate: '2026-07-04',
    time: '10:00',
    venueName: 'Esplanadi / Kauppatori',
    address: 'Esplanadi',
    city: 'Helsinki',
    ticketUrl: 'https://www.helsinkipride.fi/',
    infoUrl: 'https://www.helsinkipride.fi/',
    image: null,
    categories: ['Pride', 'Kulttuuri', 'Festivaali', 'Ilmainen'],
    isFree: true,
    description: 'Suomen suurin Pride-viikko — paraati, tapahtumat ja juhla LGBTQ+-yhteisölle ja kaikille.',
  },
  {
    id: 'tasteofhelsinki-2026',
    name: 'Taste of Helsinki 2026',
    shortName: 'Taste of Helsinki',
    startDate: '2026-06-04',
    endDate: '2026-06-07',
    time: '12:00',
    venueName: 'Kansalaistori',
    address: 'Kansalaistori 1',
    city: 'Helsinki',
    ticketUrl: 'https://www.tasteofhelsinki.fi/',
    infoUrl: 'https://www.tasteofhelsinki.fi/',
    image: null,
    categories: ['Ruoka & juoma', 'Festivaali', 'Ravintola'],
    isFree: false,
    description: 'Helsingin parhaiden ravintoloiden pop-up festivaali Kansalaistorilla — huippukeittiöt, ruokamestariat ja juomatarjoilu.',
  },
  {
    id: 'marathon-2026',
    name: 'Björn Borg Helsinki Marathon 2026',
    shortName: 'Helsinki Marathon',
    startDate: '2026-08-22',
    endDate: '2026-08-23',
    time: '08:00',
    venueName: 'Olympiastadion',
    address: 'Paavo Nurmen tie 1',
    city: 'Helsinki',
    ticketUrl: 'https://www.helsinkimarathon.fi/',
    infoUrl: 'https://www.helsinkimarathon.fi/',
    image: null,
    categories: ['Urheilu', 'Juoksu', 'Marathon'],
    isFree: false,
    description: 'Helsingin suuri maratonpäivä — maraton, puolimaraton ja 10 km kaupungin halki.',
  },
  {
    id: 'designweek-2026',
    name: 'Helsinki Design Week 2026',
    shortName: 'Design Week',
    startDate: '2026-09-04',
    endDate: '2026-09-13',
    time: '10:00',
    venueName: 'Useita paikkoja',
    address: '',
    city: 'Helsinki',
    ticketUrl: 'https://www.helsinkidesignweek.com/',
    infoUrl: 'https://www.helsinkidesignweek.com/',
    image: null,
    categories: ['Muotoilu', 'Kulttuuri', 'Festivaali', 'Taide'],
    isFree: false,
    description: 'Pohjoismaiden suurin muotoilufestivaali — 200+ tapahtumaa, näyttelyt, studiovisitit ja seminaarit ympäri Helsinkiä.',
  },
  {
    id: 'riff-2026',
    name: 'Rakkautta & Anarkiaa – Helsinki International Film Festival 2026',
    shortName: 'R&A HIFF',
    startDate: '2026-09-10',
    endDate: '2026-09-20',
    time: '12:00',
    venueName: 'Useita elokuvateattereita',
    address: '',
    city: 'Helsinki',
    ticketUrl: 'https://hiff.fi/',
    infoUrl: 'https://hiff.fi/',
    image: null,
    categories: ['Elokuva', 'Festivaali', 'Kulttuuri'],
    isFree: false,
    description: 'Pohjoismaiden suurin elokuvafestivaali — 200+ elokuvaa, vierailevat ohjaajat ja maailmanensi-illat Helsingissä.',
  },
  {
    id: 'balticcircle-2026',
    name: 'Baltic Circle 2026',
    shortName: 'Baltic Circle',
    startDate: '2026-11-12',
    endDate: '2026-11-15',
    time: '18:00',
    venueName: 'Useita paikkoja',
    address: '',
    city: 'Helsinki',
    ticketUrl: 'https://balticcircle.fi/',
    infoUrl: 'https://balticcircle.fi/',
    image: null,
    categories: ['Teatteri', 'Esittävä taide', 'Festivaali', 'Kulttuuri'],
    isFree: false,
    description: 'Kansainvälinen esittävän taiteen festivaali — kokeellista teatteria, tanssia ja performansseja Helsingissä.',
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
