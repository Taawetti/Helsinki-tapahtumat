import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function checkAuth(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? Buffer.from(process.env.ADMIN_PASSWORD).toString('base64')
    : null
  return expected && session === expected
}

function generateId(url: string, startDate: string): string {
  try {
    const domain = new URL(url).hostname.replace('www.', '').replace(/\./g, '-')
    const year = startDate.slice(0, 4)
    return `auto-${domain}-${year}`.slice(0, 80)
  } catch {
    return `auto-${Date.now()}`
  }
}

const JUNK_NAMES = new Set([
  'etusivu', 'koti', 'home', 'tapahtumat', 'tapahtumakalenteri', 'kalenteri',
  'events', 'calendar', 'ladataan', 'loading', 'uutiset', 'news',
  'näyttelyt', 'ohjelma', 'ajankohtaista', 'helsinki', 'error', '404',
  'hakutulokset', 'search results', 'kirjaudu', 'login',
  'frontpage', 'koulutus', 'tekstiili', 'tilaa uutiskirje',
  'kurssit ja ilmoittautuminen', 'miksi messuille?', 'yhteystiedot',
  'contact', 'about', 'tietoa meistä', 'ota yhteyttä',
  'privacy notice', 'privacy policy', 'cookie policy', 'terms of service',
  'terms and conditions', 'xfn 1.1 profile', 'xfn profile',
])

const JUNK_SUBSTRINGS = [
  'analytics', 'marketing attribution', 'cookie consent', 'privacy notice',
  'gdpr', 'tracking', 'utm_', 'utm campaign',
]

const NON_HELSINKI_CITIES = [
  ', lahti', ', tampere', ', turku', ', oulu', ', jyväskylä', ', kuopio',
  ', rovaniemi', ', seinäjoki', ', joensuu', ', vaasa', ', pori',
  ', hämeenlinna', ', kotka', ', kouvola', ', lappeenranta', ', lahden',
]

function isQualityName(name: string): boolean {
  if (!name || name.trim().length < 5) return false
  if (name.trim().endsWith('...')) return false
  if (/&[a-z#0-9]+;/i.test(name)) return false
  if (/\.(fi|com|net|org|co\.|eu|io)\b/i.test(name)) return false
  const lower = name.toLowerCase().trim()
  if (JUNK_NAMES.has(lower)) return false
  if (JUNK_SUBSTRINGS.some(s => lower.includes(s))) return false
  return true
}

function isHelsinkiArea(name?: string, venue?: string, address?: string): boolean {
  const combined = `${name ?? ''} ${venue ?? ''} ${address ?? ''}`.toLowerCase()
  return !NON_HELSINKI_CITIES.some(city => combined.includes(city))
}

interface ImportCandidate {
  title: string
  url: string
  event: {
    name?: string
    startDate?: string
    endDate?: string
    venue?: string
    address?: string
    ticketUrl?: string
  } | null
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const { candidates } = await req.json() as { candidates: ImportCandidate[] }
  const today = new Date().toISOString().slice(0, 10)

  // Fetch existing domains to skip duplicates
  const { data: existing } = await supabaseAdmin.from('festivals').select('info_url, id')
  const existingDomains = new Set(
    (existing ?? []).map(f => {
      try { return new URL(f.info_url).hostname.replace('www.', '') } catch { return '' }
    }).filter(Boolean)
  )
  const existingIds = new Set((existing ?? []).map(f => f.id))

  const imported: { name: string; startDate: string }[] = []
  const skipped: string[] = []

  for (const c of candidates) {
    const e = c.event
    // Must have name, future startDate, and venue to auto-import
    if (!e?.startDate || !e?.name || !e?.venue) { skipped.push(c.title); continue }
    if (!isQualityName(e.name)) { skipped.push(c.title); continue }
    if (!isHelsinkiArea(e.name, e.venue, e.address)) { skipped.push(c.title); continue }
    if (e.startDate < today) { skipped.push(c.title); continue }

    let domain = ''
    try { domain = new URL(c.url).hostname.replace('www.', '') } catch { /* invalid url */ }
    if (domain && existingDomains.has(domain)) { skipped.push(c.title); continue }

    let id = generateId(c.url, e.startDate)
    // Ensure ID uniqueness
    let suffix = 0
    while (existingIds.has(id)) { suffix++; id = `${generateId(c.url, e.startDate)}-${suffix}` }

    const { error } = await supabaseAdmin.from('festivals').insert({
      id,
      name: e.name,
      short_name: e.name,
      start_date: e.startDate,
      end_date: e.endDate || e.startDate,
      time: '12:00',
      venue_name: e.venue,
      address: e.address || '',
      city: 'Helsinki',
      ticket_url: e.ticketUrl || '',
      info_url: c.url,
      image: null,
      categories: [],
      is_free: false,
      description: '',
      active: true,
    })

    if (!error) {
      imported.push({ name: e.name, startDate: e.startDate })
      if (domain) existingDomains.add(domain)
      existingIds.add(id)
    } else {
      skipped.push(c.title)
    }
  }

  return NextResponse.json({ imported, skipped: skipped.length })
}
