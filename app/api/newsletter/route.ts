import { NextRequest, NextResponse } from 'next/server'

const BREVO_API = 'https://api.brevo.com/v3'

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Virheellinen sähköpostiosoite' }, { status: 400 })
  }

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.error('[newsletter] BREVO_API_KEY puuttuu')
    return NextResponse.json({ error: 'Palvelinvirhe' }, { status: 500 })
  }

  try {
    const res = await fetch(`${BREVO_API}/contacts`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        // updateEnabled: true allows re-subscribing an existing contact
        updateEnabled: true,
        listIds: [parseInt(process.env.BREVO_LIST_ID ?? '2')],
        attributes: {
          SOURCE: 'helsinki-tapahtumat.fi',
        },
      }),
    })

    // 201 = created, 204 = already exists (updated)
    if (res.status === 201 || res.status === 204) {
      return NextResponse.json({ ok: true })
    }

    const body = await res.json().catch(() => ({}))
    console.error('[newsletter] Brevo error:', res.status, body)
    return NextResponse.json({ error: 'Tilaus epäonnistui' }, { status: 500 })
  } catch (err) {
    console.error('[newsletter] fetch error:', err)
    return NextResponse.json({ error: 'Palvelinvirhe' }, { status: 500 })
  }
}
