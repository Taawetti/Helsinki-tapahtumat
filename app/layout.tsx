import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { FavoritesProvider } from '@/contexts/FavoritesContext'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor: '#0072C6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: 'Mitä tänään — Helsinki tapahtumat',
  description: 'Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa. Keikkat, klubit, taide, ruoka, ilmaiset tapahtumat ja paljon muuta.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mitä tänään',
  },
  openGraph: {
    title: 'Mitä tänään — Helsinki tapahtumat',
    description: 'Löydä parhaat tapahtumat pääkaupunkiseudulla tänään.',
    type: 'website',
    locale: 'fi_FI',
    siteName: 'Mitä tänään',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mitä tänään — Helsinki tapahtumat',
    description: 'Löydä parhaat tapahtumat pääkaupunkiseudulla tänään.',
  },
  keywords: ['mitä tänään', 'Helsinki tapahtumat', 'tapahtumat Helsinki', 'mitä tehdä Helsinki', 'keikkat Helsinki', 'ilmaiset tapahtumat'],
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
        {adsenseId && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="min-h-screen">
        <FavoritesProvider>
          {children}
        </FavoritesProvider>
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
