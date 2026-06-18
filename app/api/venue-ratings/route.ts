import { NextResponse } from 'next/server'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export const revalidate = 3600 // 1 hour cache

export async function GET() {
  if (!isSupabaseConfigured() || !supabase) {
    return NextResponse.json({ ratings: {} })
  }

  const { data, error } = await supabase
    .from('venue_ratings')
    .select('venue_key, google_rating, review_count, price_level')

  if (error || !data) return NextResponse.json({ ratings: {} })

  const ratings: Record<string, { rating: number; reviewCount: number; priceLevel: string | null }> = {}
  for (const row of data) {
    if (row.google_rating) {
      ratings[row.venue_key] = {
        rating: row.google_rating,
        reviewCount: row.review_count ?? 0,
        priceLevel: row.price_level,
      }
    }
  }

  return NextResponse.json({ ratings })
}
