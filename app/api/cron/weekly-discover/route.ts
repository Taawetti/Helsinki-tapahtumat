import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

function getBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

// Vercel Cron — runs every Monday at 07:00 UTC (10:00 Helsinki time).
// Discovers new Helsinki events via SERP + seed crawling, auto-imports complete ones.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = getBaseUrl()
  const sessionValue = Buffer.from(process.env.ADMIN_PASSWORD ?? '').toString('base64')
  const cookieHeader = `admin_session=${sessionValue}`

  try {
    // 1. Update existing festivals from their own pages
    await fetch(`${baseUrl}/api/admin/discover-festivals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ mode: 'update' }),
    })

    // 2. Discover new events
    const discoverRes = await fetch(`${baseUrl}/api/admin/discover-festivals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ mode: 'discover' }),
    })

    if (!discoverRes.ok) {
      return NextResponse.json({ error: 'Discovery failed', status: discoverRes.status }, { status: 500 })
    }

    const { candidates } = await discoverRes.json()
    if (!candidates?.length) {
      return NextResponse.json({ success: true, candidates: 0, imported: 0, skipped: 0 })
    }

    // 2. Auto-import candidates that have complete data
    const importRes = await fetch(`${baseUrl}/api/admin/bulk-import-festivals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ candidates }),
    })

    const { imported, skipped } = await importRes.json()

    return NextResponse.json({
      success: true,
      at: new Date().toISOString(),
      candidates: candidates.length,
      imported: imported.length,
      skipped,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
