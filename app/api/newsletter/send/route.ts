import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'Mitä tänään <onboarding@resend.dev>'
const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface LinkedEvent {
  id: string
  name?: { fi?: string; en?: string }
  short_description?: { fi?: string; en?: string }
  description?: { fi?: string; en?: string }
  images?: { url: string }[]
  start_time?: string
  location?: { name?: { fi?: string } }
  is_free?: boolean
  info_url?: { fi?: string }
  offers?: { is_free: boolean; price?: Record<string, string> }[]
}

function title(ev: LinkedEvent) { return ev.name?.fi || ev.name?.en || 'Tapahtuma' }
function desc(ev: LinkedEvent) { return ev.short_description?.fi || ev.short_description?.en || '' }
function img(ev: LinkedEvent) { return ev.images?.[0]?.url || '' }
function isFree(ev: LinkedEvent) { return ev.is_free || ev.offers?.[0]?.is_free || false }
function url(ev: LinkedEvent) { return ev.info_url?.fi || `${BASE}?ref=newsletter` }
function venue(ev: LinkedEvent) { return ev.location?.name?.fi || '' }

function finnishDate(iso: string): string {
  const d = new Date(iso)
  const days = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la']
  const months = ['tam', 'hel', 'maa', 'huh', 'tou', 'kes', 'hei', 'elo', 'syy', 'lok', 'mar', 'jou']
  return `${days[d.getDay()]} ${d.getDate()}. ${months[d.getMonth()]} klo ${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}`
}

async function fetchWeekendEvents(): Promise<LinkedEvent[]> {
  const now = new Date()
  const day = now.getDay()
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
    `https://api.hel.fi/linkedevents/v1/event/?format=json&start=${start}&end=${end}&division=helsinki&language=fi&page_size=30&sort=start_time`,
    { signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.data ?? []) as LinkedEvent[]
}

function heroBlock(ev: LinkedEvent): string {
  const heroImg = img(ev)
  const evTitle = title(ev)
  const evDesc = desc(ev)
  const evDate = ev.start_time ? finnishDate(ev.start_time) : ''
  const evVenue = venue(ev)
  const evUrl = url(ev)
  const free = isFree(ev)

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)">
  ${heroImg ? `<tr><td style="padding:0">
    <a href="${evUrl}"><img src="${heroImg}" width="100%" alt="${evTitle}" style="display:block;width:100%;height:220px;object-fit:cover" /></a>
  </td></tr>` : ''}
  <tr><td style="background:rgba(107,118,255,0.08);padding:24px">
    ${free ? '<p style="margin:0 0 8px;font-size:11px;font-weight:800;color:#34d399;letter-spacing:0.1em;text-transform:uppercase">🎁 ILMAINEN</p>' : ''}
    <p style="margin:0 0 6px;font-size:22px;font-weight:900;color:#ffffff;line-height:1.2;letter-spacing:-0.02em">${evTitle}</p>
    <p style="margin:0 0 12px;font-size:13px;color:rgba(255,255,255,0.4)">${evDate}${evVenue ? ` · ${evVenue}` : ''}</p>
    ${evDesc ? `<p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6">${evDesc.slice(0,180)}${evDesc.length > 180 ? '…' : ''}</p>` : ''}
    <a href="${evUrl}" style="display:inline-block;background:linear-gradient(135deg,#6b76ff,#5059e6);color:#ffffff;font-size:13px;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:10px">
      Lue lisää →
    </a>
  </td></tr>
</table>`
}

function smallCard(ev: LinkedEvent): string {
  const evImg = img(ev)
  const evTitle = title(ev)
  const evDate = ev.start_time ? finnishDate(ev.start_time) : ''
  const evVenue = venue(ev)
  const evUrl = url(ev)
  const free = isFree(ev)

  return `
<tr>
  <td style="padding:0 0 12px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden">
      <tr>
        ${evImg ? `<td width="80" style="padding:0;vertical-align:top">
          <a href="${evUrl}"><img src="${evImg}" width="80" height="68" alt="${evTitle}" style="display:block;width:80px;height:68px;object-fit:cover;border-radius:12px 0 0 12px" /></a>
        </td>` : ''}
        <td style="padding:12px 14px;vertical-align:middle">
          ${free ? '<span style="font-size:10px;font-weight:800;color:#34d399;letter-spacing:0.08em">ILMAINEN · </span>' : ''}
          <a href="${evUrl}" style="text-decoration:none">
            <p style="margin:0 0 3px;font-size:14px;font-weight:800;color:#ffffff;line-height:1.3">${evTitle}</p>
          </a>
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35)">${evDate}${evVenue ? ` · ${evVenue}` : ''}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`
}

function freeSection(events: LinkedEvent[]): string {
  if (events.length === 0) return ''
  return `
<tr><td style="padding:8px 0 16px">
  <p style="margin:0 0 12px;font-size:11px;font-weight:800;color:rgba(255,255,255,0.25);letter-spacing:0.2em;text-transform:uppercase">🎁 Ilmaiset tällä viikonlopulla</p>
  <table width="100%" cellpadding="0" cellspacing="0">
    ${events.map(ev => {
      const evDate = ev.start_time ? finnishDate(ev.start_time) : ''
      const evVenue = venue(ev)
      const evUrl = url(ev)
      return `<tr><td style="padding:0 0 8px">
        <a href="${evUrl}" style="text-decoration:none;display:block;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;padding:10px 14px">
          <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#ffffff">${title(ev)}</p>
          <p style="margin:0;font-size:11px;color:rgba(52,211,153,0.6)">${evDate}${evVenue ? ` · ${evVenue}` : ''}</p>
        </a>
      </td></tr>`
    }).join('')}
  </table>
</td></tr>`
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: subs, error } = await supabase
    .from('newsletter_subscribers')
    .select('email, unsubscribe_token')
    .eq('active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  const allEvents = await fetchWeekendEvents().catch(() => [] as LinkedEvent[])

  // Hero: prefer events with image and description
  const withImage = allEvents.filter(e => img(e))
  const hero = withImage[0] ?? allEvents[0]
  if (!hero) return NextResponse.json({ sent: 0, reason: 'no events' })

  // Next 4 picks (exclude hero)
  const remaining = allEvents.filter(e => e.id !== hero.id)
  const picks = remaining.slice(0, 4)

  // Free events not already shown (up to 3)
  const shownIds = new Set([hero.id, ...picks.map(e => e.id)])
  const freeEvents = remaining
    .filter(e => isFree(e) && !shownIds.has(e.id))
    .slice(0, 3)

  const now = new Date()
  const months = ['tammikuuta','helmikuuta','maaliskuuta','huhtikuuta','toukokuuta','kesäkuuta',
    'heinäkuuta','elokuuta','syyskuuta','lokakuuta','marraskuuta','joulukuuta']
  const dateStr = `${now.getDate()}. ${months[now.getMonth()]} ${now.getFullYear()}`

  let sent = 0
  const errors: string[] = []

  for (const sub of subs) {
    const unsubUrl = `${BASE}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`

    const html = `<!DOCTYPE html>
<html lang="fi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Viikonlopun tapahtumat Helsingissä</title></head>
<body style="margin:0;padding:0;background:#0a0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b0f">
<tr><td align="center" style="padding:32px 16px 0">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

  <!-- Header -->
  <tr><td style="padding:0 0 28px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06)">
    <a href="${BASE}" style="text-decoration:none">
      <p style="margin:0;font-size:34px;font-weight:900;color:#ffffff;letter-spacing:-0.04em">Mitä tänään</p>
      <p style="margin:6px 0 0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.25);letter-spacing:0.3em;text-transform:uppercase">Helsinki · ${dateStr}</p>
    </a>
  </td></tr>

  <!-- Intro -->
  <tr><td style="padding:24px 0 20px">
    <p style="margin:0 0 6px;font-size:20px;font-weight:800;color:#ffffff">Viikonlopun parhaat 🎉</p>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.4);line-height:1.6">
      Valitsimme tämän viikonlopun kiinnostavimmat tapahtumat Helsingissä — yksi nosto jota ei kannata ohittaa, ja muutama muu vaihtoehto.
    </p>
  </td></tr>

  <!-- Hero -->
  <tr><td>${heroBlock(hero)}</td></tr>

  <!-- Picks header -->
  ${picks.length > 0 ? `<tr><td style="padding:4px 0 14px">
    <p style="margin:0;font-size:11px;font-weight:800;color:rgba(255,255,255,0.25);letter-spacing:0.2em;text-transform:uppercase">Muuta viikonlopulla</p>
  </td></tr>` : ''}

  <!-- Small cards -->
  ${picks.length > 0 ? `<tr><td><table width="100%" cellpadding="0" cellspacing="0">${picks.map(smallCard).join('')}</table></td></tr>` : ''}

  <!-- Free section -->
  ${freeSection(freeEvents)}

  <!-- CTA -->
  <tr><td style="padding:20px 0 32px;text-align:center">
    <a href="${BASE}?ref=newsletter" style="display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);font-size:13px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">
      Katso kaikki tapahtumat →
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 0 40px;border-top:1px solid rgba(255,255,255,0.06)">
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);text-align:center;line-height:1.8">
      Saat tämän viestin, koska olet tilannut Mitä tänään -uutiskirjeen.<br>
      <a href="${unsubUrl}" style="color:rgba(255,255,255,0.3);text-decoration:underline">Peru tilaus</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`

    const result = await resend.emails.send({
      from: FROM,
      to: sub.email,
      subject: `Viikonlopun tapahtumat Helsingissä — ${dateStr}`,
      html,
    }).catch(err => ({ error: err.message as string }))

    if ('error' in result && result.error) {
      errors.push(`${sub.email}: ${result.error}`)
    } else {
      sent++
    }
  }

  return NextResponse.json({ sent, total: subs.length, errors: errors.slice(0, 5) })
}
