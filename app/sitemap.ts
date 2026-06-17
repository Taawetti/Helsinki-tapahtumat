import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  // Category query URLs — these are anchor links that deep-link into filters
  const categories = [
    { slug: '#keikka',       label: 'Keikka' },
    { slug: '#teatteri',     label: 'Teatteri' },
    { slug: '#festivaali',   label: 'Festivaali' },
    { slug: '#urheilu',      label: 'Urheilu' },
    { slug: '#nayttely',     label: 'Näyttely' },
    { slug: '#ilmainen',     label: 'Ilmainen' },
  ]

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
    // Festival-specific pages (future)
    // Keep here as stubs so crawlers revisit
    ...categories.map((c) => ({
      url: `${BASE}/${c.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ]
}
