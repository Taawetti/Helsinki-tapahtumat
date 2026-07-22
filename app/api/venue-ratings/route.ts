import { NextResponse } from 'next/server'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export const revalidate = 3600 // 1 hour cache

export async function GET() {
  if (!isSupabaseConfigured() || !supabase) {
    return NextResponse.json({ ratings: {} })
  }

  // Supabase katkaisee SELECTin 1000 riviin — venue_ratings on ~3000 riviä,
  // joten ilman sivutusta 2/3 arvosanoista jäi saapumatta.
  const PAGE = 1000
  const data: Array<{ venue_key: string; google_rating: number | null; review_count: number | null; price_level: string | null; description: string | null }> = []
  for (let page = 0; ; page++) {
    const resp = await supabase
      .from('venue_ratings')
      .select('venue_key, google_rating, review_count, price_level, description')
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (resp.error || !resp.data || resp.data.length === 0) break
    data.push(...(resp.data as typeof data))
    if (resp.data.length < PAGE) break
  }

  if (data.length === 0) return NextResponse.json({ ratings: {} })

  const ratings: Record<string, { rating: number; reviewCount: number; priceLevel: string | null; description?: string }> = {}
  for (const row of data) {
    if (row.google_rating) {
      ratings[row.venue_key] = {
        rating: row.google_rating,
        reviewCount: row.review_count ?? 0,
        priceLevel: row.price_level,
        ...(typeof row.description === 'string' && row.description.trim() ? { description: row.description.trim() } : {}),
      }
    }
  }

  return NextResponse.json({ ratings })
}
