// Open Mic Finland -jamit ja open mic -illat tapahtumavirtaan.
// Haku ja muunnos: lib/openmic.ts. Tämä reitti vain rajaa aikavälin,
// rikastaa paikkatiedoilla ja palauttaa saman muodon kuin muut lähteet.
import { NextRequest, NextResponse } from 'next/server'
import { haeOpenmicTapahtumat, type Koordinaatit } from '@/lib/openmic'
import { buildPlaceEnricher } from '@/lib/guide-data'
import { helsinkiToday } from '@/lib/helsinki-time'
import koordData from '@/data/openmic-koordinaatit.json'

// Geokoodatut koordinaatit (scripts/geokoodaa-openmic.ts, Nominatim,
// pk-seuturajaus) — rajapinta ei anna koordinaatteja (mitattu 0/50).
const KOORDIT = koordData as Koordinaatit

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  // Oletus HELSINKI-päivä: UTC-päivä on yöllä 00–03 eilinen.
  const start = searchParams.get('start') || helsinkiToday()
  const end = searchParams.get('end') || start

  try {
    // Kuva + koordinaatit ravintoladatasta: Storyville, Semifinal, Lazy Fox
    // ym. ovat baareja jotka ovat JO /api/restaurants-datassa kuvineen.
    // Rikastajan sisäinen try/catch takaa ettei lähde kaadu jos se ei vastaa.
    const enrich = await buildPlaceEnricher(req.nextUrl.origin)
    const events = await haeOpenmicTapahtumat(start, end, KOORDIT, enrich)

    return NextResponse.json({ events, total: events.length, source: 'openmic' })
  } catch (err) {
    console.error('openmic error:', err)
    return NextResponse.json({ events: [] })
  }
}
