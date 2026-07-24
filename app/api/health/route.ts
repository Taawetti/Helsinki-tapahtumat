import { NextRequest, NextResponse } from 'next/server'

// JULKINEN terveysosoite ulkoiselle valvonnalle (UptimeRobot tms.).
// EI autentikointia — paljastaa vain tapahtumamäärän + tilan. Tämä on
// tarkoituksella riippumaton kaikesta app-puolen valvonnasta: se havaitsee
// katastrofin "kaikki tapahtumat kadonneet" vaikka cronit, CRON_SECRET tai
// koko Vercel-puolen sisäinen valvonta olisivat alhaalla. Ulkoinen monitori
// pingaa tätä ja hälyttää jos status != 200.
export const dynamic = 'force-dynamic'

// Tänään on Helsingissä aina kymmeniä LinkedEvents-tapahtumia → alle 5 = syöte
// on romahtanut (backbone alhaalla / API rikki).
const MIN_EVENTS = 5

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin
    const today = new Date().toISOString().slice(0, 10)
    // quick=1 → vain LinkedEvents-runko (nopea); riittää kertomaan onko syöte elossa
    const res = await fetch(`${origin}/api/events?quick=1&start=${today}&end=${today}`, {
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      return NextResponse.json({ status: 'down', reason: `events HTTP ${res.status}` }, { status: 503 })
    }
    const data = await res.json()
    const count = Array.isArray(data.events) ? data.events.length : 0
    if (count < MIN_EVENTS) {
      return NextResponse.json({ status: 'down', count, reason: 'feed empty' }, { status: 503 })
    }
    return NextResponse.json({ status: 'ok', count })
  } catch (err) {
    return NextResponse.json({ status: 'down', reason: (err as Error).message }, { status: 503 })
  }
}
