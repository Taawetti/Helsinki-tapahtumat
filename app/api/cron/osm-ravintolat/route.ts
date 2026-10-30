// OSM-ravintolaotoksen päivittäinen päivitys — Vercel cron (vercel.json).
//
// Hakee Overpassista pääkaupunkiseudun ravintolat, kahvilat, baarit, pikaruoan
// ja yökerhot, tarkistaa ettei otos ole romahtanut ja vie sen Supabase
// Storageen, josta /api/restaurants lukee sen sekunnissa. Miksi näin: ks.
// lib/osm-ravintolat.ts — Overpass kesti 30.10.2026 35–60 s eikä
// Ravintolat-välilehti avautunut.
//
// Vajaa tai epäonnistunut haku EI koske varastoon: edellinen otos jää voimaan
// ja vastaus on 503, jolloin vika näkyy cronin lokissa. Pyyntöpolku pärjää
// silloin edellisellä otoksella tai repoon committoidulla pohjaotoksella.
//
// Itsetesti: curl -H "Authorization: Bearer $CRON_SECRET" https://mitatanaan.fi/api/cron/osm-ravintolat

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { haeOsmRavintolat, tarkistaRavintolaOtos, lueRavintolaOtosVarastosta, kirjoitaRavintolaOtosVarastoon } from '@/lib/osm-ravintolat'

export const dynamic = 'force-dynamic'
// Overpass: 60 s ensimmäiselle peilille, loput toiselle — sama kuin osm-otos.
export const maxDuration = 120

const EI_CACHEA = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()
  const edellinen = await lueRavintolaOtosVarastosta()
  try {
    const haku = await haeOsmRavintolat({ budjettiMs: 100_000 })
    const lkm = (...amenityt: string[]) => haku.elements.filter((e) => amenityt.includes(e.tags?.amenity ?? '')).length
    const yhteenveto = {
      kohteita: haku.elements.length,
      ravintoloita: lkm('restaurant'),
      kahviloita: lkm('cafe'),
      baareja: lkm('bar', 'pub', 'biergarten'),
      peili: new URL(haku.peili).host,
      yritykset: haku.yritykset.map((y) => ({ peili: new URL(y.peili).host, status: y.status, ms: y.ms, virhe: y.virhe })),
      edellinen: edellinen?.fetchedAt ?? null,
    }

    const tarkistus = tarkistaRavintolaOtos(haku.elements, edellinen?.elements ?? null)
    if (!tarkistus.ok) {
      console.error('[osm-ravintolat] otos hylätty:', tarkistus.syy)
      return NextResponse.json({ ok: false, syy: tarkistus.syy, ...yhteenveto, ms: Date.now() - t0 }, { status: 503, headers: EI_CACHEA })
    }

    const otos = { fetchedAt: new Date().toISOString(), peili: haku.peili, elements: haku.elements }
    const { tavua } = await kirjoitaRavintolaOtosVarastoon(otos)
    // /api/restaurants-reitin unstable_cache vanhaksi: seuraava pyyntö saa
    // vanhan heti ja tuore otos luetaan taustalla (profile "max").
    revalidateTag('restaurants', 'max')
    console.log(`[osm-ravintolat] otos päivitetty: ${yhteenveto.kohteita} kohdetta, ${yhteenveto.ravintoloita} ravintolaa, ${Math.round(tavua / 1024)} kt, ${yhteenveto.peili}`)
    return NextResponse.json({ ok: true, fetchedAt: otos.fetchedAt, tavua, ...yhteenveto, ms: Date.now() - t0 }, { headers: EI_CACHEA })
  } catch (e) {
    const virhe = e instanceof Error ? e.message : String(e)
    console.error('[osm-ravintolat] päivitys epäonnistui:', virhe)
    return NextResponse.json({ ok: false, virhe, edellinen: edellinen?.fetchedAt ?? null, ms: Date.now() - t0 }, { status: 503, headers: EI_CACHEA })
  }
}
