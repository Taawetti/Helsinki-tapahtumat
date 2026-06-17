import { NextRequest, NextResponse } from 'next/server'

const BREVO_API = 'https://api.brevo.com/v3'

interface EventSubmission {
  nimi: string
  kuvaus?: string
  pvm: string
  aika?: string
  paikka: string
  hinta?: string
  kategoria?: string
  linkki?: string
  email: string
}

export async function POST(req: NextRequest) {
  const body: EventSubmission = await req.json().catch(() => null)

  if (!body?.nimi || !body?.pvm || !body?.paikka || !body?.email) {
    return NextResponse.json({ error: 'Pakolliset kentät puuttuvat' }, { status: 400 })
  }

  const apiKey = process.env.BREVO_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL
  const senderEmail = process.env.BREVO_SENDER_EMAIL

  if (!apiKey || !adminEmail || !senderEmail) {
    console.error('[submit-event] Ympäristömuuttujat puuttuvat')
    return NextResponse.json({ error: 'Palvelinvirhe' }, { status: 500 })
  }

  const htmlContent = `
    <h2 style="font-family:sans-serif;color:#a855f7;">Uusi tapahtumaehdotus — helsinki-tapahtumat</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%;max-width:600px;">
      <tr><td style="padding:6px 12px;font-weight:bold;color:#666;width:140px;">Nimi</td><td style="padding:6px 12px;">${body.nimi}</td></tr>
      <tr style="background:#f9f9f9;"><td style="padding:6px 12px;font-weight:bold;color:#666;">Päivämäärä</td><td style="padding:6px 12px;">${body.pvm}${body.aika ? ' klo ' + body.aika : ''}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;color:#666;">Paikka</td><td style="padding:6px 12px;">${body.paikka}</td></tr>
      ${body.hinta ? `<tr style="background:#f9f9f9;"><td style="padding:6px 12px;font-weight:bold;color:#666;">Hinta</td><td style="padding:6px 12px;">${body.hinta}</td></tr>` : ''}
      ${body.kategoria ? `<tr><td style="padding:6px 12px;font-weight:bold;color:#666;">Kategoria</td><td style="padding:6px 12px;">${body.kategoria}</td></tr>` : ''}
      ${body.linkki ? `<tr style="background:#f9f9f9;"><td style="padding:6px 12px;font-weight:bold;color:#666;">Linkki</td><td style="padding:6px 12px;"><a href="${body.linkki}">${body.linkki}</a></td></tr>` : ''}
      ${body.kuvaus ? `<tr><td style="padding:6px 12px;font-weight:bold;color:#666;">Kuvaus</td><td style="padding:6px 12px;">${body.kuvaus}</td></tr>` : ''}
      <tr style="background:#f9f9f9;"><td style="padding:6px 12px;font-weight:bold;color:#666;">Järjestäjä</td><td style="padding:6px 12px;"><a href="mailto:${body.email}">${body.email}</a></td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:12px;color:#999;margin-top:24px;">Lähetetty osoitteesta helsinki-tapahtumat.fi</p>
  `

  try {
    const res = await fetch(`${BREVO_API}/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Helsinki Tapahtumat', email: senderEmail },
        to: [{ email: adminEmail }],
        replyTo: { email: body.email },
        subject: `Tapahtumaehdotus: ${body.nimi} — ${body.pvm}`,
        htmlContent,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[submit-event] Brevo error:', res.status, err)
      return NextResponse.json({ error: 'Lähetys epäonnistui' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[submit-event] fetch error:', err)
    return NextResponse.json({ error: 'Palvelinvirhe' }, { status: 500 })
  }
}
