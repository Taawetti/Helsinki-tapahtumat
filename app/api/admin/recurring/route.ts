import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function checkAuth(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? Buffer.from(process.env.ADMIN_PASSWORD).toString('base64')
    : null
  return expected && session === expected
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const { data, error } = await supabaseAdmin
    .from('recurring_events')
    .select('*')
    .order('weekday')
    .order('start_hour')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data })
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json()
  const row = toDb(body)

  const { data, error } = await supabaseAdmin
    .from('recurring_events')
    .insert(row)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json()
  const { id, ...rest } = body
  const row = toDb(rest)

  const { data, error } = await supabaseAdmin
    .from('recurring_events')
    .update(row)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('recurring_events')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

function toDb(b: Record<string, unknown>) {
  return {
    title: b.title,
    short_description: b.shortDescription ?? '',
    venue: b.venue,
    address: b.address ?? '',
    lat: b.lat ? Number(b.lat) : null,
    lon: b.lon ? Number(b.lon) : null,
    weekday: Number(b.weekday),
    start_hour: Number(b.startHour),
    start_minute: Number(b.startMinute ?? 0),
    duration_minutes: Number(b.durationMinutes ?? 120),
    is_free: Boolean(b.isFree),
    price: b.price || null,
    ticket_url: b.ticketUrl || null,
    info_url: b.infoUrl || null,
    categories: Array.isArray(b.categories)
      ? b.categories
      : String(b.categories).split(',').map((c: string) => c.trim()).filter(Boolean),
    active_months: b.activeMonths && String(b.activeMonths).trim()
      ? String(b.activeMonths).split(',').map((m: string) => Number(m.trim())).filter(Boolean)
      : null,
    active: b.active !== false,
  }
}
