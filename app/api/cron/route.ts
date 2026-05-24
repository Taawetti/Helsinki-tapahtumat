import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

// Called by Vercel Cron every 15 minutes to keep event data fresh.
// Vercel sets CRON_SECRET automatically and sends it as a Bearer token.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')

  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  revalidateTag('events')

  return NextResponse.json({ synced: true, at: new Date().toISOString() })
}
