import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from '@/lib/webpush'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const { data: subs, error } = await supabase
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

  const staleEndpoints: string[] = []
  let sent = 0

  await Promise.allSettled(
    subs.map(async (sub) => {
      const body = buildBody(sub.preferred_categories ?? '', eventCount)
      const payload = JSON.stringify({ title: 'Mitä tänään? 📅', body })
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent++
      } catch (err: unknown) {
        // 410 Gone = subscription expired, clean up
        if (err && typeof err === 'object' && 'statusCode' in err && (err.statusCode === 410 || err.statusCode === 404)) {
          staleEndpoints.push(sub.endpoint)
        }
      }
    })
  )

  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return NextResponse.json({ sent, removed: staleEndpoints.length })
}
