// CDN-välimuistin lämmitys — UptimeRobot kutsuu tätä 5 minuutin välein.
//
// MIKSI: /api/events kokoaa tapahtumat 46 lähteestä. CDN muistaa vastauksen
// 5 min (s-maxage=300) ja tarjoilee vanhaa vielä tunnin (stale-while-
// revalidate=3600). Jos jotakin aikaväliä ei ole kysytty yli tuntiin, käyttäjä
// osuu KYLMÄÄN hakuun: mitattu 24.9.2026 8–15 s (viikonloppu 8,7 s, viikko
// 15,2 s), lämpimänä 0,3–0,7 s. Kun tämä reitti hakee viisi päivächippien
// aikaväliä joka 5. minuutti, yksikään oikea käyttäjä ei osu kylmään.
//
// OSOITTEEN PITÄÄ OLLA MERKKI MERKILTÄ SAMA kuin selaimen pyyntö (parametrien
// järjestys mukaan lukien), muuten CDN-osuma ei synny — siksi
// lib/events-fetch lammitettavatParams, sama rakentaja kuin hooks/useEvents.
// Päivämäärät lasketaan tässä (Helsinki-aika), koska UptimeRobotille ei voi
// antaa joka päivä vaihtuvaa osoitetta.
//
// Tämä on PAIKKAUS: oikea ratkaisu on valmiiksi koottu tapahtumavarasto
// (ajastettu kokoaminen 10 min välein, haku lukee varastosta) — päätetty
// tehdä myöhemmin (omistaja 24.9.2026).

import { NextRequest, NextResponse } from 'next/server'
import { lammitettavatParams } from '@/lib/events-fetch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Apex on kanoninen (mitatanaan.fi); www ohjautuu siihen. Lämmitys osoitetaan
// julkiseen osoitteeseen, jotta pyyntö kulkee CDN:n läpi — suora funktiokutsu
// ei täyttäisi reunavälimuistia. Paikallisesti (localhost) käytetään omaa
// osoitetta, jotta reitin voi testata ilman tuotantoa.
function lahtoOsoite(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  if (host.startsWith('localhost') || host.startsWith('127.')) return `http://${host}`
  return process.env.WARM_ORIGIN ?? 'https://mitatanaan.fi'
}

export async function GET(req: NextRequest) {
  const origin = lahtoOsoite(req)
  const alku = Date.now()
  const tulokset = await Promise.all(
    lammitettavatParams().map(async ({ filter, params }) => {
      const url = `${origin}/api/events?${params}`
      const t0 = Date.now()
      try {
        // Ei erikoisotsakkeita: pyynnön pitää näyttää selaimen pyynnöltä, jotta
        // CDN tallentaa sen samalla avaimella. Runko luetaan loppuun asti, jotta
        // välimuisti saa koko vastauksen.
        const res = await fetch(url, { signal: AbortSignal.timeout(45_000), cache: 'no-store' })
        const body = await res.text()
        return { filter, ok: res.ok, status: res.status, ms: Date.now() - t0, bytes: body.length, cache: res.headers.get('x-vercel-cache') ?? null }
      } catch (e) {
        return { filter, ok: false, status: 0, ms: Date.now() - t0, bytes: 0, cache: null, error: e instanceof Error ? e.name : String(e) }
      }
    }),
  )
  const kaikkiOk = tulokset.every((t) => t.ok)
  // 503 kun jokin ikkuna ei vastannut: UptimeRobotin hälytys kertoo silloin
  // tapahtuma-API:n viasta, ei tämän reitin.
  return NextResponse.json(
    { ok: kaikkiOk, ms: Date.now() - alku, ikkunat: tulokset },
    { status: kaikkiOk ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
