// Privacy notice (English). Content shared with the Finnish /tietosuoja route
// through PrivacyView so the two language versions cannot drift apart.

import type { Metadata } from 'next'
import PrivacyView from '@/components/PrivacyView'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

const DESC = 'Mitä tänään? — privacy notice: what data is collected, why, and how you can control it. Cookieless visitor counting, advertising cookies only with consent.'

export const metadata: Metadata = {
  title: 'Privacy notice',
  description: DESC,
  alternates: {
    canonical: `${BASE}/en/privacy`,
    languages: { fi: `${BASE}/tietosuoja`, en: `${BASE}/en/privacy`, 'x-default': `${BASE}/tietosuoja` },
  },
  robots: { index: false, follow: true },
}

export default function EnPrivacyPage() {
  return <PrivacyView />
}
