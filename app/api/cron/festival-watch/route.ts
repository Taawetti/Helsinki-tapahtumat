import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'
import { extractJsonLdEvents } from '@/lib/jsonld-events'

// Festivaalien muutosvahti — korvaa weekly-discover-cronin SERP+AI-ajot.
// Hakee aktiivisten festivaalien kotisivut, vertaa sisällön hashia edelliseen
// ja hälyttää sähköpostilla vain muutoksista. AI-extraktointi/käsintarkistus
// tehdään manuaalisesti muutoksen jälkeen → jatkuva kustannus ~0 €.
export const maxDuration = 120

const UA = 'Mitä tänään festival watch (+https://helsinki-tapahtumat.vercel.app)'
const FROM = process.env.RESEND_FROM_EMAIL || 'Mitä tänään <onboarding@resend.dev>'
const ALERT_TO = process.env.ALERT_EMAIL || 'timo.heinamaki@broven.fi'

// Normalisointi ennen hashia: poistetaan scriptit/tyylit ja volatiili osat
// (CSRF-tokenit, kommentit, whitespace) → vähemmän vääriä hälytyksiä.
function normalizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/nonce="[^"]*"/g, '')
    .replace(/csrf[^"]*"[^"]*"/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  // Vain tulevat/aktiiviset festivaalit joilla on seurattava sivu
  const today = new Date().toISOString().slice(0, 10)
  const { data: festivals, error } = await supabaseAdmin
    .from('festivals')
    .select('id, name, info_url, start_date, end_date')
    .eq('active', true)
    .not('info_url', 'is', null)
    .gte('end_date', today)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const changed: { name: string; url: string; note: string }[] = []
  let checked = 0
  let firstSeen = 0
  const errors: string[] = []

  for (const f of festivals ?? []) {
    if (!f.info_url) continue
    try {
      const res = await fetch(f.info_url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) })
      if (!res.ok) { errors.push(`${f.name}: HTTP ${res.status}`); continue }
      const html = await res.text()
      const hash = createHash('sha256').update(normalizeHtml(html)).digest('hex')

      const { data: prev } = await supabaseAdmin
        .from('festival_watch').select('hash').eq('festival_id', f.id).maybeSingle()

      if (!prev) {
        // Ensimmäinen havainto → baseline, ei hälytystä
        firstSeen++
        await supabaseAdmin.from('festival_watch').upsert({ festival_id: f.id, url: f.info_url, hash })
      } else if (prev.hash !== hash) {
        // MUUutos! Kerää tieto + yritä poimia uudet päivämäärät JSON-LD:stä (ilmainen)
        let note = 'sisältö muuttunut'
        const events = extractJsonLdEvents(html)
        const withDates = events.find(e => e.startDate)
        if (withDates?.startDate) {
          const newStart = withDates.startDate.slice(0, 10)
          if (newStart !== f.start_date) note = `mahdollinen uusi alku: ${newStart} (oli ${f.start_date})`
        }
        changed.push({ name: f.name, url: f.info_url, note })
        await supabaseAdmin.from('festival_watch').upsert({
          festival_id: f.id, url: f.info_url, hash, changed_at: new Date().toISOString(),
        })
      } else {
        await supabaseAdmin.from('festival_watch').update({ checked_at: new Date().toISOString() }).eq('festival_id', f.id)
      }
      checked++
      await new Promise(r => setTimeout(r, 300)) // kohteliaisuus
    } catch (err) {
      errors.push(`${f.name}: ${String(err).slice(0, 80)}`)
    }
  }

  // Hälytä vain muutoksista
  if (changed.length > 0 && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const lines = changed.map(c => `• ${c.name}\n  ${c.note}\n  ${c.url}`).join('\n\n')
      await resend.emails.send({
        from: FROM,
        to: ALERT_TO,
        subject: `Festivaalivahti: ${changed.length} sivua muuttunut`,
        text: `Seuraavien festivaalien sivut ovat muuttuneet:\n\n${lines}\n\nTarkista ja päivitä tarvittaessa (admin → festivaalit, tai aja discover manuaalisesti).`,
      })
    } catch { /* hälytys epäonnistui — ei kriittistä */ }
  }

  return NextResponse.json({
    checked,
    firstSeen,
    changed: changed.map(c => c.name),
    errors: errors.slice(0, 10),
    at: new Date().toISOString(),
  })
}
