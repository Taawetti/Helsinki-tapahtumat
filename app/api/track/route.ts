// Kävijätapahtumien vastaanotto.
//
// MIKSI OMA REITTI. Selain ei kirjoita Supabaseen missään tässä projektissa —
// kaikilla tauluilla on RLS päällä eikä yhdelläkään ole INSERT-policyä, joten
// kirjoitus tapahtuu aina palvelinpuolelta service_role-avaimella. Tämä reitti
// noudattaa samaa kuviota kuin /api/subscribe ja /api/translate.
//
// EI TALLENNETA TUNNISTETTA. Rivit eivät sisällä laite-, istunto- eikä
// käyttäjätunnistetta eikä IP-osoitetta. Ilman tunnistetta data ei ole
// henkilötietoa, jolloin tietosuojaselostetta ei tarvitse muuttaa eikä
// evästesuostumusta kysyä. Jos tähän joskus lisätään tunniste, seloste on
// päivitettävä samalla — ks. sql/create-click-events.sql.
//
// JULKINEN REITTI = ROSKAPOSTIRISKI. Projektissa ei ole rate limitointia
// missään, joten suojaus tehdään muodolla: sallittu joukko tapahtumatyyppejä,
// katto erän koolle ja pituusrajat jokaiselle kentälle. Tuntematon tyyppi
// pudotetaan hiljaa — vastaus on silti ok, jottei mittaus koskaan riko
// sovellusta eikä robotti saa vihjettä siitä mikä sen pysäytti.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/** Sallitut tapahtumatyypit. Vapaa teksti kelpaisi kenelle tahansa roskan
 *  syöttäjälle ja tekisi raporteista lukukelvottomia. */
const SALLITUT = new Set([
  'event_open',      // tapahtuman tietopaneeli avattiin
  'ticket_click',    // ulos lippukauppaan (canBuyTickets = true)
  'external_click',  // ulos muualle (lue lisää, paikan sivu, haku)
  'favorite_add',    // tapahtuma tallennettiin suosikiksi
  'section',         // sovelluksen osio avattiin (tapahtumat/idea/ravintolat/uutta)
  'guide_open',      // opas avattiin
  'category',        // kategoria- tai tunnelmasuodatin valittiin
  'search',          // haku tehtiin
  'map_open',        // kartta avattiin
  'install',         // sovellus asennettiin
  'newsletter',      // uutiskirje tilattiin
])

const MAX_ERA = 20
const MAX_PITUUS = 200

const siisti = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\s+/g, ' ')
  return s ? s.slice(0, MAX_PITUUS) : null
}

interface Rivi { kind: string; surface: string | null; event_id: string | null; label: string | null; meta: string | null }

export async function POST(req: NextRequest) {
  let body: { events?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const era = Array.isArray(body.events) ? body.events.slice(0, MAX_ERA) : []
  const rivit: Rivi[] = []

  for (const raw of era) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const kind = siisti(e.kind)
    if (!kind || !SALLITUT.has(kind)) continue
    rivit.push({
      kind,
      surface: siisti(e.surface),
      event_id: siisti(e.eventId),
      label: siisti(e.label),
      meta: siisti(e.meta),
    })
  }

  if (rivit.length === 0) return NextResponse.json({ ok: true })

  if (!supabaseAdmin) {
    console.error('[track] SUPABASE_SERVICE_ROLE_KEY puuttuu')
    // Mittaus ei saa koskaan näkyä käyttäjälle virheenä.
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabaseAdmin.from('click_events').insert(rivit)
  if (error) console.error('[track] insert:', error.message)

  return NextResponse.json({ ok: true })
}
