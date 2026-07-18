import { NextRequest, NextResponse } from 'next/server'
import { sendToSubscribers } from '@/lib/webpush'
import { supabaseAdmin } from '@/lib/supabase'
import { Event } from '@/lib/types'
import { nightlifeScore } from '@/lib/nightlife'
import { helsinkiToday } from '@/lib/helsinki-time'

// Evening nightlife digest — Thu/Fri/Sat evenings (see vercel.json).
// Unlike the morning /api/push (LinkedEvents count only), this grounds on the
// full multi-source aggregate so the long-tail nightlife supply is included.
export const maxDuration = 60

// First ranked event whose title or any single category overlaps the user's
// preferred keyword strings (raw Finnish keyword names, comma-separated,
// e.g. "musiikki,klubi") — else the top pick. Two-way per-field containment
// lets pref 'rockmusiikki' match category 'rock' and vice versa.
function pickForUser(ranked: Event[], prefCats: string): Event {
  const prefs = prefCats.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (prefs.length > 0) {
    for (const e of ranked) {
      const fields = [e.title, ...e.categories].map((s) => s.toLowerCase())
      if (prefs.some((p) => fields.some((f) => f.includes(p) || p.includes(f)))) return e
    }
  }
  return ranked[0]
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  // Tonight = today's events still ahead (30 min grace for just-started ones).
  // startAfter is epoch-compared in the events route, so a plain UTC ISO works.
  const today = helsinkiToday()
  const startAfter = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  // Upstream failure must NOT masquerade as "no events tonight" — return 5xx
  // so the Vercel cron log shows the run as failed instead of a silent skip.
  let tonight: Event[]
  try {
    const origin = req.nextUrl.origin
    const params = new URLSearchParams({ start: today, end: today, page: '1', municipality: 'helsinki', startAfter })
    const res = await fetch(`${origin}/api/events?${params}`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) {
      return NextResponse.json({ error: `events fetch failed: HTTP ${res.status}` }, { status: 502 })
    }
    const data = await res.json()
    tonight = (data.events ?? []) as Event[]
  } catch (err) {
    return NextResponse.json({ error: `events fetch failed: ${(err as Error).message}` }, { status: 502 })
  }

  const ranked = tonight
    .map((e) => ({ e, score: nightlifeScore(e) }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.e)

  if (ranked.length === 0) {
    return NextResponse.json({ sent: 0, reason: 'no nightlife events tonight' })
  }

  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, preferred_categories')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  const { sent, staleEndpoints } = await sendToSubscribers(subs, (sub) => {
    const pick = pickForUser(ranked, sub.preferred_categories ?? '')
    const venue = pick.location?.name
    const others = ranked.length - 1
    const body = `${pick.title}${venue ? ` @ ${venue}` : ''}${others > 0 ? ` — ja ${others} muuta menoa illalle` : ''}`
    // tag erottaa iltapushin aamun "Mitä tänään?" -ilmoituksesta,
    // ettei uudempi korvaa sitä; url avaa etusivun (ilta-oletus aktivoituu)
    return JSON.stringify({ title: 'Tänään illalla 🌃', body, url: '/', tag: 'hki-tonight' })
  })

  if (staleEndpoints.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return NextResponse.json({ sent, removed: staleEndpoints.length, events: ranked.length })
}
