import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

// ── Recurring / weekly events ────────────────────────────────────────────────
// Events that repeat on a fixed weekday but aren't in any API.
// Add entries here for: pub quizzes, weekly jam nights, dance classes, etc.
//
// weekday: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
// activeMonths: omit for year-round; [5,6,7,8] = May–Aug only (1-indexed)

interface RecurringDef {
  id: string
  title: string
  shortDescription: string
  venue: string
  address: string
  lat?: number
  lon?: number
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
  startHour: number
  startMinute: number
  durationMinutes: number
  isFree: boolean
  price?: string
  ticketUrl?: string
  infoUrl?: string
  categories: string[]
  activeMonths?: number[]
}

const RECURRING: RecurringDef[] = [
  // ── Jazz ──────────────────────────────────────────────────────────────────
  {
    id: 'storyville-jazz-thu',
    title: 'Live jazz – Storyville',
    shortDescription: 'Viikoittainen live-jazz Helsingin jazz-klassikossa',
    venue: 'Storyville',
    address: 'Museokatu 8, Helsinki',
    lat: 60.1737, lon: 24.9230,
    weekday: 4, // torstai
    startHour: 21, startMinute: 0,
    durationMinutes: 180,
    isFree: false,
    price: '10–15 €',
    infoUrl: 'https://storyville.fi',
    categories: ['Jazz', 'Live', 'Musiikki', 'Baari'],
  },
  {
    id: 'storyville-jazz-fri',
    title: 'Live jazz – Storyville',
    shortDescription: 'Viikoittainen live-jazz Helsingin jazz-klassikossa',
    venue: 'Storyville',
    address: 'Museokatu 8, Helsinki',
    lat: 60.1737, lon: 24.9230,
    weekday: 5, // perjantai
    startHour: 21, startMinute: 0,
    durationMinutes: 180,
    isFree: false,
    price: '10–15 €',
    infoUrl: 'https://storyville.fi',
    categories: ['Jazz', 'Live', 'Musiikki', 'Baari'],
  },

  // ── Pub / musiikkivisat ───────────────────────────────────────────────────
  // Lisää tähän musavisa-baareita: tarkista päivä ja kellonaika ensin!
  {
    id: 'william-k-visa-wed',
    title: 'Pubivisa – William K',
    shortDescription: 'Viikoittainen pubivisa William K:ssa Kaisaniemessä',
    venue: 'William K',
    address: 'Kaisaniemenkatu 5, Helsinki',
    lat: 60.1706, lon: 24.9476,
    weekday: 3, // keskiviikko
    startHour: 19, startMinute: 0,
    durationMinutes: 120,
    isFree: true,
    infoUrl: 'https://williamk.fi',
    categories: ['Pubivisa', 'Baari'],
  },
  {
    id: 'molly-quiz-tue',
    title: 'Quiz Night – Molly Malones',
    shortDescription: 'Irlantilainen pub quiz Molly Malonesissa',
    venue: 'Molly Malones',
    address: 'Kaisaniemenkatu 1C, Helsinki',
    lat: 60.1706, lon: 24.9465,
    weekday: 2, // tiistai
    startHour: 19, startMinute: 0,
    durationMinutes: 120,
    isFree: true,
    infoUrl: 'https://mollymalones.fi',
    categories: ['Pubivisa', 'Quiz', 'Baari'],
  },

  // ── Tanssit (kesä) ────────────────────────────────────────────────────────
  {
    id: 'forro-toolonlahti-thu',
    title: 'Forró puistossa – Töölönlahti',
    shortDescription: 'Brasilialainen forró-tanssi ulkona Töölönlahdella — sopii aloittelijoille',
    venue: 'Töölönlahden Kesäpuiston tapahtumalava',
    address: 'Töölönlahdenkatu, Helsinki',
    lat: 60.1771, lon: 24.9271,
    weekday: 4, // torstai
    startHour: 15, startMinute: 0,
    durationMinutes: 180,
    isFree: true,
    infoUrl: 'https://forro.fi',
    categories: ['Tanssi', 'Ulkoilma', 'Ilmainen'],
    activeMonths: [6, 7, 8], // kesä–elokuu
  },

  // ── Klubi-illat ───────────────────────────────────────────────────────────
  {
    id: 'dtm-fri',
    title: 'Club Night – DTM Helsinki',
    shortDescription: 'Viikoittainen klubi-ilta DTM:ssä Iso-Robiksella',
    venue: 'DTM Helsinki',
    address: 'Iso Roobertinkatu 28, Helsinki',
    lat: 60.1638, lon: 24.9412,
    weekday: 5, // perjantai
    startHour: 22, startMinute: 0,
    durationMinutes: 300,
    isFree: false,
    price: '5–10 €',
    infoUrl: 'https://dtmhelsinki.fi',
    categories: ['Klubi', 'DJ', 'Yöelämä'],
  },
  {
    id: 'dtm-sat',
    title: 'Club Night – DTM Helsinki',
    shortDescription: 'Viikoittainen klubi-ilta DTM:ssä Iso-Robiksella',
    venue: 'DTM Helsinki',
    address: 'Iso Roobertinkatu 28, Helsinki',
    lat: 60.1638, lon: 24.9412,
    weekday: 6, // lauantai
    startHour: 22, startMinute: 0,
    durationMinutes: 300,
    isFree: false,
    price: '5–10 €',
    infoUrl: 'https://dtmhelsinki.fi',
    categories: ['Klubi', 'DJ', 'Yöelämä'],
  },
]

function toISO(date: Date, hour: number, minute: number): string {
  const d = new Date(date)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function generateEvents(def: RecurringDef, startDate: Date, endDate: Date): Event[] {
  const events: Event[] = []
  const cursor = new Date(startDate)
  cursor.setHours(0, 0, 0, 0)

  // Advance to first matching weekday
  const jsWeekday = def.weekday === 0 ? 0 : def.weekday // JS: 0=Sun,1=Mon,...,6=Sat
  while (cursor <= endDate) {
    if (cursor.getDay() === jsWeekday) {
      const month = cursor.getMonth() + 1 // 1-indexed
      if (!def.activeMonths || def.activeMonths.includes(month)) {
        const startTime = toISO(cursor, def.startHour, def.startMinute)
        const endMs = new Date(startTime).getTime() + def.durationMinutes * 60 * 1000
        const endTime = new Date(endMs).toISOString()
        const dateStr = cursor.toISOString().slice(0, 10).replace(/-/g, '')

        events.push({
          id: `recurring-${def.id}-${dateStr}`,
          title: def.title,
          shortDescription: def.shortDescription,
          description: def.shortDescription,
          startTime,
          endTime,
          location: {
            name: def.venue,
            streetAddress: def.address,
            city: 'Helsinki',
            lat: def.lat,
            lon: def.lon,
          },
          image: null,
          isFree: def.isFree,
          price: def.price ?? null,
          ticketUrl: def.ticketUrl ?? null,
          infoUrl: def.infoUrl ?? null,
          categories: def.categories,
          source: 'linked-events',
        })
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return events
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  const startDate = new Date(start)
  const endDate = new Date(end)
  endDate.setHours(23, 59, 59, 999)

  const events: Event[] = RECURRING.flatMap((def) =>
    generateEvents(def, startDate, endDate)
  )

  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  return NextResponse.json({ events })
}
