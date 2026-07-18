import { NextRequest, NextResponse } from 'next/server'
import { sendToSubscribers } from '@/lib/webpush'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  // Count today's events from Linked Events
  const today = new Date().toISOString().slice(0, 10)
  let eventCount = 0
  try {
    const evRes = await fetch(
      `https://api.hel.fi/linkedevents/v1/event/?format=json&start=${today}&end=${today}&division=helsinki&language=fi&page_size=1`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (evRes.ok) {
      const data = await evRes.json()
      eventCount = data.meta?.count ?? 0
    }
  } catch {}

  // Fetch all subscribers including preferences
  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, preferred_categories')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  function buildBody(prefCats: string, count: number): string {
    const cats = prefCats?.split(',').filter(Boolean) ?? []
    if (cats.length >= 2) {
      const a = cats[0].charAt(0).toUpperCase() + cats[0].slice(1)
      const b = cats[1]
      return count > 0
        ? `${count} tapahtumaa tänään — ${a} ja ${b} kutsuvat!`
        : `Katso tänään mitä Helsingissä tapahtuu — ${a} ja ${b} tarjolla!`
    }
    if (cats.length === 1) {
      const a = cats[0].charAt(0).toUpperCase() + cats[0].slice(1)
      return count > 0 ? `${count} tapahtumaa tänään — ${a}-tarjontaa mukana!` : `${a}-tarjontaa tänään Helsingissä!`
    }
    return count > 0 ? `${count} tapahtumaa tänään Helsingissä!` : 'Katso tänään Helsingissä tapahtuvat tapahtumat!'
  }

  const { sent, staleEndpoints } = await sendToSubscribers(subs, (sub) =>
    JSON.stringify({ title: 'Mitä tänään? 📅', body: buildBody(sub.preferred_categories ?? '', eventCount) })
  )

  if (staleEndpoints.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return NextResponse.json({ sent, removed: staleEndpoints.length })
}
