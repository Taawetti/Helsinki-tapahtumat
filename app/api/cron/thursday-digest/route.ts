import { NextRequest, NextResponse } from 'next/server'
import { sendToSubscribers } from '@/lib/webpush'
import { supabaseAdmin } from '@/lib/supabase'
import { Event } from '@/lib/types'
import { pickWeeklyDigest, nextWeekendRange } from '@/lib/weekly-digest'

// Torstain pakka -viikkodigesti — torstaisin klo 16 Suomen aikaa (vercel.json).
// Lähettää pushin kaikille tilaajille ja ohjaa /pakka-sivulle, jossa sama
// kuratointi (lib/weekly-digest.ts) renderöityy korteiksi.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  // Tuleva viikonloppu (pe–su) Helsingin ajassa — torstaista huominen on pe.
  const { fri, sun } = nextWeekendRange()

  // Upstream failure must NOT masquerade as "no events" — return 5xx so the
  // Vercel cron log shows the run as failed instead of a silent skip.
  let events: Event[]
  try {
    const origin = req.nextUrl.origin
    const params = new URLSearchParams({ start: fri, end: sun, page: '1', municipality: 'helsinki' })
    const res = await fetch(`${origin}/api/events?${params}`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) {
      return NextResponse.json({ error: `events fetch failed: HTTP ${res.status}` }, { status: 502 })
    }
    const data = await res.json()
    events = (data.events ?? []) as Event[]
  } catch (err) {
    return NextResponse.json({ error: `events fetch failed: ${(err as Error).message}` }, { status: 502 })
  }

  const picks = pickWeeklyDigest(events)
  if (picks.length === 0) {
    return NextResponse.json({ sent: 0, reason: 'no digest picks for the weekend' })
  }

  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  const others = picks.length - 1
  const body = others > 0
    ? `${picks[0].event.title} — ja ${others} muuta valittua viikonloppuun`
    : `${picks[0].event.title} — valittu viikonloppuun`
  const { sent, staleEndpoints } = await sendToSubscribers(subs, () =>
    // tag erottaa viikkodigestin aamu-/iltapusheista, ettei se korvaa niitä
    JSON.stringify({ title: '🎁 Torstain pakka on täällä!', body, url: '/pakka', tag: 'thursday-digest' })
  )

  // Siivoa vanhentuneet tilaukset (410/404) kuten evening-push.
  if (staleEndpoints.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return NextResponse.json({ sent, staleRemoved: staleEndpoints.length })
}
