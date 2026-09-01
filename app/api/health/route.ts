import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { checkSourceHealth } from '@/lib/source-health'
import { supabaseAdmin } from '@/lib/supabase'
import { paataTerveystila, type TerveysTila } from '@/lib/health-hysteresis'

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
//                          tapaus jota kevyt tarkistus ei huomaa. OK-verdikti
//                          välimuistissa 30 min (tiheät pingit halpoja), mutta
//                          DOWN-verdikti varmistetaan aina yhdellä tuoreella
//                          ajolla ennen 503:ta — muuten minuutin lähtöhäiriö
//                          paisuisi välimuistin vuoksi puolituntiseksi hälytykseksi.
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
      let issues = await getDeepIssues(origin)
      if (issues.length > 0) {
        // Välimuistitettu "down" voi olla vanha (jopa 30 min) ja perustua
        // hetkelliseen lähteen pätkäisyyn → varmista yhdellä tuoreella ajolla
        // ennen 503:ta.
        issues = (await checkSourceHealth(origin)).issues
      }

      // ── HYSTEREESI (lib/health-hysteresis): max yksi tilanvaihto / vrk.
      // Ilman tätä verdikti heilui DOWN↔UP välimuistiarpajaisten mukana ja
      // UptimeRobot lähetti postin joka heilahduksesta (omistaja 1.9.2026).
      // Tila on Supabasessa, jotta se on sama joka palvelinyksikölle. Jos
      // taulua ei ole (SQL ajamatta) tai kanta ei vastaa, palataan suoraan
      // mittaukseen — vahti ei saa pimentyä oman muistinsa vian takia.
      const mitattuAlhaalla = issues.length > 0
      let naytettava: 'ok' | 'down' = mitattuAlhaalla ? 'down' : 'ok'
      let vaimennettu = false
      if (supabaseAdmin) {
        try {
          const { data: rivi, error: lukuvirhe } = await supabaseAdmin
            .from('health_state')
            .select('status, changed_at, ok_since')
            .eq('id', 'deep')
            .maybeSingle()
          if (!lukuvirhe) {
            const tallennettu: TerveysTila | null = rivi
              ? {
                  status: rivi.status as 'ok' | 'down',
                  changedAt: new Date(rivi.changed_at as string).getTime(),
                  okSince: rivi.ok_since ? new Date(rivi.ok_since as string).getTime() : null,
                }
              : null
            const paatos = paataTerveystila(tallennettu, mitattuAlhaalla, Date.now())
            naytettava = paatos.tila.status
            vaimennettu = paatos.vaimennettu
            await supabaseAdmin.from('health_state').upsert({
              id: 'deep',
              status: paatos.tila.status,
              changed_at: new Date(paatos.tila.changedAt).toISOString(),
              ok_since: paatos.tila.okSince ? new Date(paatos.tila.okSince).toISOString() : null,
              issues,
              updated_at: new Date().toISOString(),
            })
          }
        } catch { /* kanta ei vastaa → suora mittaus riittää */ }
      }

      if (naytettava === 'ok') {
        // measured kertoo vianetsijälle jos tuore mittaus erosi verdiktistä
        return NextResponse.json({ status: 'ok', mode: 'deep', ...(vaimennettu ? { measured: 'down', issues } : {}) })
      }
      return NextResponse.json(
        { status: 'down', mode: 'deep', issues, ...(vaimennettu ? { measured: 'ok', recovering: true } : {}) },
        { status: 503 },
      )
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
