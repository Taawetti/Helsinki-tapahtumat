// Kävijätilastot admin-näkymään.
//
// SUOJAUS: proxy.ts suojaa jo kaikki /api/admin-polut, ja requireAdmin on
// toinen kerros reitin sisällä — sama kuvio kuin muissa admin-reiteissä.
// Klikkidata ei ole julkista: click_events-taululla ei ole yhtään RLS-policyä,
// joten sitä voi lukea vain service_role-avaimella täältä.
//
// KOOSTE TEHDÄÄN JAVASCRIPTISSÄ, ei SQL:ssä (lib/kavijatilastot). Supabasen
// JS-kirjastossa ei ole GROUP BY:tä, ja tietokantafunktio olisi vaatinut oman
// migraationsa. Rivit haetaan katolla ja lasketaan täällä. Tämä riittää
// nykyiseen määrään; jos rivejä kertyy yli katon, luvut alkavat vaieta ja
// silloin on aika tehdä koostetaulu. Siksi vastaus kertoo aina montako riviä
// luettiin ja osuiko katto — vaiettu vajaus olisi pahempi kuin puuttuva luku.
//
// JAKSO (25.10.2026): ?from=YYYY-MM-DD&to=YYYY-MM-DD Helsinki-päivinä, molemmat
// mukana. Vanha ?days=N toimii yhä ja tarkoittaa N viimeistä päivää tähän
// päivään asti. ?tapahtuma=<event_id> lisää tapahtumakohtaisen erittelyn.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { helsinkiToday } from '@/lib/helsinki-time'
import { koostaTilastot, ratkaiseJakso, helsinkiPaivanAlku, siirraPaivaa, type KlikkiRivi } from '@/lib/kavijatilastot'

const KATTO = 50000

export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) return authError
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 503 })
  }

  const q = req.nextUrl.searchParams
  const { from, to } = ratkaiseJakso({ from: q.get('from'), to: q.get('to'), days: q.get('days') }, helsinkiToday())
  const tapahtumaId = (q.get('tapahtuma') ?? '').trim().slice(0, 200) || null
  const alkaen = helsinkiPaivanAlku(from)
  const asti = helsinkiPaivanAlku(siirraPaivaa(to, 1))

  // SIVUITTAIN, EI YHDELLÄ KYSELYLLÄ. Supabase palauttaa yhdestä kyselystä
  // enintään 1 000 riviä riippumatta .limit()-arvosta (PostgREST max-rows).
  // Tämä huomattiin vasta tuotannossa 1.9.2026: kanta oli kasvanut 2 723
  // riviin, kooste luki niistä hiljaa vain 1 000 UUSINTA, ja "eri kävijää"
  // -luku PIENENI kun uudet rivit työnsivät vanhoja kävijöitä ikkunan yli —
  // ja koko "Sovelluksen lataus" -laatikko katosi, koska ainoa install-rivi
  // putosi tuhannen joukosta. kattoTayttyi ei varoittanut, koska 1 000 <
  // 50 000. Kiinteä järjestys (created_at + id) takaa etteivät sivut mene
  // limittäin kesken luvun saapuvien rivien kanssa.
  const SIVU = 1000
  const rows: KlikkiRivi[] = []
  let error: { message: string } | null = null
  for (let alku = 0; alku < KATTO; alku += SIVU) {
    const vastaus = await supabaseAdmin
      .from('click_events')
      .select('kind, surface, event_id, label, meta, country, city, region, visitor, created_at')
      .gte('created_at', alkaen)
      .lt('created_at', asti)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(alku, alku + SIVU - 1)
    if (vastaus.error) { error = vastaus.error; break }
    const era = (vastaus.data ?? []) as KlikkiRivi[]
    rows.push(...era)
    if (era.length < SIVU) break
  }

  if (error) {
    // Kaksi tuttua tilannetta, joissa syy on ajamaton migraatio eikä vika
    // koodissa: taulua ei ole luotu lainkaan, tai se on luotu vanhemmalla
    // versiolla jossa jokin sarake puuttuu. Molemmissa vastaus kertoo sen
    // selkokielellä, jottei omistaja joudu tulkitsemaan SQL-virhettä.
    const puuttuu = /relation .* does not exist|schema cache|column .* does not exist/i.test(error.message)
    return NextResponse.json(
      { error: error.message, tauluPuuttuu: puuttuu },
      { status: puuttuu ? 424 : 500 },
    )
  }

  return NextResponse.json({
    ...koostaTilastot(rows, { from, to, tapahtumaId }),
    rivejaLuettu: rows.length,
    kattoTayttyi: rows.length >= KATTO,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
