// GET /api/kuvaus?id=<tunniste>&d=YYYY-MM-DD → { id, description, shortDescription }
//
// Yhden tapahtuman kuvaus kartan kevyelle riville (lib/kuvaus, perustelut
// siellä). LinkedEvents-tunnisteet haetaan LinkedEventsistä (datavälimuisti
// 1 h), muut lähdevaraston päivän palasta (jsonb-sisältyvyys: vain se rivi,
// jossa tunniste on). Ei löytynyt → 404 ja paneeli käyttää varareittiään
// (päivän kooste), joten tämä reitti ei voi tehdä mistään huonompaa kuin
// ennen. Reunavälimuisti tunti: kuvaukset muuttuvat harvoin.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { TAULU, palanAlku } from '@/lib/lahdevarasto'
import type { Event } from '@/lib/types'
import {
  kelpoKuvausPyynto, onLinkedEventsId, kuvattavaLeRaakadatasta, kuvattavaTapahtumasta, kuvausVastaus,
  type LeKuvausRaaka, type KuvausVastaus,
} from '@/lib/kuvaus'
import type { TapahtumakorjausTiedosto } from '@/lib/tapahtumakorjaukset'
import tapahtumakorjaukset from '@/data/tapahtumakorjaukset.json'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

const LE_BASE = 'https://api.hel.fi/linkedevents/v1'
const KORJAUKSET = (tapahtumakorjaukset as TapahtumakorjausTiedosto).korjaukset
const LOYTYI = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
// Lyhyt: ohimenevä LinkedEvents-häiriö ei saa jäädä tunniksi "ei löydy" -vastaukseksi.
const EI_LOYTYNYT = 'public, max-age=60, s-maxage=300'

async function linkedEventsista(id: string): Promise<KuvausVastaus | null> {
  const res = await fetch(`${LE_BASE}/event/${encodeURIComponent(id)}/?format=json`, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const raw = (await res.json()) as LeKuvausRaaka
  if (!raw || typeof raw.id !== 'string' || typeof raw.start_time !== 'string') return null
  return kuvausVastaus(kuvattavaLeRaakadatasta(raw), KORJAUKSET)
}

async function lahdevarastosta(id: string, paiva: string): Promise<KuvausVastaus | null> {
  if (!supabaseAdmin) return null
  // jsonb @> '[{"id":"…"}]' — merkkijonona, jotta postgrest-js ei tulkitse
  // taulukkoa Postgres-taulukoksi (cs.{…}) vaan JSON-sisältyvyydeksi.
  const { data, error } = await supabaseAdmin
    .from(TAULU)
    .select('tapahtumat')
    .eq('alku', palanAlku(paiva))
    .contains('tapahtumat', JSON.stringify([{ id }]))
    .limit(1)
  if (error || !data?.[0]) return null
  const tapahtumat = ((data[0] as { tapahtumat?: Event[] }).tapahtumat ?? [])
  const e = tapahtumat.find((x) => x && x.id === id)
  return e ? kuvausVastaus(kuvattavaTapahtumasta(e), KORJAUKSET) : null
}

export async function GET(req: NextRequest) {
  const p = kelpoKuvausPyynto(req.nextUrl.searchParams.get('id'), req.nextUrl.searchParams.get('d'))
  if (!p) {
    return NextResponse.json({ error: 'id ja d (YYYY-MM-DD) vaaditaan' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  let vastaus: KuvausVastaus | null = null
  try {
    vastaus = onLinkedEventsId(p.id) ? await linkedEventsista(p.id) : await lahdevarastosta(p.id, p.paiva)
  } catch {
    vastaus = null
  }
  if (!vastaus) return NextResponse.json({ error: 'ei löytynyt' }, { status: 404, headers: { 'Cache-Control': EI_LOYTYNYT } })
  return NextResponse.json(vastaus, { headers: { 'Cache-Control': LOYTYI } })
}
