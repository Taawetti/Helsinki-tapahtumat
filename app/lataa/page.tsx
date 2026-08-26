// "Lataa sovellus" (suomi). Sisältö jaettu englanninkielisen /en/download
// -reitin kanssa komponentissa DownloadView, jotta kieliversiot eivät eroa.

import type { Metadata } from 'next'
import DownloadView from '@/components/DownloadView'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC = 'Asenna Mitä tänään? puhelimeen tai tietokoneelle suoraan selaimesta — ei sovelluskauppaa. Ohjeet iPhonelle, Androidille ja tietokoneelle.'

export const metadata: Metadata = {
  title: 'Lataa sovellus',
  description: DESC,
  alternates: {
    canonical: `${BASE}/lataa`,
    languages: { fi: `${BASE}/lataa`, en: `${BASE}/en/download`, 'x-default': `${BASE}/lataa` },
  },
  openGraph: {
    title: 'Lataa Mitä tänään? — sovellus puhelimeen ja tietokoneelle',
    description: DESC,
    type: 'website',
    locale: 'fi_FI',
    url: `${BASE}/lataa`,
    // Ilman images-kenttää sivun oma openGraph korvaisi juurilayoutin ja
    // jakokuva katoaisi kokonaan.
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

export default function LataaSivu() {
  return <DownloadView />
}
