import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { PubVisa, fetchVisas, PUBIVISAT_SOURCE_URL } from '@/lib/pubivisat'
import { helsinkiISO, helsinkiToday } from '@/lib/helsinki-time'
import { buildPlaceEnricher } from '@/lib/guide-data'
import koordData from '@/data/pubivisa-koordinaatit.json'

// Geokoodatut varakoordinaatit osoitteen katuosalla avainnettuna —
// generoitu scripts/geokoodaa-pubivisat.ts:llä (Nominatim, pk-seuturajaus).
// Ravintoladatan nimi+osoite-match on ensisijainen (tuoreempi), tämä kattaa
// baarit joita ravintoladatassa ei ole (mitattu 6.9.2026: 4/14 → 13/14).
const KOORDIT = koordData as Record<string, { lat: number; lon: number; name: string }>
function katuAvain(osoite: string): string {
  return osoite.toLowerCase().split(',')[0].trim().replace(/\s+/g, ' ')
}

function generateOccurrences(visa: PubVisa, startDate: Date, endDate: Date, index: number, koord: { lat: number; lon: number } | null): Event[] {
  const events: Event[] = []
  const cursor = new Date(startDate)
  cursor.setHours(0, 0, 0, 0)

  // Skip address cleanup — keep as-is, strip postal code for street display
  const streetAddress = visa.address.replace(/,?\s*\d{5}\s*\w+\s*$/, '').trim()

  while (cursor <= endDate) {
    if (cursor.getDay() === visa.weekday) {
      // Quiz times are Helsinki wall-clock — build the ISO with the Helsinki
      // offset so a 20.00 quiz doesn't shift to 23.00 on a UTC server.
      const y = cursor.getFullYear()
      const mo = cursor.getMonth() + 1
      const d = cursor.getDate()
      const startIso = helsinkiISO(y, mo, d, visa.hour, visa.minute)
      const endIso = new Date(new Date(startIso).getTime() + 2 * 60 * 60 * 1000).toISOString() // 2h default

      const dateKey = `${y}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}`
      events.push({
        id: `pubivisa-${index}-${dateKey}`,
        title: `Tietovisa – ${visa.name}`,
        shortDescription: `Viikoittainen tietovisa ${visa.name}ssa`,
        description: `Viikoittainen tietovisa. Lähde: pubivisat.fi`,
        startTime: startIso,
        endTime: endIso,
        location: {
          name: visa.name,
          streetAddress,
          city: 'Helsinki',
          // Koordinaatit ravintoladatasta (nimi+osoite-match): ilman niitä
          // pubivisat eivät näy kartalla lainkaan — kartan Baari-suodatin
          // näytti tyhjää vaikka listalla oli 15 baaritapahtumaa (omistajan
          // havainto 6.9.2026).
          ...(koord ? { lat: koord.lat, lon: koord.lon } : {}),
        },
        image: null,
        isFree: true,
        price: null,
        ticketUrl: null,
        infoUrl: PUBIVISAT_SOURCE_URL,
        categories: ['Tietovisa', 'Pubivisa', 'Baari'],
        source: 'linked-events',
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return events
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  // Oletus HELSINKI-päivä: UTC-päivä on yöllä 00–03 eilinen.
  const start = searchParams.get('start') || helsinkiToday()
  const end = searchParams.get('end') || start

  try {
    const [visas, enrich] = await Promise.all([
      fetchVisas(),
      // Koordinaatti-/kuvarikastus ravintoladatasta. Rikastajan sisäinen
      // try/catch takaa: jos /api/restaurants ei vastaa, visat palautuvat
      // silti (ilman koordinaatteja) eikä lähde kaadu.
      buildPlaceEnricher(req.nextUrl.origin),
    ])
    const startDate = new Date(start)
    const endDate = new Date(end)
    endDate.setHours(23, 59, 59, 999)

    const events: Event[] = visas.flatMap((v, i) => {
      const e = enrich(v.name, v.address)
      const vara = KOORDIT[katuAvain(v.address)]
      const koord = e && e.lat != null && e.lon != null
        ? { lat: e.lat, lon: e.lon }
        : vara
        ? { lat: vara.lat, lon: vara.lon }
        : null
      return generateOccurrences(v, startDate, endDate, i, koord)
    })
    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    return NextResponse.json({ events, total: events.length, source: 'pubivisat' })
  } catch (err) {
    console.error('pubivisat error:', err)
    return NextResponse.json({ events: [] })
  }
}
