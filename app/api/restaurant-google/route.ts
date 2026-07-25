import { NextRequest, NextResponse } from 'next/server'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export const revalidate = 3600

// On-demand rich Google profile for ONE restaurant, read when its detail card is
// opened. Mirrors /api/activity-google but keys the row by the bare venue name
// (restaurants have no `act:` prefix) and also surfaces the real reservation
// link (book_online_url). Keeps the /api/restaurants list response lean — the
// heavy fields (attributes, rating distribution, reservation link) load on tap.
export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get('key') || '').toLowerCase().trim()
  if (!key) return NextResponse.json({ google: null })
  if (!isSupabaseConfigured() || !supabase) return NextResponse.json({ google: null })

  const { data, error } = await supabase
    .from('venue_ratings')
    .select('google_raw, review_count, google_rating')
    .eq('venue_key', key)
    .maybeSingle()

  if (error || !data?.google_raw) return NextResponse.json({ google: null })

  const g = data.google_raw as Record<string, unknown>
  const attrs = (g.attributes ?? null) as { available_attributes?: Record<string, string[]> } | null

  // DataForSEO price_level on enum ('inexpensive'…'very_expensive') → €-asteikko
  const PRICE_EUR: Record<string, string> = { inexpensive: '€', moderate: '€€', expensive: '€€€', very_expensive: '€€€€' }
  const pl = (g.price_level ?? null) as string | null

  const bookUrl = (g.book_online_url ?? null) as string | null

  return NextResponse.json({
    google: {
      rating: (g.rating as { value?: number })?.value ?? data.google_rating ?? null,
      reviewCount: (g.rating as { votes_count?: number })?.votes_count ?? data.review_count ?? null,
      ratingDistribution: (g.rating_distribution ?? null) as Record<string, number> | null,
      priceLevel: pl && PRICE_EUR[pl] ? PRICE_EUR[pl] : null,
      // available_attributes is grouped { offerings:[...], service_options:[...], ... }
      attributes: attrs?.available_attributes ?? null,
      phone: (g.phone ?? null) as string | null,
      url: (g.url ?? null) as string | null,
      // Todellinen varauslinkki (Google "Book online") — voittaa heuristisen
      bookOnlineUrl: bookUrl && /^https?:\/\//i.test(bookUrl) ? bookUrl : null,
    },
  })
}
