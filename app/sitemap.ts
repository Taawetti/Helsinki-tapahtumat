import type { MetadataRoute } from 'next'
import { VIBES, NEIGHBORHOODS } from '@/lib/types'
import { supabase, DbFestival } from '@/lib/supabase'
import { FESTIVALS_STATIC } from '@/lib/festivals-data'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

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
  ]
}
