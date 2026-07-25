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
  // Google Maps -LISTAUKSEN url rakennetaan cid:stä (items-tason kenttä,
  // tallessa google_raw:ssa). HUOM: g.url on ravintolan OMA nettisivu (= sama
  // kuin Nettisivu-nappi), EI Maps-listaus, joten sitä ei käytetä tähän.
  const cid = g.cid != null ? String(g.cid) : null
  const mapsUrl = cid && /^\d+$/.test(cid) ? `https://www.google.com/maps?cid=${cid}` : null

  // popular_times → per-viikonpäivä tuntitaulukko [{hour, index 0-100}] (client
  // laskee "ruuhka nyt" oman kellon mukaan). place_topics jätetty pois: DataForSEO
  // ei palauta sitä Helsingin kohteille (0 osumaa koko datassa).
  const ptDays = (g.popular_times as { popular_times_by_days?: Record<string, Array<{ time?: { hour?: number }; popular_index?: number }>> } | null)?.popular_times_by_days
  let popularTimes: Record<string, { hour: number; index: number }[]> | null = null
  if (ptDays && typeof ptDays === 'object') {
    const out: Record<string, { hour: number; index: number }[]> = {}
    for (const [day, arr] of Object.entries(ptDays)) {
      if (!Array.isArray(arr)) continue
      const hours = arr
        .map((e) => ({ hour: typeof e?.time?.hour === 'number' ? e.time.hour : -1, index: typeof e?.popular_index === 'number' ? e.popular_index : 0 }))
        .filter((e) => e.hour >= 0)
      if (hours.length) out[day.toLowerCase()] = hours
    }
    if (Object.keys(out).length) popularTimes = out
  }

  // people_also_search → "vastaavat paikat" (nimi + arvosana), top 6
  const pas = g.people_also_search
  const peopleAlsoSearch = Array.isArray(pas)
    ? pas
        .map((p) => {
          const o = p as { title?: unknown; rating?: { value?: number; votes_count?: number } }
          return {
            title: typeof o?.title === 'string' ? o.title : null,
            rating: typeof o?.rating?.value === 'number' ? o.rating.value : null,
            reviewCount: typeof o?.rating?.votes_count === 'number' ? o.rating.votes_count : null,
          }
        })
        .filter((p): p is { title: string; rating: number | null; reviewCount: number | null } => !!p.title)
        .slice(0, 6)
    : null

  return NextResponse.json({
    google: {
      rating: (g.rating as { value?: number })?.value ?? data.google_rating ?? null,
      reviewCount: (g.rating as { votes_count?: number })?.votes_count ?? data.review_count ?? null,
      ratingDistribution: (g.rating_distribution ?? null) as Record<string, number> | null,
      priceLevel: pl && PRICE_EUR[pl] ? PRICE_EUR[pl] : null,
      // available_attributes is grouped { offerings:[...], service_options:[...], ... }
      attributes: attrs?.available_attributes ?? null,
      phone: (g.phone ?? null) as string | null,
      mapsUrl,
      // Todellinen varauslinkki (Google "Book online") — voittaa heuristisen
      bookOnlineUrl: bookUrl && /^https?:\/\//i.test(bookUrl) ? bookUrl : null,
      popularTimes,
      peopleAlsoSearch: peopleAlsoSearch && peopleAlsoSearch.length ? peopleAlsoSearch : null,
      totalPhotos: typeof g.total_photos === 'number' ? g.total_photos : null,
      isClaimed: g.is_claimed === true,
    },
  })
}
