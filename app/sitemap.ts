import type { MetadataRoute } from 'next'
import { VIBES, NEIGHBORHOODS } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

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
    // Category landing pages — one per VIBE
    ...VIBES.map((v) => ({
      url: `${BASE}/tapahtumat/${v.id}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    // Neighborhood landing pages
    ...NEIGHBORHOODS.map((n) => ({
      url: `${BASE}/tapahtumat/${n.id}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.75,
    })),
  ]
}
