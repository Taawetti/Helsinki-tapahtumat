import type { MetadataRoute } from 'next'
import { VIBES, NEIGHBORHOODS } from '@/lib/types'
import { supabase, DbFestival } from '@/lib/supabase'
import { FESTIVALS_STATIC } from '@/lib/festivals-data'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'
const LE_BASE = 'https://api.hel.fi/linkedevents/v1'

async function fetchUpcomingLinkedEventIds(): Promise<string[]> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const in30days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const url = `${LE_BASE}/event/?start=${today}&end=${in30days}&language=fi&page_size=200&format=json`
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    const events = (data.data ?? []) as { id: string }[]
    return events.map((e) => e.id).filter(Boolean)
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Festivaali-URL:t — staattinen lista + Supabase
  const festivalIds = new Set<string>(FESTIVALS_STATIC.map(f => f.id))
  if (supabase) {
    try {
      const { data } = await supabase.from('festivals').select('id').eq('active', true)
      if (data) (data as Pick<DbFestival, 'id'>[]).forEach(f => festivalIds.add(f.id))
    } catch { /* jatketaan staattisella listalla */ }
  }

  // Linked Events -tapahtumat seuraavalle 30 päivälle
  const linkedEventIds = await fetchUpcomingLinkedEventIds()

  return [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: `${BASE}/vote`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.4,
    },
    // Aikaperusteinen SEO-laskeutumissivut — korkean hakuvolyymin termit
    { url: `${BASE}/tapahtumat/tanaan`,     lastModified: now, changeFrequency: 'hourly' as const, priority: 0.95 },
    { url: `${BASE}/tapahtumat/viikonloppu`, lastModified: now, changeFrequency: 'daily' as const,  priority: 0.92 },
    { url: `${BASE}/tapahtumat/ilmaiset`,   lastModified: now, changeFrequency: 'daily' as const,  priority: 0.90 },
    // Kategoriasivut — yksi per VIBE
    ...VIBES.map((v) => ({
      url: `${BASE}/tapahtumat/${v.id}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    // Kaupunginosasivut
    ...NEIGHBORHOODS.map((n) => ({
      url: `${BASE}/tapahtumat/${n.id}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.75,
    })),
    // Festivaalisivut — indeksoidaan Googlelle nimihauilla
    ...[...festivalIds].map((id) => ({
      url: `${BASE}/tapahtuma/${id}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    })),
    // Linked Events -tapahtumasivut — yksilölliset URL:t Google rich results -hakua varten
    ...linkedEventIds.map((id) => ({
      url: `${BASE}/e/${encodeURIComponent(id)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ]
}
