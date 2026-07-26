import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getDateRange } from '@/lib/utils'
import { buildDeck } from '@/lib/candidate'
import type { GroupWhen, Fiilis, DeckInput } from '@/lib/candidate'
import type { Event, Restaurant, Activity } from '@/lib/types'
import { genCode } from '@/lib/group'
import type { DateFilter } from '@/lib/types'

// Pakan siementäminen hakee /api/events (quick), /api/restaurants, /api/activities
// ja /api/venue-ratings — voi kestää sekunteja.
export const maxDuration = 60

const WHEN_TO_FILTER: Record<GroupWhen, DateFilter> = { tonight: 'tonight', day: 'today', weekend: 'weekend' }
const VALID_FIILIS: Fiilis[] = ['menoa', 'rento', 'kulttuuri', 'ulkoilu', 'ruoka']

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const when: GroupWhen = (['tonight', 'day', 'weekend'] as const).includes(body.when) ? body.when : 'tonight'
  const fiilis: Fiilis[] = Array.isArray(body.fiilis) ? body.fiilis.filter((f: unknown): f is Fiilis => VALID_FIILIS.includes(f as Fiilis)) : []
  const hostId: string | null = typeof body.hostId === 'string' ? body.hostId.slice(0, 64) : null

  const origin = req.nextUrl.origin
  const { start, end, startAfter } = getDateRange(WHEN_TO_FILTER[when])
  const evParams = new URLSearchParams({ start, end, page: '1', municipality: 'helsinki', quick: '1' })
  if (startAfter) evParams.set('startAfter', startAfter)

  // Hae ehdokaslähteet rinnakkain. Yksittäisen lähteen kaatuminen ei estä pakkaa.
  const j = async <T,>(url: string, fallback: T): Promise<T> => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) })
      if (!r.ok) return fallback
      return (await r.json()) as T
    } catch { return fallback }
  }
  const [ev, rest, act, rat] = await Promise.all([
    j<{ events: Event[] }>(`${origin}/api/events?${evParams}`, { events: [] }),
    j<{ restaurants: Restaurant[] }>(`${origin}/api/restaurants`, { restaurants: [] }),
    j<{ activities: Activity[] }>(`${origin}/api/activities`, { activities: [] }),
    j<{ ratings: Record<string, { rating: number; reviewCount: number }> }>(`${origin}/api/venue-ratings`, { ratings: {} }),
  ])

  const activityRatings = new Map<string, { rating: number; reviewCount: number }>()
  for (const [k, v] of Object.entries(rat.ratings ?? {})) activityRatings.set(k, { rating: v.rating, reviewCount: v.reviewCount })

  const input: DeckInput = {
    events: ev.events ?? [],
    restaurants: rest.restaurants ?? [],
    activities: act.activities ?? [],
    activityRatings,
  }
  const candidates = buildDeck(input, { when, fiilis, size: 24 })

  if (candidates.length < 4) {
    return NextResponse.json({ error: 'Ei tarpeeksi ehdokkaita juuri nyt — kokeile eri ajankohtaa' }, { status: 503 })
  }

  // Luo uniikki koodi (retry törmäyksessä — harvinaista 32^4 ≈ 1M avaruudessa).
  let code = ''
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = genCode(4)
    const { data: existing } = await supabaseAdmin.from('group_sessions').select('id').eq('id', candidate).maybeSingle()
    if (!existing) { code = candidate; break }
  }
  if (!code) return NextResponse.json({ error: 'Koodin luonti epäonnistui, yritä uudelleen' }, { status: 500 })

  const { error } = await supabaseAdmin.from('group_sessions').insert({
    id: code,
    when_filter: when,
    fiilis,
    candidates,
    status: 'open',
    host_id: hostId,
  })
  if (error) return NextResponse.json({ error: `Session luonti epäonnistui: ${error.message}` }, { status: 500 })

  return NextResponse.json({ code, count: candidates.length })
}
