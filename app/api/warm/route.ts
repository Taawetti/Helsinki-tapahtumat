// Lähdevaraston rakennus + CDN-välimuistin lämmitys — Vercel cron ja
// UptimeRobot kutsuvat tätä 5 minuutin välein.
//
// 1) RAKENNUS (12.10.2026): lib/lahdevarasto rakennaVarasto hakee erääntyneet
//    (lähde, 10 pv pala) -parit 45 ulkoisesta lähteestä Supabaseen. Kooste
//    (/api/events) lukee ne sieltä yhdellä kyselyllä eikä enää kutsu lähteitä
//    joka pyynnöllä. Kaksi rinnakkaista kutsujaa eivät hae samaa paria
//    (varaus yritetty-leimalla). Budjetti 30 s, jotta lämmitys mahtuu samaan
//    60 s funktioon.
//
// 2) LÄMMITYS: CDN muistaa koosteen 5 min (s-maxage=300) ja tarjoilee vanhaa
//    vielä tunnin (stale-while-revalidate=3600). Lämmitys pitää viisi
//    päivächippien aikaväliä reunalla, ja LinkedEventsin päiväpalat Vercelin
//    datavälimuistissa — kylmä LinkedEvents-haku oli mitatusti 8–15 s
//    (24.9.2026). Varaston ansiosta lämmitys ei enää laukaise lähdekutsuja.
//
// OSOITTEEN PITÄÄ OLLA MERKKI MERKILTÄ SAMA kuin selaimen pyyntö (parametrien
// järjestys mukaan lukien), muuten CDN-osuma ei synny — siksi
// lib/events-fetch lammitettavatParams, sama rakentaja kuin hooks/useEvents.
// Päivämäärät lasketaan tässä (Helsinki-aika), koska UptimeRobotille ei voi
// antaa joka päivä vaihtuvaa osoitetta.
//
// 3) NOSTOPÄIVÄT (3.11.2026): aktiivisen kärkinoston (data/nostot.json) päivän
//    ikkuna ja tapahtuman jakosivu (/e/<id>?d=P) lämmitetään samalla. Jannan
//    jakosivu aukesi hiljaisen jakson jälkeen 7–10 s (LinkedEventsin päivä-
//    sivu kylmänä), ja Instagram-tarinasta tuleva katsoja ei odota sitä.
//    Päivä putoaa lämmityksestä itsestään, kun nosto päättyy. Nostojen tulos
//    ei vaikuta ok-tilaan: ne ovat lisä, eivät terveysmittari. ?vain=nostot
//    ajaa vain tämän osan (paikallinen testaus ilman varaston rakennusta).

import { NextRequest, NextResponse } from 'next/server'
import { lammitettavatParams } from '@/lib/events-fetch'
import { rakennaVarasto } from '@/lib/lahdevarasto'
import { aktiivisetNostot, nostonLammitysOsoitteet, type NostoTiedosto } from '@/lib/nostot'
import { helsinkiToday } from '@/lib/helsinki-time'
import type { Event } from '@/lib/types'
import nostoData from '@/data/nostot.json'

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

interface NostoLammitys {
  id: string
  paiva: string
  ikkuna: { ok: boolean; status: number; ms: number; cache: string | null }
  sivu: { url: string; ok: boolean; status: number; ms: number } | null
  error?: string
}

// Aikakatkaisut 12 s + 12 s: rakennus (30 s) + nosto (24 s) mahtuu 60 s funktioon.
async function lammitaNostot(origin: string): Promise<NostoLammitys[]> {
  const aktiiviset = aktiivisetNostot((nostoData as NostoTiedosto).nostot, helsinkiToday())
  return Promise.all(aktiiviset.map(async (n): Promise<NostoLammitys> => {
    const paiva = n.osuma.paiva
    const { ikkuna: ikkunaUrl } = nostonLammitysOsoitteet(n, [], origin)
    const t0 = Date.now()
    try {
      const res = await fetch(ikkunaUrl, { signal: AbortSignal.timeout(12_000), cache: 'no-store' })
      const body = await res.text()
      const ikkuna = { ok: res.ok, status: res.status, ms: Date.now() - t0, cache: res.headers.get('x-vercel-cache') ?? null }
      let events: Event[] = []
      try { events = (JSON.parse(body) as { events?: Event[] }).events ?? [] } catch { /* ikkuna vastasi muuta kuin JSONia */ }
      const { sivu } = nostonLammitysOsoitteet(n, events, origin)
      if (!sivu) return { id: n.id, paiva, ikkuna, sivu: null }
      const t1 = Date.now()
      const r2 = await fetch(sivu, { signal: AbortSignal.timeout(12_000), cache: 'no-store' })
      await r2.text()
      return { id: n.id, paiva, ikkuna, sivu: { url: sivu, ok: r2.ok, status: r2.status, ms: Date.now() - t1 } }
    } catch (e) {
      return { id: n.id, paiva, ikkuna: { ok: false, status: 0, ms: Date.now() - t0, cache: null }, sivu: null, error: e instanceof Error ? e.name : String(e) }
    }
  }))
}

/** Hakuikkunan 10 sivua lämmitetään joka kolmannella kierroksella (15 min),
 *  ei joka viides minuutti: jokainen sivu lukee omat palansa Supabasen
 *  lähdevarastosta, ja kaikki 10 sivua ovat n. 1,5 × koko 90 pv aineisto
 *  (7,8 MB, mitattu 4.11.2026) — joka kierroksella se olisi kaksinkertaistanut
 *  lämmityksen Supabase-liikenteen. Reuna tarjoaa 5 min vanhemman sivun heti
 *  (stale-while-revalidate 1 h) ja päivittää sen taustalla, joten 15 min
 *  väli ei näy hakijalle. Minuutti tarkistetaan 5 min lohkona, jotta cronin
 *  muutaman sekunnin myöhästyminen ei pudota kierrosta. */
function hakusivutTallaKierroksella(nyt: Date = new Date()): boolean {
  return Math.floor(nyt.getUTCMinutes() / 5) % 3 === 0
}

export async function GET(req: NextRequest) {
  const origin = lahtoOsoite(req)
  const alku = Date.now()
  const vainNostot = req.nextUrl.searchParams.get('vain') === 'nostot'
  // Rakennus ENSIN. Lähdekutsut JULKISEEN osoitteeseen (sama kuin lämmitys),
  // EI req.nextUrl.originiin: Vercelin cron kutsuu reittiä deployment-URL:lla,
  // joka on "Protected by Vercel Authentication" — sisäinen fetch siihen saa
  // kirjautumissivun, ja 40/45 lähdehakua kaatui SyntaxErroriin cronin
  // ensimmäisellä ajolla 13.10.2026 klo 19.00 UTC. Taulun puute tai
  // Supabase-virhe ei kaada lämmitystä — kooste toimii silloin suoralla
  // haulla kuten ennen, ja varasto-kenttä kertoo syyn. maxHaut 60: tasainen
  // tarve on ~48 paria / 5 min (tämän päivän pala 10 min välein ×45 jne.).
  const varasto = vainNostot ? null : await rakennaVarasto({ origin, budjettiMs: 30_000, maxHaut: 60 })
  const [tulokset, nostot] = await Promise.all([Promise.all(
    (vainNostot ? [] : lammitettavatParams('helsinki', { hakusivut: hakusivutTallaKierroksella() })).map(async ({ filter, params }) => {
      const url = `${origin}/api/events?${params}`
      const t0 = Date.now()
      try {
        // Ei erikoisotsakkeita: pyynnön pitää näyttää selaimen pyynnöltä, jotta
        // CDN tallentaa sen samalla avaimella. Runko luetaan loppuun asti, jotta
        // välimuisti saa koko vastauksen.
        const res = await fetch(url, { signal: AbortSignal.timeout(25_000), cache: 'no-store' })
        const body = await res.text()
        return { filter, ok: res.ok, status: res.status, ms: Date.now() - t0, bytes: body.length, cache: res.headers.get('x-vercel-cache') ?? null }
      } catch (e) {
        return { filter, ok: false, status: 0, ms: Date.now() - t0, bytes: 0, cache: null, error: e instanceof Error ? e.name : String(e) }
      }
    }),
  ), lammitaNostot(origin)])
  const kaikkiOk = tulokset.every((t) => t.ok)
  // 503 kun jokin ikkuna ei vastannut: UptimeRobotin hälytys kertoo silloin
  // tapahtuma-API:n viasta, ei tämän reitin.
  return NextResponse.json(
    { ok: kaikkiOk, ms: Date.now() - alku, varasto, ikkunat: tulokset, nostot },
    { status: kaikkiOk ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
