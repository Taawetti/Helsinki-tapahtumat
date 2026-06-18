import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function checkAuth(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value
  const expected = process.env.ADMIN_PASSWORD
    ? Buffer.from(process.env.ADMIN_PASSWORD).toString('base64')
    : null
  return expected && session === expected
}

// Map venue key → Google Business search query
const VENUE_QUERIES: Record<string, string> = {
  'kotiharjun sauna':      'Kotiharjun Sauna Helsinki',
  'löyly':                 'Löyly Helsinki',
  'allas sea pool':        'Allas Sea Pool Helsinki',
  'kulttuurisauna':        'Kulttuurisauna Helsinki',
  'sauna hermanni':        'Sauna Hermanni Helsinki',
  'suomenlinna':           'Suomenlinna Helsinki',
  'temppeliaukion kirkko': 'Temppeliaukion kirkko Helsinki',
  'kansallismuseo':        'Kansallismuseo Helsinki',
  'vanha kauppahalli':     'Vanha kauppahalli Helsinki',
  'kauppahalli':           'Hakaniemen kauppahalli Helsinki',
  'hakaniemen kauppahalli':'Hakaniemen kauppahalli Helsinki',
  'uspenski':              'Uspenskin katedraali Helsinki',
  'tuomiokirkko':          'Helsingin tuomiokirkko',
  'seurasaari':            'Seurasaari Helsinki',
  'ateneum':               'Ateneum taidemuseo Helsinki',
  'kiasma':                'Kiasma nykytaiteen museo Helsinki',
  'amos rex':              'Amos Rex Helsinki',
  'ham helsinki':          'HAM Helsingin taidemuseo',
  'sinebrychoff':          'Sinebrychoffin taidemuseo Helsinki',
  'designmuseo':           'Designmuseo Helsinki',
  'sibelius-monumentti':   'Sibelius-monumentti Helsinki',
  'pihlajasaari':          'Pihlajasaari Helsinki',
  'linnanmäki':            'Linnanmäki Helsinki',
  'korkeasaari':           'Korkeasaari eläintarha Helsinki',
  'heureka':               'Heureka tiedekeskus Vantaa',
}

async function fetchRating(query: string): Promise<{
  rating: number | null
  reviewCount: number | null
  priceLevel: string | null
  description: string | null
}> {
  const token = process.env.DATAFORSEO_TOKEN
  if (!token) return { rating: null, reviewCount: null, priceLevel: null, description: null }

  const res = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/live', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{
      keyword: query,
      location_name: 'Helsinki,Helsinki,Uusimaa,Finland',
      language_name: 'Finnish',
    }]),
  })

  const data = await res.json()

  // Log first result for debugging
  if (data?.tasks?.[0]?.status_message) {
    console.log('[refresh-ratings] status:', data.tasks[0].status_message)
  }

  const item = data?.tasks?.[0]?.result?.[0]?.items?.[0]
  if (!item) {
    console.log('[refresh-ratings] no item for query:', query, JSON.stringify(data?.tasks?.[0]?.result?.[0]).slice(0, 200))
    return { rating: null, reviewCount: null, priceLevel: null, description: null }
  }

  return {
    rating: item.rating?.value ?? null,
    reviewCount: item.rating?.votes_count ?? null,
    priceLevel: item.price_level ?? null,
    description: item.description ?? null,
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const results: { key: string; status: string; rating?: number | null }[] = []

  for (const [venueKey, query] of Object.entries(VENUE_QUERIES)) {
    try {
      const { rating, reviewCount, priceLevel, description } = await fetchRating(query)

      await supabaseAdmin.from('venue_ratings').upsert({
        venue_key: venueKey,
        google_rating: rating,
        review_count: reviewCount,
        price_level: priceLevel,
        description,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'venue_key' })

      results.push({ key: venueKey, status: 'ok', rating })
    } catch {
      results.push({ key: venueKey, status: 'error' })
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200))
  }

  return NextResponse.json({ updated: results.length, results })
}
