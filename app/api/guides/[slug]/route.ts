// Oppaiden data etusivun in-app-näkymälle (GuideInlineView). Sama data kuin
// SEO-sivuilla — molemmat kutsuvat lib/guide-data.ts:n buildGuidePayloadia.
// Omistaja 25.8.2026: oppaat eivät saa viedä pois etusivunäkymästä.
//
// Kytkinlogiikka asui aiemmin tässä tiedostossa. Se siirrettiin guide-dataan
// 26.8.2026, kun opassivut muutettiin avautumaan sovellusnäkymään ja nekin
// tarvitsivat saman paketin palvelimella haettuna. Kaksi kopiota olisi
// ajautunut erilleen: sovellus näyttäisi yhtä ja hakukone toista.
import { NextRequest, NextResponse } from 'next/server'
import { buildGuidePayload, type GuideDataSlug } from '@/lib/guide-data'

export const maxDuration = 30

const CACHE = { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=600' }

const SLUGS: GuideDataSlug[] = ['saunat', 'terassit', 'pubivisat', 'kirpputorit', 'jamit', 'ilmaiset-museot']

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!SLUGS.includes(slug as GuideDataSlug)) {
    return NextResponse.json({ error: 'unknown guide' }, { status: 404 })
  }
  try {
    return NextResponse.json(await buildGuidePayload(slug as GuideDataSlug, req.nextUrl.origin), { headers: CACHE })
  } catch {
    // Yksittäisen lähteen kaatuminen ei saa kaataa opasta kokonaan —
    // asiakas näyttää virheviestin ja tarjoaa uudelleenyritystä.
    return NextResponse.json({ error: 'guide fetch failed' }, { status: 502 })
  }
}
