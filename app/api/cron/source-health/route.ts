import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { detectSourceAnomalies, type CanaryPayload } from '@/lib/source-health'

// Päivittäinen lähdeterveyden kanaria — hälyttää jos tapahtumasyöte romahtaa
// (ks. lib/source-health.ts). Ajastus: vercel.json.
export const maxDuration = 60

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'Mitä tänään <onboarding@resend.dev>'
const ALERT_TO = process.env.ALERT_EMAIL || 'timo.heinamaki@broven.fi'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const headerOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  // Testilaukaisin: ?test=<CRON_SECRET> selaimessa (Bearer-headeria ei voi
  // asettaa selaimesta). Lähettää "kanaria pystyssä" -vahvistuksen → näet heti
  // toimiiko sähköpostiputki. Kertakäyttöinen omistajan itsetesti.
  const testParam = req.nextUrl.searchParams.get('test')
  const isSelfTest = !!process.env.CRON_SECRET && testParam === process.env.CRON_SECRET

  if (!headerOk && !isSelfTest) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isSelfTest) {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ test: true, emailed: false, error: 'RESEND_API_KEY puuttuu' }, { status: 500 })
    }
    try {
      await resend.emails.send({
        from: FROM,
        to: ALERT_TO,
        subject: '✅ Mitä tänään — lähdekanaria pystyssä',
        text:
          `Tämä on kertaluontoinen itsetesti: lähdeterveyden kanaria toimii ja ` +
          `sähköpostiputki osoitteeseen ${ALERT_TO} on kunnossa.\n\n` +
          `Jatkossa saat viestin VAIN jos tapahtumasyöte romahtaa ` +
          `(esim. jokin lähde kuolee hiljaa). Ei uutisia = hyvä uutinen.\n\n` +
          `Kanaria: /api/cron/source-health (päivittäin 09:00 UTC).`,
      })
      return NextResponse.json({ test: true, emailed: true, to: ALERT_TO })
    } catch (err) {
      console.error('source-health self-test email failed:', err)
      return NextResponse.json({ test: true, emailed: false, error: String(err) }, { status: 500 })
    }
  }

  const start = new Date().toISOString().slice(0, 10)
  const end = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10)

  // Hae koko aggregaatti 7 pv:n ikkunassa. Haun epäonnistuminen ON hälytys
  // (koko sovellus alhaalla) — detectSourceAnomalies(null) hoitaa sen.
  let payload: CanaryPayload | null = null
  try {
    const origin = req.nextUrl.origin
    const params = new URLSearchParams({ start, end, page: '1', municipality: 'helsinki' })
    const res = await fetch(`${origin}/api/events?${params}`, { signal: AbortSignal.timeout(45000) })
    if (res.ok) payload = (await res.json()) as CanaryPayload
    else console.error(`source-health: /api/events HTTP ${res.status}`)
  } catch (err) {
    console.error('source-health: /api/events fetch failed:', (err as Error).message)
  }

  const issues = detectSourceAnomalies(payload)

  if (issues.length === 0) {
    return NextResponse.json({ ok: true, total: payload?.total ?? null })
  }

  // Poikkeama havaittu → hälytä sähköpostilla.
  const subject = `⚠️ Mitä tänään — lähdehälytys (${issues.length})`
  const text =
    `Tapahtumasyötteessä havaittiin ${issues.length} poikkeama(a) (${start}):\n\n` +
    issues.map((i) => `• ${i}`).join('\n') +
    `\n\nTarkista admin → Lähteet sekä Vercel-lokit.\n` +
    `Automaattinen kanaria: /api/cron/source-health`

  let emailed = false
  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({ from: FROM, to: ALERT_TO, subject, text })
      emailed = true
    } catch (err) {
      console.error('source-health: alert email failed:', err)
    }
  }
  console.error('SOURCE-HEALTH ALERT:', issues.join(' | '))

  // Jos hälytys meni perille → 200 (kanaria toimi). Jos EI (avain puuttuu tai
  // lähetys kaatui) → 5xx, jotta menetetty hälytys näkyy Vercelin cron-lokissa.
  return NextResponse.json({ alerted: true, emailed, issues }, { status: emailed ? 200 : 500 })
}
