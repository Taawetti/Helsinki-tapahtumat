import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildGroupDeck } from '@/lib/group-deck'
import { NEIGHBORHOODS } from '@/lib/types'
import type { GroupWhen, BudgetId } from '@/lib/candidate'
import { genCode } from '@/lib/group'
import type { GroupMode } from '@/lib/group'

// Pakan siementäminen hakee /api/events (quick), /api/restaurants, /api/activities
// ja /api/venue-ratings — voi kestää sekunteja.
export const maxDuration = 60

const VALID_FIILIS = ['menoa', 'rento', 'kulttuuri', 'ulkoilu', 'ruoka', 'keikka', 'ulkona', 'baarit', 'sauna', 'perhe', 'ilmaista']
const VALID_BUDGETS = ['any', 'free', 'e', 'ee']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const when: GroupWhen = (['tonight', 'day', 'weekend'] as const).includes(body.when) ? body.when : 'tonight'
  const fiilis: string[] = Array.isArray(body.fiilis) ? body.fiilis.filter((f: unknown): f is string => typeof f === 'string' && VALID_FIILIS.includes(f)) : []
  const mode: GroupMode = body.mode === 'quick' ? 'quick' : 'arc'
  const hostId: string | null = typeof body.hostId === 'string' ? body.hostId.slice(0, 64) : null

  // v3: oma päivävalinta (ISO-muodossa), alue ja budjetti
  const customStart: string | null = typeof body.customStart === 'string' && ISO_DATE.test(body.customStart) ? body.customStart : null
  let customEnd: string | null = typeof body.customEnd === 'string' && ISO_DATE.test(body.customEnd) ? body.customEnd : null
  if (customStart && customEnd && customEnd < customStart) customEnd = customStart
  // Rajoita span järkevään: max 14 päivää
  if (customStart && customEnd && (new Date(customEnd).getTime() - new Date(customStart).getTime()) > 14 * 24 * 60 * 60 * 1000) {
    customEnd = new Date(new Date(customStart).getTime() + 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }
  const area: string = typeof body.area === 'string' ? body.area.slice(0, 40) : 'kaikki'
  const budget: BudgetId = VALID_BUDGETS.includes(body.budget) ? body.budget : 'any'
  // v3.1: monivalitut alueet (validoidaan tunnetut id:t)
  const VALID_AREAS = new Set(NEIGHBORHOODS.map(n => n.id))
  const areas: string[] = Array.isArray(body.areas)
    ? body.areas.filter((a: unknown): a is string => typeof a === 'string' && VALID_AREAS.has(a)).slice(0, 14)
    : []

  const candidates = await buildGroupDeck(req.nextUrl.origin, when, fiilis, { customStart, customEnd, budget, areas })

  if (candidates.length < 4) {
    return NextResponse.json({ error: 'Ei tarpeeksi ehdokkaita juuri nyt — kokeile eri ajankohtaa tai laajenna valintoja' }, { status: 503 })
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
    mode,
    custom_start: customStart,
    custom_end: customEnd,
    area,
    areas,
    budget,
    candidates,
    status: 'open',
    host_id: hostId,
  })
  if (error) return NextResponse.json({ error: `Session luonti epäonnistui: ${error.message}` }, { status: 500 })

  return NextResponse.json({ code, count: candidates.length, mode })
}
