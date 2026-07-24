import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { checkSourceHealth } from '@/lib/source-health'

// JULKINEN terveysosoite ulkoiselle valvonnalle (UptimeRobot tms.).
// EI autentikointia — paljastaa vain tapahtumamäärän + tilan. Riippumaton
// kaikesta app-puolen valvonnasta: havaitsee katastrofin "kaikki tapahtumat
// kadonneet" vaikka cronit/CRON_SECRET/koko Vercel-puoli olisivat alhaalla.
//
// Kaksi tasoa (UptimeRobotiin kaksi monitoria):
//   /api/health          — KEVYT: onko syöte ylipäätään elossa (LinkedEvents-
//                          runko). Nopea, sopii 5 min pingiin.
//   /api/health?deep=1    — SYVÄ: onko jokin avainlähde (RA/pubivisat/runko)
//                          kuollut hiljaa vaikka runko toimii — se RA/Yöelämä-
//                          tapaus jota kevyt tarkistus ei huomaa. Verdikti
//                          välimuistissa 30 min, joten tiheät pingit ovat halpoja.
export const dynamic = 'force-dynamic'

// Tänään Helsingissä aina kymmeniä LinkedEvents-tapahtumia → alle 5 = romahdus.
const MIN_EVENTS = 5

// Syvätarkistuksen verdikti (per-lähde-poikkeamat) välimuistissa 30 min.
const getDeepIssues = unstable_cache(
  async (origin: string) => (await checkSourceHealth(origin)).issues,
  ['health-deep-issues'],
  { revalidate: 1800 },
)

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin

  // SYVÄ: per-lähde-terveys (cachetettu). checkSourceHealth sisältää
  // cold-start-uudelleenyrityksen → ei väärää 503:a kylmästä deploymentista.
  if (req.nextUrl.searchParams.get('deep') === '1') {
    try {
      const issues = await getDeepIssues(origin)
      if (issues.length === 0) return NextResponse.json({ status: 'ok', mode: 'deep' })
      return NextResponse.json({ status: 'down', mode: 'deep', issues }, { status: 503 })
    } catch (err) {
      return NextResponse.json({ status: 'down', mode: 'deep', reason: (err as Error).message }, { status: 503 })
    }
  }

  // KEVYT: pelkkä runko (quick=1). Nopea; sopii tiheään pingiin.
  try {
    const today = new Date().toISOString().slice(0, 10)
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
