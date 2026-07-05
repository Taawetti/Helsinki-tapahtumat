import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'Mitä tänään <newsletter@mitatanaan.fi>'
const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface LinkedEvent {
  id: string
  name?: { fi?: string; en?: string }
  short_description?: { fi?: string; en?: string }
  images?: { url: string }[]
  start_time?: string
  location?: { name?: { fi?: string } }
  is_free?: boolean
  info_url?: { fi?: string }
  offers?: { is_free: boolean; price?: Record<string, string> }[]
}

function formatFinnishDate(iso: string): string {
  const d = new Date(iso)
  const days = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la']
  const months = ['tam', 'hel', 'maa', 'huh', 'tou', 'kes', 'hei', 'elo', 'syy', 'lok', 'mar', 'jou']
  return `${days[d.getDay()]} ${d.getDate()}. ${months[d.getMonth()]} klo ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`
}

async function fetchWeekendEvents(): Promise<LinkedEvent[]> {
  const now = new Date()
  // Next Friday UTC+3: today is some weekday, push to Friday
  const day = now.getDay() // 0=Sun … 6=Sat
  const daysToFri = day === 5 ? 0 : day === 6 ? 6 : day === 0 ? 5 : 5 - day
  const fri = new Date(now)
  fri.setDate(fri.getDate() + daysToFri)
  fri.setHours(0, 0, 0, 0)
  const sun = new Date(fri)
  sun.setDate(sun.getDate() + 2)
  sun.setHours(23, 59, 59, 0)

  const start = fri.toISOString().slice(0, 10)
  const end = sun.toISOString().slice(0, 10)

  const res = await fetch(
    `https://api.hel.fi/linkedevents/v1/event/?format=json&start=${start}&end=${end}&division=helsinki&language=fi&page_size=8&sort=start_time`,
    { signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.data ?? []) as LinkedEvent[]
}

function buildEventCard(ev: LinkedEvent): string {
  const name = ev.name?.fi || ev.name?.en || 'Tapahtuma'
  const desc = ev.short_description?.fi || ev.short_description?.en || ''
  const date = ev.start_time ? formatFinnishDate(ev.start_time) : ''
  const venue = ev.location?.name?.fi || ''
  const img = ev.images?.[0]?.url || ''
  const url = ev.info_url?.fi || `${BASE}?ref=newsletter`
  const free = ev.is_free || ev.offers?.[0]?.is_free

  return `
  <tr>
    <td style="padding:0 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden">
        <tr>
          ${img ? `<td width="100" style="padding:0;vertical-align:top">
            <img src="${img}" width="100" height="80" alt="${name}" style="display:block;object-fit:cover;width:100px;height:80px;border-radius:14px 0 0 14px" />
          </td>` : ''}
          <td style="padding:14px 16px;vertical-align:top">
            <p style="margin:0 0 4px;font-size:15px;font-weight:800;color:#ffffff;line-height:1.3">${name}</p>
            <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.4)">${date}${venue ? ` · ${venue}` : ''}${free ? ' · <span style="color:#34d399">Ilmainen</span>' : ''}</p>
            ${desc ? `<p style="margin:0 0 10px;font-size:12px;color:rgba(255,255,255,0.5);line-height:1.5">${desc.slice(0, 100)}${desc.length > 100 ? '…' : ''}</p>` : ''}
            <a href="${url}" style="display:inline-block;font-size:11px;font-weight:800;color:#6b76ff;text-decoration:none;letter-spacing:0.02em">LUE LISÄÄ →</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch subscribers
  const { data: subs, error } = await supabase
    .from('newsletter_subscribers')
    .select('email, unsubscribe_token')
    .eq('active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  // Fetch events
  const events = await fetchWeekendEvents().catch(() => [] as LinkedEvent[])

  const eventCards = events.map(buildEventCard).join('')

  // Now date in Finnish
  const now = new Date()
  const months = ['tammikuuta', 'helmikuuta', 'maaliskuuta', 'huhtikuuta', 'toukokuuta', 'kesäkuuta',
    'heinäkuuta', 'elokuuta', 'syyskuuta', 'lokakuuta', 'marraskuuta', 'joulukuuta']
  const dateStr = `${now.getDate()}. ${months[now.getMonth()]} ${now.getFullYear()}`

  let sent = 0
  const errors: string[] = []

  // Send to each subscriber (batch via Resend's batch API if available)
  for (const sub of subs) {
    const unsubUrl = `${BASE}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`
    const html = `
<!DOCTYPE html>
<html lang="fi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Viikonlopun tapahtumat Helsingissä</title>
</head>
<body style="margin:0;padding:0;background:#0a0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b0f">
    <tr><td align="center" style="padding:32px 16px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <!-- Header -->
        <tr>
          <td style="padding:0 0 28px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06)">
            <a href="${BASE}" style="text-decoration:none">
              <p style="margin:0;font-size:32px;font-weight:900;color:#ffffff;letter-spacing:-0.04em">Mitä tänään</p>
              <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.25);letter-spacing:0.3em;text-transform:uppercase">Helsinki · Tapahtumat · ${dateStr}</p>
            </a>
          </td>
        </tr>
        <!-- Teaser -->
        <tr>
          <td style="padding:24px 0 20px">
            <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.25">Viikonlopun parhaat tapahtumat 🎉</p>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.4);line-height:1.6">
              ${events.length > 0 ? `Löysimme ${events.length} tapahtumaa tänä viikonloppuna Helsingissä. Ota talteen suosikit!` : 'Viikonlopun Helsinki-tapahtumat koottuina sinulle.'}
            </p>
          </td>
        </tr>
        <!-- Events -->
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${eventCards || '<tr><td style="padding:20px 0;color:rgba(255,255,255,0.3);font-size:13px">Ei tapahtumia saatavilla tällä hetkellä.</td></tr>'}
            </table>
          </td>
        </tr>
        <!-- CTA -->
        <tr>
          <td style="padding:8px 0 32px;text-align:center">
            <a href="${BASE}?ref=newsletter" style="display:inline-block;background:linear-gradient(150deg,#6b76ff,#5059e6);color:#ffffff;font-size:14px;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:12px">
              Katso kaikki tapahtumat →
            </a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 0 40px;border-top:1px solid rgba(255,255,255,0.06)">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);text-align:center;line-height:1.8">
              Saat tämän viestin, koska olet tilannut Mitä tänään -uutiskirjeen.<br>
              <a href="${unsubUrl}" style="color:rgba(255,255,255,0.3);text-decoration:underline">Peru tilaus</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

    const result = await resend.emails.send({
      from: FROM,
      to: sub.email,
      subject: `Viikonlopun tapahtumat Helsingissä — ${dateStr}`,
      html,
    }).catch(err => ({ error: err.message }))

    if ('error' in result && result.error) {
      errors.push(`${sub.email}: ${result.error}`)
    } else {
      sent++
    }
  }

  return NextResponse.json({ sent, total: subs.length, errors: errors.slice(0, 5) })
}
