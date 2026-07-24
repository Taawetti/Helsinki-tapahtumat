import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchFestivalImage } from '@/lib/og-image'

// Kuvahaku festarisivuilta lisää muutaman sekunnin per uusi festari.
export const maxDuration = 120

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

// Viimeinen suodatin — pisteytysalgoritmi hylkää useimmat roskat jo discover-vaiheessa
const JUNK_NAMES = new Set([
  'etusivu', 'koti', 'home', 'tapahtumat', 'tapahtumakalenteri', 'kalenteri',
  'events', 'calendar', 'ladataan', 'loading', 'uutiset', 'news',
  'näyttelyt', 'ohjelma', 'ajankohtaista', 'helsinki', 'error', '404',
  'hakutulokset', 'search results', 'kirjaudu', 'login',
])

const JUNK_SUBSTRINGS = [
  'analytics', 'cookie consent', 'privacy notice', 'gdpr', 'tracking',
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
  let skipped = 0

  // 1. Suodata + dedup → rakenna insert-tietue jo tässä (kavennus säilyy).
  //    Varataan domain/id heti, jotta saman erän duplikaatit karsiutuvat.
  interface Pending {
    infoUrl: string
    ticketUrl: string
    name: string
    startDate: string
    record: Record<string, unknown>
  }
  const pending: Pending[] = []
  for (const c of candidates) {
    const e = c.event
    if (!e?.startDate || !e?.name || !e?.venue) { skipped++; continue }
    if (!isQualityName(e.name)) { skipped++; continue }
    if (!isHelsinkiArea(e.name, e.venue, e.address)) { skipped++; continue }
    if (e.startDate < today) { skipped++; continue }

    let domain = ''
    try { domain = new URL(c.url).hostname.replace('www.', '') } catch { /* invalid url */ }
    if (domain && existingDomains.has(domain)) { skipped++; continue }

    let id = generateId(c.url, e.startDate)
    let suffix = 0
    while (existingIds.has(id)) { suffix++; id = `${generateId(c.url, e.startDate)}-${suffix}` }

    if (domain) existingDomains.add(domain)
    existingIds.add(id)
    pending.push({
      infoUrl: c.url,
      ticketUrl: e.ticketUrl || '',
      name: e.name,
      startDate: e.startDate,
      record: {
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
        image: null as string | null,
        categories: [],
        is_free: false,
        description: '',
        active: true,
      },
    })
  }

  // 2. Hae kuvat rajatulla rinnakkaisuudella JA aikabudjetilla, jottei hidas
  //    festarisivu koskaan venytä ajoa yli maxDurationin (kaikki tuodaan silti;
  //    budjetin jälkeiset jäävät image:null → myöhempi backfill/borrow hoitaa).
  const DEADLINE = Date.now() + 90_000
  const CONC = 5
  for (let i = 0; i < pending.length; i += CONC) {
    if (Date.now() > DEADLINE) break
    await Promise.all(pending.slice(i, i + CONC).map(async (p) => {
      p.record.image = await fetchFestivalImage(p.infoUrl, p.ticketUrl)
    }))
  }

  // 3. Tallenna kaikki (kuvalla tai ilman).
  for (const p of pending) {
    const { error } = await supabaseAdmin.from('festivals').insert(p.record)
    if (!error) imported.push({ name: p.name, startDate: p.startDate })
    else skipped++
  }

  return NextResponse.json({ imported, skipped })
}
