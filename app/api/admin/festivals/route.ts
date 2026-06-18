import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin, DbFestival } from '@/lib/supabase'

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? Buffer.from(process.env.ADMIN_PASSWORD).toString('base64')
    : null
  return Boolean(session && expected && session === expected)
}

// GET /api/admin/festivals — list all festivals
export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 503 })
  }

  const { data, error } = await supabaseAdmin
    .from('festivals')
    .select('*')
    .order('start_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ festivals: data })
}

// POST /api/admin/festivals — create new
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 503 })
  }

  const body = await req.json()
  const row: Omit<DbFestival, 'created_at'> = {
    id: body.id || slugify(body.name),
    name: body.name,
    short_name: body.shortName,
    start_date: body.startDate,
    end_date: body.endDate,
    time: body.time || '12:00',
    venue_name: body.venueName,
    address: body.address || '',
    city: body.city || 'Helsinki',
    ticket_url: body.ticketUrl,
    info_url: body.infoUrl,
    image: body.image || null,
    categories: Array.isArray(body.categories)
      ? body.categories
      : (body.categories || '').split(',').map((c: string) => c.trim()).filter(Boolean),
    is_free: Boolean(body.isFree),
    description: body.description || '',
    active: body.active !== false,
  }

  const { data, error } = await supabaseAdmin
    .from('festivals')
    .insert(row)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ festival: data }, { status: 201 })
}

// PUT /api/admin/festivals — update existing
export async function PUT(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 503 })
  }

  const body = await req.json()
  const { id, ...rest } = body

  const updates: Partial<DbFestival> = {
    name: rest.name,
    short_name: rest.shortName,
    start_date: rest.startDate,
    end_date: rest.endDate,
    time: rest.time,
    venue_name: rest.venueName,
    address: rest.address,
    city: rest.city,
    ticket_url: rest.ticketUrl,
    info_url: rest.infoUrl,
    image: rest.image || null,
    categories: Array.isArray(rest.categories)
      ? rest.categories
      : (rest.categories || '').split(',').map((c: string) => c.trim()).filter(Boolean),
    is_free: Boolean(rest.isFree),
    description: rest.description,
    active: rest.active !== false,
  }

  const { data, error } = await supabaseAdmin
    .from('festivals')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ festival: data })
}

// DELETE /api/admin/festivals?id=xxx — delete
export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 503 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  const { error } = await supabaseAdmin.from('festivals').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äå]/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) + '-' + Date.now().toString(36)
}
