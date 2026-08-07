import type { Metadata } from 'next'
import PaatakaaSession from '@/components/PaatakaaSession'
import { supabase } from '@/lib/supabase'
import type { GroupResult } from '@/lib/group'

// Käyttäjän ajossa luomat koodit → ei esigeneroida, aina dynaaminen.
export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

type Props = { params: Promise<{ koodi: string }> }

// Kun sessio on päätetty, OG-esikatselu näyttää itse tuloksen (kaaren vaiheet /
// voittajan) → jaettu linkki WhatsAppissa näyttää aidolta suunnitelmalta.
async function fetchResult(code: string): Promise<GroupResult | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('group_sessions')
      .select('status, result_plan')
      .eq('id', code)
      .maybeSingle()
    if (data?.status !== 'done' || !data.result_plan) return null
    return data.result_plan as GroupResult
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { koodi } = await params
  const code = koodi.toUpperCase()

  const result = await fetchResult(code)

  let title = `Liity päättämään · ${code} — Päättäkää yhdessä`
  let description = 'Swaippaa ehdotuksia ja päätetään yhdessä mitä tänään tehdään. Äänistä syntyy valmis illan kaari aikatauluineen.'

  if (result?.kind === 'arc' && result.arc.length > 0) {
    const stops = result.arc.map(s => s.title).slice(0, 3).join(' → ')
    title = `Teidän iltanne 🎉 · ${code}`
    description = `Ryhmän yhteinen suunnitelma: ${stops}${result.arc.length > 3 ? ' → …' : ''}. Tehty Mitä tänään -palvelun Päättäkää yhdessä -toiminnolla.`
  } else if (result?.kind === 'quick') {
    title = `${result.title} — päätös tehty! 🎉`
    description = `Ryhmä valitsi yhdessä: ${result.title}. Tehty Mitä tänään -palvelun Päättäkää yhdessä -toiminnolla.`
  }

  const pageUrl = `${BASE}/paatakaa/${code}`
  // Omistettu julistereitti — hakee tuloksen itse kannasta (arc/quick/yleinen).
  const ogImageUrl = `${BASE}/api/og/paatakaa/${code}`
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
