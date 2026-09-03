// Tietosuojaseloste (suomi). Sisältö jaettu englanninkielisen /en/privacy
// -reitin kanssa komponentissa PrivacyView, jotta kieliversiot eivät eroa.

import type { Metadata } from 'next'
import PrivacyView from '@/components/PrivacyView'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

const DESC = 'Mitä tänään? — tietosuoja: mitä tietoja kerätään, miksi ja miten voit vaikuttaa siihen. Kävijälaskenta ilman evästeitä, mainosevästeet vain suostumuksella.'

export const metadata: Metadata = {
  title: 'Tietosuoja',
  description: DESC,
  alternates: {
    canonical: `${BASE}/tietosuoja`,
    languages: { fi: `${BASE}/tietosuoja`, en: `${BASE}/en/privacy`, 'x-default': `${BASE}/tietosuoja` },
  },
  // Seloste ei ole hakukonesisältöä eikä sen kuulu kilpailla laskeutumissivujen
  // kanssa hakutuloksissa. Se on kuitenkin seurattava, jotta linkit toimivat.
  robots: { index: false, follow: true },
}

export default function TietosuojaSivu() {
  return <PrivacyView />
}
