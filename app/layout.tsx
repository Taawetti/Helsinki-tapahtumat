import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor: '#0072C6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: 'Helsinki Tapahtumat — Mitä tänä iltana?',
  description: 'Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa. Keikkat, klubit, taide, ruoka, ilmaiset tapahtumat ja paljon muuta.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Helsinki.',
  },
  openGraph: {
    title: 'Helsinki Tapahtumat',
    description: 'Mitä tänä iltana? Löydä parhaat tapahtumat pääkaupunkiseudulla.',
    type: 'website',
    locale: 'fi_FI',
    siteName: 'Helsinki Tapahtumat',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helsinki Tapahtumat',
    description: 'Mitä tänä iltana? Löydä parhaat tapahtumat pääkaupunkiseudulla.',
  },
  keywords: ['Helsinki tapahtumat', 'tapahtumat Helsinki', 'mitä tehdä Helsinki', 'keikkat Helsinki', 'klubit Helsinki', 'ilmaiset tapahtumat'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fi" className={inter.className}>
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" precedence="default" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
