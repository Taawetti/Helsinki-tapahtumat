// "Get the app" (English). Content shared with the Finnish /lataa route through
// DownloadView so the two language versions cannot drift apart.

import type { Metadata } from 'next'
import DownloadView from '@/components/DownloadView'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC = 'Install Mitä tänään? on your phone or computer straight from the browser — no app store. Instructions for iPhone, Android and desktop.'

export const metadata: Metadata = {
  title: 'Get the app',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/download`,
    languages: { fi: `${BASE}/lataa`, en: `${BASE}/en/download`, 'x-default': `${BASE}/lataa` },
  },
  openGraph: {
    title: 'Get Mitä tänään? — the app for phone and desktop',
    description: DESC,
    type: 'website',
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    url: `${BASE}/en/download`,
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

export default function EnDownloadPage() {
  return <DownloadView />
}
