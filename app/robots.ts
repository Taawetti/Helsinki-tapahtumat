import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // /api/og ON SALLITTAVA vaikka muu /api ei ole. Jokaisen sivun
        // og:image osoittaa sinne, ja robots.txt:tä noudattavat noutajat
        // (Googlebot-Image, facebookexternalhit, Twitterbot, LinkedInBot)
        // eivät hae estettyä osoitetta. Mitattu 26.8.2026: esto oli voimassa
        // samaan aikaan kun sivustoa mainostettiin, eli jaetuissa linkeissä ei
        // näkynyt kuvaa lainkaan. Allow on ennen Disallowia, koska tarkempi
        // sääntö voittaa väljemmän.
        allow: ['/', '/api/og'],
        disallow: ['/api/', '/admin'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  }
}
