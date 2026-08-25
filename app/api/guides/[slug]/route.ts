// Oppaiden data etusivun in-app-näkymälle (GuideInlineView). Sama data kuin
// SEO-sivuilla — molemmat kutsuvat lib/guide-data.ts:ää. Omistaja 25.8.2026:
// oppaat eivät saa viedä pois etusivunäkymästä.
import { NextRequest, NextResponse } from 'next/server'
import {
  buildFreeMuseums,
  buildPlaceEnricher,
  buildSaunaRows,
  fetchJamitEvents,
  fetchKirppisEvents,
  fetchTerraceEvents,
  mapSecondhandShops,
} from '@/lib/guide-data'
import { fetchVisas, nextOccurrenceISO } from '@/lib/pubivisat'
import { HELSINKI_NIGHTCLUBS } from '@/lib/helsinki-nightclubs'

export const maxDuration = 30

const CACHE = { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=600' }

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const origin = req.nextUrl.origin
  try {
    switch (slug) {
      case 'saunat':
        return NextResponse.json({ saunas: await buildSaunaRows() }, { headers: CACHE })
      case 'terassit': {
        // Kattoterassit ovat ravintoladatassa kuvineen ja arvosanoineen
        // (mitattu 5/5 kuva, 4/5 ★) — haetaan ne, muuten kortti jäisi
        // tekstijulisteeksi vaikka kuva on olemassa.
        const [enrich, events] = await Promise.all([buildPlaceEnricher(origin), fetchTerraceEvents()])
        const rooftops = HELSINKI_NIGHTCLUBS
          .filter((v) => v.subCategories.includes('katto'))
          .map((v) => {
            const e = enrich(v.name, v.address)
            return {
              name: v.name,
              address: v.address,
              www: v.www ?? e?.www ?? null,
              image: e?.image ?? null,
              rating: e?.rating ?? null,
            }
          })
        return NextResponse.json({ rooftops, events }, { headers: CACHE })
      }
      case 'pubivisat': {
        const [visas, enrich] = await Promise.all([fetchVisas(), buildPlaceEnricher(origin)])
        // Seuraava kerta valmiiksi laskettuna — asiakas saa suoraan
        // aikajärjestyksen ("tänään klo 19" ensin). Kuva/★/kotisivu
        // ravintoladatasta tiukalla nimi+osoite-matchilla (osumatta jäävä
        // rivi näytetään tekstijulisteena — parempi kuin väärä kuva).
        const rows = visas
          .map((v) => {
            const e = enrich(v.name, v.address)
            return {
              ...v,
              nextISO: nextOccurrenceISO(v),
              image: e?.image ?? null,
              rating: e?.rating ?? null,
              www: e?.www ?? null,
            }
          })
          .sort((a, b) => a.nextISO.localeCompare(b.nextISO))
        return NextResponse.json({ visas: rows }, { headers: CACHE })
      }
      case 'kirpputorit':
        return NextResponse.json(
          { shops: mapSecondhandShops(), events: await fetchKirppisEvents() },
          { headers: CACHE },
        )
      case 'jamit':
        return NextResponse.json({ events: await fetchJamitEvents() }, { headers: CACHE })
      case 'ilmaiset-museot':
        return NextResponse.json(await buildFreeMuseums(), { headers: CACHE })
      default:
        return NextResponse.json({ error: 'unknown guide' }, { status: 404 })
    }
  } catch {
    // Yksittäisen lähteen kaatuminen ei saa kaataa opasta kokonaan —
    // asiakas näyttää virheviestin ja tarjoaa uudelleenyritystä.
    return NextResponse.json({ error: 'guide fetch failed' }, { status: 502 })
  }
}
