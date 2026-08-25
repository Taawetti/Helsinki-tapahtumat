import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import LanguageGate from '@/contexts/LanguageGate'
import Footer from '@/components/Footer'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor: '#6b76ff',
  width: 'device-width',
  initialScale: 1,
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: {
    default: 'Mitä tänään — Kaikki Helsinki tapahtumat',
    template: '%s | Mitä tänään Helsinki',
  },
  description: 'Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa — keikat, teatterit, festivaalit, näyttelyt, urheilu, ilmaiset tapahtumat ja paljon muuta.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mitä tänään',
  },
  openGraph: {
    title: 'Mitä tänään — Kaikki Helsinki tapahtumat',
    description: 'Löydä parhaat tapahtumat Helsingissä tänään ja tulevinä päivinä. Keikat, teatterit, festivaalit, näyttelyt, urheilu.',
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
    'keikat Helsinki', 'ilmaiset tapahtumat Helsinki', 'teatterit Helsinki',
    'festivaalit Helsinki', 'näyttelyt Helsinki', 'urheilu Helsinki',
    'konsertti Helsinki', 'yöelämä Helsinki', 'tapahtumakalenteri Helsinki',
    'Helsinki tänään', 'mitä tapahtuu Helsingissä',
  ],
  // HUOM: canonicalia EI aseteta täällä. Juurilayoutin alternates periytyy
  // jokaiselle sivulle jolla ei ole omaansa, ja mitattu 25.8.2026: /vote ja
  // /ohjelma-ilmoittajalle ilmoittivat canonicaliksi etusivun eli kertoivat
  // Googlelle olevansa sen kopioita. Etusivun oma canonical on app/page.tsx:ssä.
}

const webAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Mitä tänään',
  url: BASE,
  description: 'Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa.',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Any',
  // Molemmat kielet: sovellus on saatavilla suomeksi (/) ja englanniksi (/en).
  // Nämä lohkot ovat juurilayoutissa eli mukana myös /en-sivulla, joten pelkkä
  // 'fi' olisi ilmoittanut englanninkielisen sivun suomenkieliseksi.
  inLanguage: ['fi-FI', 'en-GB'],
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
  description: 'Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa — keikat, festivaalit, teatterit, näyttelyt ja paljon muuta.',
  areaServed: { '@type': 'City', name: 'Helsinki', sameAs: 'https://www.wikidata.org/wiki/Q1757' },
  inLanguage: ['fi-FI', 'en-GB'],
}

const webSiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Mitä tänään',
  alternateName: ['Mitä tänään Helsinki', 'mitatanaan.fi', 'mitätänään.fi'],
  url: BASE,
  inLanguage: ['fi-FI', 'en-GB'],
  description: 'Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa.',
  publisher: { '@type': 'Organization', name: 'Mitä tänään', url: BASE },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // AdSense-loaderia ei ladata toistaiseksi: mikään komponentti ei renderöi
  // mainoksia (AdBanner on käyttämätön) → turha ~100 KB kolmannen osapuolen JS.
  // Palauta kun mainokset kytketään oikeasti johonkin näkymään.
  return (
    <html lang="fi" className={inter.className}>
      <head>
        <link rel="apple-touch-icon" href="/icon-180.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }} />
      </head>
      <body className="min-h-screen">
        <LanguageGate>
          <FavoritesProvider>
            {children}
            <Footer />
          </FavoritesProvider>
        </LanguageGate>
        {/* Vercel Web Analytics — kävijämittaus ilman evästeitä (GDPR-kevyt).
            Vaatii Web Analyticsin kytkemisen päälle Vercelin projektiasetuksista;
            siihen asti skripti on inertti. */}
        <Analytics />
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
