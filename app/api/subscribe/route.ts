import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy alustus: moduulitason non-null (!) -päättely kaatoi reitin
// import-vaiheessa, jos env-muuttujat puuttuivat.
let client: SupabaseClient | null = null
function getSupabase(): SupabaseClient | null {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  client = createClient(url, key)
  return client
}

function isValidEndpoint(s: unknown): s is string {
  if (typeof s !== 'string' || s.length > 2048) return false
  try {
    return new URL(s).protocol === 'https:'
  } catch {
    return false
  }
}

function isValidKey(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= 512
}

function sanitizeCategories(input: unknown): string[] | null {
  if (input == null) return null
  if (!Array.isArray(input)) return null
  const cats = input.filter((c): c is string => typeof c === 'string').slice(0, 12)
  return cats.length ? cats.map((c) => c.slice(0, 64)) : null
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 503 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { endpoint, keys, preferredCategories } = body
  if (!isValidEndpoint(endpoint) || !isValidKey(keys?.p256dh) || !isValidKey(keys?.auth)) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const row: Record<string, unknown> = { endpoint, p256dh: keys.p256dh, auth: keys.auth }
  const cats = sanitizeCategories(preferredCategories)
  if (cats) row.preferred_categories = cats

  const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 503 })

  const body = await req.json().catch(() => null)
  if (!isValidEndpoint(body?.endpoint)) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })
  }

  await supabase.from('push_subscriptions').delete().eq('endpoint', body.endpoint)
  return NextResponse.json({ ok: true })
}
