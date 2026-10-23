// OSM-aktiviteettien otoksen päivittäinen päivitys — Vercel cron (vercel.json).
//
// Hakee Overpassista koko aktiviteettikannan (saunat, museot, galleriat,
// puistot, rannat…), tarkistaa ettei otos ole romahtanut ja vie sen Supabase
// Storageen, josta /api/activities ja oppaat (saunat, ilmaiset museot) lukevat
// sen millisekunneissa. Miksi näin: ks. lib/osm-aktiviteetit.ts — Overpass
// kesti 23.10.2026 yli 30 s eikä saunaopas vastannut enää lainkaan.
//
// Vajaa tai epäonnistunut haku EI koske varastoon: edellinen otos jää
// voimaan ja vastaus on 503, jolloin vika näkyy cronin lokissa.
//
// Itsetesti: curl -H "Authorization: Bearer $CRON_SECRET" https://mitatanaan.fi/api/cron/osm-otos

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { haeOsmAktiviteetit, tarkistaOtos, lueOtosVarastosta, kirjoitaOtosVarastoon } from '@/lib/osm-aktiviteetit'

export const dynamic = 'force-dynamic'
// Overpass: 60 s ensimmäiselle peilille, loput toiselle. Sama luokka kuin
// festival-watch ja scrape-venues (120).
export const maxDuration = 120

const EI_CACHEA = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()
  const edellinen = await lueOtosVarastosta()
  try {
    const haku = await haeOsmAktiviteetit({ budjettiMs: 100_000 })
    const lkm = (c: string) => haku.activities.filter((a) => a.category === c).length
    const yhteenveto = {
      kohteita: haku.activities.length,
      saunoja: lkm('sauna'),
      museoita: lkm('museo'),
      peili: new URL(haku.peili).host,
      yritykset: haku.yritykset.map((y) => ({ peili: new URL(y.peili).host, status: y.status, ms: y.ms, virhe: y.virhe })),
      edellinen: edellinen?.fetchedAt ?? null,
    }

    const tarkistus = tarkistaOtos(haku.activities, edellinen?.activities ?? null)
    if (!tarkistus.ok) {
      console.error('[osm-otos] otos hylätty:', tarkistus.syy)
      return NextResponse.json({ ok: false, syy: tarkistus.syy, ...yhteenveto, ms: Date.now() - t0 }, { status: 503, headers: EI_CACHEA })
    }

    const otos = { fetchedAt: new Date().toISOString(), peili: haku.peili, activities: haku.activities }
    const { tavua } = await kirjoitaOtosVarastoon(otos)
    // Reittipakettien unstable_cache-kopiot vanhoiksi: seuraava pyyntö saa
    // vanhan heti ja tuore otos luetaan taustalla (profile "max").
    revalidateTag('activities', 'max')
    console.log(`[osm-otos] otos päivitetty: ${yhteenveto.kohteita} kohdetta, ${yhteenveto.saunoja} saunaa, ${Math.round(tavua / 1024)} kt, ${yhteenveto.peili}`)
    return NextResponse.json({ ok: true, fetchedAt: otos.fetchedAt, tavua, ...yhteenveto, ms: Date.now() - t0 }, { headers: EI_CACHEA })
  } catch (e) {
    const virhe = e instanceof Error ? e.message : String(e)
    console.error('[osm-otos] päivitys epäonnistui:', virhe)
    return NextResponse.json({ ok: false, virhe, edellinen: edellinen?.fetchedAt ?? null, ms: Date.now() - t0 }, { status: 503, headers: EI_CACHEA })
  }
}
