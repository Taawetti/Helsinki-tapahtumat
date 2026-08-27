// Kävijätilastot admin-näkymään.
//
// SUOJAUS: proxy.ts suojaa jo kaikki /api/admin-polut, ja requireAdmin on
// toinen kerros reitin sisällä — sama kuvio kuin muissa admin-reiteissä.
// Klikkidata ei ole julkista: click_events-taululla ei ole yhtään RLS-policyä,
// joten sitä voi lukea vain service_role-avaimella täältä.
//
// KOOSTE TEHDÄÄN JAVASCRIPTISSÄ, ei SQL:ssä. Supabasen JS-kirjastossa ei ole
// GROUP BY:tä, ja tietokantafunktio olisi vaatinut oman migraationsa. Rivit
// haetaan katolla ja lasketaan täällä. Tämä riittää nykyiseen määrään; jos
// rivejä kertyy yli katon, luvut alkavat vaieta ja silloin on aika tehdä
// koostetaulu. Siksi vastaus kertoo aina montako riviä luettiin ja osuiko
// katto — vaiettu vajaus olisi pahempi kuin puuttuva luku.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

const KATTO = 50000

interface Rivi { kind: string; surface: string | null; event_id: string | null; label: string | null; country: string | null; city: string | null; region: string | null }

/** Laskee esiintymät ja palauttaa suurimmat ensin. */
function top(rivit: Rivi[], avain: (r: Rivi) => string | null, n = 15) {
  const m = new Map<string, number>()
  for (const r of rivit) {
    const k = avain(r)
    if (!k) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([nimi, maara]) => ({ nimi, maara }))
}

export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) return authError
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 503 })
  }

  const paivat = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') ?? 30), 1), 365)
  const alkaen = new Date(Date.now() - paivat * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('click_events')
    .select('kind, surface, event_id, label, country, city, region')
    .gte('created_at', alkaen)
    .order('created_at', { ascending: false })
    .limit(KATTO)

  if (error) {
    // Tuttu tilanne: taulua ei ole vielä luotu Supabasessa.
    const puuttuu = /relation .* does not exist|schema cache/i.test(error.message)
    return NextResponse.json(
      { error: error.message, tauluPuuttuu: puuttuu },
      { status: puuttuu ? 424 : 500 },
    )
  }

  const rivit = (data ?? []) as Rivi[]
  const vain = (k: string) => rivit.filter((r) => r.kind === k)

  const maarat: Record<string, number> = {}
  for (const r of rivit) maarat[r.kind] = (maarat[r.kind] ?? 0) + 1

  return NextResponse.json({
    paivat,
    rivejaLuettu: rivit.length,
    kattoTayttyi: rivit.length >= KATTO,
    maarat,
    tapahtumatAvaukset: top(vain('event_open'), (r) => r.label),
    lippuklikit:        top(vain('ticket_click'), (r) => r.label),
    ulkoisetKlikit:     top(vain('external_click'), (r) => r.label),
    suosikit:           top(vain('favorite_add'), (r) => r.label),
    pinnat:             top(vain('event_open'), (r) => r.surface),
    osiot:              top(rivit.filter((r) => r.kind === 'section'), (r) => r.label),
    oppaat:             top(vain('guide_open'), (r) => r.label),
    kategoriat:         top(vain('category'), (r) => r.label),
    haut:               top(vain('search'), (r) => r.label, 25),
    // Maajakauma kaikista tapahtumista ja erikseen lippuklikeistä: nämä
    // vastaavat eri kysymyksiin ("mistä kävijät tulevat" vs "kuka oikeasti
    // aikoo ostaa"). Rivit joilta maa puuttuu jäävät pois top-listasta.
    maat:               top(rivit, (r) => r.country, 20),
    maatLippuklikit:    top(vain('ticket_click'), (r) => r.country, 20),
    ilmanMaata:         rivit.filter((r) => !r.country).length,
    // Paikkakunnat VAIN Suomesta: ulkomaiset kaupungit sekoittaisivat listan
    // eivätkä kerro kotimaisesta käytöstä mitään.
    kaupungitFI:        top(rivit.filter((r) => r.country === 'FI'), (r) => r.city, 25),
    kaupungitFILippu:   top(rivit.filter((r) => r.country === 'FI' && r.kind === 'ticket_click'), (r) => r.city, 15),
    // Maakunnat palautetaan RAAKANA koodi→määrä -parina, ei top-listana:
    // näkymä täydentää puuttuvat maakunnat nolliksi, jotta lista on aina
    // täydellinen. Top-lista jättäisi tyhjät maakunnat kokonaan pois eikä
    // omistaja näkisi mistä päin Suomea EI tulla.
    maakunnat: (() => {
      const m: Record<string, number> = {}
      for (const r of rivit) if (r.country === 'FI' && r.region) m[r.region] = (m[r.region] ?? 0) + 1
      return m
    })(),
    // Suurten kaupunkien luvut erikseen, myös nollat.
    kaupunkiMaarat: (() => {
      const m: Record<string, number> = {}
      for (const r of rivit) if (r.country === 'FI' && r.city) m[r.city] = (m[r.city] ?? 0) + 1
      return m
    })(),
  })
}
