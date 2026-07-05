import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin as supabase } from '@/lib/supabase'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'Mitä tänään <newsletter@mitatanaan.fi>'
const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Virheellinen sähköpostiosoite' }, { status: 400 })
  }

  if (!supabase) return NextResponse.json({ error: 'Palvelinvirhe' }, { status: 500 })

  const clean = email.toLowerCase().trim()

  // Upsert subscriber — if already exists, re-activate
  const { data, error } = await supabase
    .from('newsletter_subscribers')
    .upsert({ email: clean, active: true }, { onConflict: 'email' })
    .select('unsubscribe_token')
    .single()

  if (error) {
    console.error('[newsletter] supabase error:', error.message)
    return NextResponse.json({ error: 'Tilaus epäonnistui' }, { status: 500 })
  }

  // Send welcome email
  const unsubUrl = `${BASE}/api/newsletter/unsubscribe?token=${data?.unsubscribe_token}`
  await resend.emails.send({
    from: FROM,
    to: clean,
    subject: 'Tervetuloa — Mitä tänään -uutiskirje tilattu! 🎉',
    html: `
<!DOCTYPE html>
<html lang="fi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <div style="text-align:center;margin-bottom:32px">
      <h1 style="font-size:40px;font-weight:900;color:#fff;letter-spacing:-0.04em;margin:0">Mitä tänään</h1>
      <p style="color:rgba(255,255,255,0.3);font-size:12px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;margin:8px 0 0">Helsinki · Tapahtumat</p>
    </div>
    <div style="background:rgba(107,118,255,0.08);border:1px solid rgba(107,118,255,0.2);border-radius:16px;padding:32px">
      <p style="color:#fff;font-size:18px;font-weight:800;margin:0 0 12px">Hienoa, olet mukana! 🎉</p>
      <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 20px">
        Saat joka <strong style="color:rgba(255,255,255,0.8)">perjantai</strong> sähköpostiisi viikonlopun parhaat tapahtumat Helsingissä —
        keikkojen, näyttelyiden, ravintoloiden ja kaiken muun hyvän suhteen.
      </p>
      <a href="${BASE}" style="display:inline-block;background:linear-gradient(150deg,#6b76ff,#5059e6);color:#fff;font-size:14px;font-weight:800;text-decoration:none;padding:12px 24px;border-radius:12px">
        Avaa sovellus →
      </a>
    </div>
    <p style="color:rgba(255,255,255,0.2);font-size:11px;text-align:center;margin-top:24px">
      <a href="${unsubUrl}" style="color:rgba(255,255,255,0.25);text-decoration:underline">Peru tilaus</a>
    </p>
  </div>
</body>
</html>`,
  }).catch(err => console.warn('[newsletter] welcome email failed:', err.message))

  return NextResponse.json({ ok: true })
}
