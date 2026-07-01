import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchOSMCached, fetchPKCached } from '@/app/api/restaurants/route'

// Vercel Cron — runs daily at 06:00 UTC (09:00 Helsinki time).
// Revalidates event and restaurant caches, then pre-warms restaurant data
// so the first daily user never hits the slow Overpass fetch.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')

  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Invalidate stale caches
  revalidateTag('events', 'max')
  revalidateTag('restaurants', 'max')

  // Pre-warm restaurant cache in background (don't block the cron response)
  void Promise.allSettled([fetchOSMCached(), fetchPKCached()])

  return NextResponse.json({ synced: true, at: new Date().toISOString() })
}
