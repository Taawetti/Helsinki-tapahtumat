import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import { LanguageProvider } from '@/contexts/LanguageContext'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor: '#0072C6',
  width: 'device-width',
  initialScale: 1,
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: {
    default: 'Mitä tänään — Kaikki Helsinki tapahtumat',
    template: '%s | Mitä tänään Helsinki',
  },
  description: 'Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa — keikkat, teatterit, festivaalit, näyttelyt, urheilu, ilmaiset tapahtumat ja paljon muuta.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mitä tänään',
  },
  openGraph: {
    title: 'Mitä tänään — Kaikki Helsinki tapahtumat',
    description: 'Löydä parhaat tapahtumat Helsingissä tänään ja tulevinä päivinä. Keikkat, teatterit, festivaalit, näyttelyt, urheilu.',
    type: 'website',
    locale: 'fi_FI',
    siteName: 'Mitä tänään',
    url: BASE,
    images: [{ url: '/api/og', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mitä tänään — Kaikki Helsinki tapahtumat',
    description: 'Löydä parhaat tapahtumat Helsingissä tänään ja tulevinä päivinä.',
  },
  keywords: [
    'mitä tänään', 'Helsinki tapahtumat', 'tapahtumat Helsinki', 'mitä tehdä Helsinki',
    'keikkat Helsinki', 'ilmaiset tapahtumat Helsinki', 'teatterit Helsinki',
    'festivaalit Helsinki', 'näyttelyt Helsinki', 'urheilu Helsinki',
    'konsertti Helsinki', 'yöelämä Helsinki', 'tapahtumakalenteri Helsinki',
    'Helsinki tänään', 'mitä tapahtuu Helsingissä',
  ],
  alternates: {
    canonical: BASE,
    languages: { 'fi-FI': BASE, 'en': `${BASE}/en` },
  },
}

const webAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Mitä tänään',
  url: BASE,
  description: 'Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa.',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Any',
  inLanguage: 'fi',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  areaServed: {
    '@type': 'City',
    name: 'Helsinki',
    sameAs: 'https://www.wikidata.org/wiki/Q1757',
  },
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Mitä tänään',
  url: BASE,
  logo: { '@type': 'ImageObject', url: `${BASE}/icon-512.png` },
  description: 'Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa — keikkat, festivaalit, teatterit, näyttelyt ja paljon muuta.',
  areaServed: { '@type': 'City', name: 'Helsinki', sameAs: 'https://www.wikidata.org/wiki/Q1757' },
  inLanguage: 'fi-FI',
}

const webSiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Mitä tänään',
  alternateName: ['Mitä tänään Helsinki', 'mitatanaan.fi'],
  url: BASE,
  inLanguage: 'fi-FI',
  description: 'Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa.',
  publisher: { '@type': 'Organization', name: 'Mitä tänään', url: BASE },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID
  return (
    <html lang="fi" className={inter.className}>
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" precedence="default" />
        <link rel="apple-touch-icon" href="/icon-180.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }} />
        {adsenseId && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="min-h-screen">
        <LanguageProvider>
          <FavoritesProvider>
            {children}
          </FavoritesProvider>
        </LanguageProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {})
            })
          }
        `}} />
      </body>
    </html>
  )
}
