import type { Metadata } from 'next'
import PaatakaaSession from '@/components/PaatakaaSession'

// Käyttäjän ajossa luomat koodit → ei esigeneroida, aina dynaaminen.
export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

type Props = { params: Promise<{ koodi: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { koodi } = await params
  const code = koodi.toUpperCase()
  const title = `Liity päättämään · ${code} — Päättäkää yhdessä`
  const description = 'Swaippaa ehdotuksia ja päätetään yhdessä mitä tänään tehdään. AI kutoo äänistä valmiin illan kaaren.'
  const pageUrl = `${BASE}/paatakaa/${code}`
  const ogImageUrl = `${BASE}/api/og?title=${encodeURIComponent('Päättäkää yhdessä')}&location=${encodeURIComponent(`Koodi ${code}`)}`
  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    // Yksityinen jakosessio — ei indeksoida, mutta OG-esikatselu WhatsAppiin/somella.
    robots: { index: false, follow: false },
    openGraph: {
      title, description, type: 'website', locale: 'fi_FI', url: pageUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImageUrl] },
  }
}

export default async function PaatakaaKoodiPage({ params }: Props) {
  const { koodi } = await params
  return <PaatakaaSession code={koodi.toUpperCase()} />
}
