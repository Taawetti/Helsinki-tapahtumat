import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { supabase, isSupabaseConfigured, DbRecurringEvent } from '@/lib/supabase'
import { RecurringDef, fetchSuperterassiProgram } from '@/lib/superterassi'
import { helsinkiISO } from '@/lib/helsinki-time'

// ── Recurring / weekly events ────────────────────────────────────────────────
// Viikoittain toistuvat tapahtumat joita ei ole missään API:ssa.
//
// LÄHTEET (ei enää kovakoodattua tapahtumadataa — se rapautui haamuiksi):
//   • Superterassin kesäohjelma  → skrapataan live-sivulta (lib/superterassi.ts)
//   • Supabase recurring_events  → valinnainen admin-täydennys (nyt tyhjä)
//
// Pubivisat tulevat /api/pubivisat:sta (pubivisat.fi, ~98 pubia), venue-keikat
// /api/scraped:sta, ja klubit Resident Advisorista — ei täältä.
//
// weekday: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat

function generateEvents(def: RecurringDef, startDate: Date, endDate: Date): Event[] {
  const events: Event[] = []
  const cursor = new Date(startDate)
  cursor.setHours(0, 0, 0, 0)

  // Advance to first matching weekday
  const jsWeekday = def.weekday === 0 ? 0 : def.weekday // JS: 0=Sun,1=Mon,...,6=Sat
  while (cursor <= endDate) {
    if (cursor.getDay() === jsWeekday) {
      const y = cursor.getFullYear()
      const mo = cursor.getMonth() + 1 // 1-indexed
      const d = cursor.getDate()
      const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`

      // Kausiraja (ensisijainen, sivulta luettu) tai activeMonths (varasuoja) —
      // ei generoida kumman tahansa ulkopuolelle → ei off-season-haamuja.
      const inSeason =
        (!def.seasonStart || dateStr >= def.seasonStart) &&
        (!def.seasonEnd || dateStr <= def.seasonEnd)
      const inMonths = !def.activeMonths || def.activeMonths.includes(mo)

      if (inSeason && inMonths) {
        // DST-tietoinen Helsinki-aika (+03:00 kesä / +02:00 talvi).
        const startTime = helsinkiISO(y, mo, d, def.startHour, def.startMinute)
        const endMs = new Date(startTime).getTime() + def.durationMinutes * 60 * 1000
        const endTime = new Date(endMs).toISOString()
        const dateCompact = dateStr.replace(/-/g, '')

        events.push({
          id: `recurring-${def.id}-${dateCompact}`,
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

  // Base: Superterassin kesäohjelma live-sivulta. Jos sivu ei julkaise ohjelmaa
  // (talvi / sivu alhaalla), palautuu [] → ei tapahtumia, ei haamuja.
  const scraped = await fetchSuperterassiProgram()
  let defs: RecurringDef[] = scraped

  // Supabase recurring_events voi täydentää tai ylikirjoittaa (admin-hallinta).
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('recurring_events')
        .select('*')
        .eq('active', true)
      if (!error && data && data.length > 0) {
        // Merge: DB-merkinnät ylikirjoittavat saman-ID:n, muut säilyvät
        const dbDefs = (data as DbRecurringEvent[]).map(fromDb)
        const dbIds = new Set(dbDefs.map((d) => d.id))
        defs = [...scraped.filter((d) => !dbIds.has(d.id)), ...dbDefs]
      }
    } catch {
      // Supabase unavailable — käytä pelkkää skrapattua ohjelmaa
    }
  }

  const events: Event[] = defs.flatMap((def) =>
    generateEvents(def, startDate, endDate)
  )

  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  return NextResponse.json({ events })
}

function fromDb(row: DbRecurringEvent): RecurringDef {
  return {
    id: row.id,
    title: row.title,
    shortDescription: row.short_description,
    venue: row.venue,
    address: row.address,
    lat: row.lat ?? undefined,
    lon: row.lon ?? undefined,
    weekday: row.weekday as RecurringDef['weekday'],
    startHour: row.start_hour,
    startMinute: row.start_minute,
    durationMinutes: row.duration_minutes,
    isFree: row.is_free,
    price: row.price ?? undefined,
    ticketUrl: row.ticket_url ?? undefined,
    infoUrl: row.info_url ?? undefined,
    categories: row.categories,
    activeMonths: row.active_months ?? undefined,
  }
}
