import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { checkSourceHealth } from '@/lib/source-health'

// Admin-napin takana (app/admin) — ajaa lähdeterveyden kanarian KERRAN ja
// lähettää testiviestin, jotta omistaja voi todeta: (1) anomaliahavainto toimii,
// (2) sähköpostiputki toimii. Ei vaadi CRON_SECRETiä — käyttää admin-evästettä,
// joka käyttäjällä jo on. Ajastettu valvonta on erikseen /api/cron/source-health.
export const maxDuration = 60

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'Mitä tänään <onboarding@resend.dev>'
const ALERT_TO = process.env.ALERT_EMAIL || 'timo.heinamaki@broven.fi'

function checkAuth(req: NextRequest): boolean {
  const session = req.cookies.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? Buffer.from(process.env.ADMIN_PASSWORD).toString('base64')
    : null
  return !!expected && session === expected
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Aja kanaria kerran nykydataa vasten (sisältää cold-start-retryn, jottei
  // testinappi näytä väärää poikkeamaa kylmästä deploymentista).
  const start = new Date().toISOString().slice(0, 10)
  const { issues, payload } = await checkSourceHealth(req.nextUrl.origin)
  const total = payload?.total ?? payload?.events?.length ?? 0

  // Lähetä testiviesti (sisältää nykytilan)
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({
      ok: true, emailed: false, total, issues,
      note: 'RESEND_API_KEY puuttuu Vercelistä — hälytysviestit eivät lähde ennen kuin se on asetettu.',
    })
  }

  const healthy = issues.length === 0
  const subject = healthy
    ? '✅ Mitä tänään — lähdekanaria pystyssä'
    : `⚠️ Mitä tänään — kanariatesti havaitsi ${issues.length} poikkeamaa`
  const text =
    `Tämä on admin-paneelista laukaistu kanariatesti.\n\n` +
    `Sähköpostiputki osoitteeseen ${ALERT_TO} TOIMII (sait tämän viestin).\n\n` +
    `Syötteen nykytila (${start}):\n` +
    `• Tapahtumia yhteensä (7 pv): ${total}\n` +
    (healthy
      ? `• Ei poikkeamia — kaikki rakenteellisesti-aina-päällä olevat lähteet kunnossa.\n`
      : `• POIKKEAMAT:\n${issues.map((i) => `   - ${i}`).join('\n')}\n`) +
    `\nJatkossa saat viestin automaattisesti VAIN jos syöte romahtaa.\n` +
    `Automaattinen kanaria: /api/cron/source-health (päivittäin 09:00 UTC).`

  let emailed = false
  let emailError: string | null = null
  try {
    await resend.emails.send({ from: FROM, to: ALERT_TO, subject, text })
    emailed = true
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err)
    console.error('test-alert email failed:', err)
  }

  return NextResponse.json({ ok: true, emailed, emailError, total, issues, to: ALERT_TO })
}
