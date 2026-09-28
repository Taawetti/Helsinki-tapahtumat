// Jaon tilannekuva. Kun käyttäjä jakaa tapahtuman (Jaa / WhatsApp / Kopioi),
// selain ilmoittaa VAIN tunnisteen ja päivän. Palvelin hakee tapahtuman
// omasta koosteestaan ja tallentaa sen jaetut_tapahtumat-tauluun, jotta
// /e/[id] avaa kortin myös kun tapahtuma on jo poistunut koosteesta
// (mennyt, lähde muuttui, dedup valitsi toisen tunnisteen).
//
// TURVALLISUUS: selaimen lähettämää sisältöä ei tallenneta koskaan. Muuten
// kuka tahansa voisi julkaista mitatanaan.fi/e/… -osoitteessa mielivaltaista
// tekstiä ja linkkejä. Palvelimen oma kooste on totuus.
//
// Selain kutsuu tätä fire-and-forget (keepalive): jako ei odota vastausta,
// ja jos tallennus epäonnistuu, linkki toimii silti koosteen kautta (?d=).

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { kelpoJakoId, kelpoPaiva } from '@/lib/event-page'
import { haeKoosteesta, julkinenOsoite, tallennaJaettuTilannekuva } from '@/lib/jaettu-tapahtuma'

export const dynamic = 'force-dynamic'
// Kylmä kooste voi kestää 8–15 s (46 lähdettä) — selain ei odota tätä.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!rateLimit(`jaa-tapahtuma:${clientIp(req)}`, 30, 60 * 60_000)) {
    return NextResponse.json({ error: 'Liian monta jakoa. Yritä myöhemmin.' }, { status: 429 })
  }
  const body = (await req.json().catch(() => null)) as { id?: unknown; d?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : ''
  const d = typeof body?.d === 'string' ? body.d : ''
  if (!kelpoJakoId(id) || !kelpoPaiva(d)) return NextResponse.json({ error: 'Puutteelliset tiedot' }, { status: 400 })

  const origin = julkinenOsoite(req.headers.get('x-forwarded-host') ?? req.headers.get('host'))
  const ev = await haeKoosteesta(origin, d, id)
  if (!ev) return NextResponse.json({ error: 'Tapahtumaa ei löytynyt koosteesta' }, { status: 404 })
  const ok = await tallennaJaettuTilannekuva(ev, d)
  return NextResponse.json({ ok }, { headers: { 'Cache-Control': 'no-store' } })
}
