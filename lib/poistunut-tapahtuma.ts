// Kalenterista POISTETUN tapahtuman tunnistus jakosivulle /e/<id> (6.11.2026).
//
// MIKSI. Kaupungin tapahtumakalenteri (LinkedEvents) poistaa ja korvaa
// tapahtumia jatkuvasti. Poistetun tapahtuman oma sivu näytti ennen
// virhesivun, ja Googlesta tullut kävijä lähti: "Helsingin Joulunavaus"
// avattiin 13 kertaa viikossa ennen kuin kalenteri poisti sen 5.11.2026,
// vaikka sama tapahtuma oli sovelluksessa toisesta lähteestä nimellä
// "Aleksin joulukadun avajaiset".
//
// MITEN. LinkedEvents vastaa poistetulle tapahtumalle 410 eikä kerro nimeä.
// Listakysely show_deleted=true kertoo kaksi asiaa: onko tapahtuma poistettu
// ja korvaako sen jokin toinen (replaced_by). Korvattu ohjataan pysyvästi
// korvaajan sivulle. Muuten sovellus avautuu ilmoituksella, ja haku tehdään
// viimeisimmällä tunnetulla nimellä: jakohetken tilannekuva tai oma
// avausseuranta (click_events.label), joka tallentaa avatun tapahtuman nimen.
//
// Vain kalenterin NIMENOMAINEN "poistettu" laukaisee tämän. Katko, aikakatkaisu
// tai tuntematon tunniste palauttaa null, ja jakosivu jatkaa kuten ennen
// (tilannekuva, kooste, lopuksi virhesivu) — käynnissä olevaa tapahtumaa ei saa
// koskaan näyttää poistettuna vain siksi, että kalenteri ei vastannut.

import { supabaseAdmin } from '@/lib/supabase'
import { lueJaettuTilannekuva } from '@/lib/jaettu-tapahtuma'

const LE_BASE = 'https://api.hel.fi/linkedevents/v1'

/** LinkedEvents-tunniste "helsinki:agqwhasyyu" — sama muoto kuin
 *  lib/event-links hasOwnEventPage hyväksyy omaksi sivuksi. */
const LE_TUNNISTE = /^[a-z_]+:[a-z0-9]+$/i

export function onLinkedEventsTunniste(id: string): boolean {
  return LE_TUNNISTE.test(id)
}

/** replaced_by voi olla tunniste ("helsinki:abc") tai rajapinnan osoite
 *  (".../event/helsinki:abc/"). Palauttaa kelvollisen, eri tunnisteen tai null. */
export function korvaajanTunniste(replacedBy: unknown, omaId: string): string | null {
  if (typeof replacedBy !== 'string' || !replacedBy.trim()) return null
  const s = replacedBy.trim()
  const osoitteesta = s.match(/\/event\/([^/?#]+)\/?(?:[?#].*)?$/)
  let id = osoitteesta ? osoitteesta[1] : s
  try { id = decodeURIComponent(id) } catch { return null }
  if (!onLinkedEventsTunniste(id) || id === omaId) return null
  return id
}

export interface Poistotila { poistettu: boolean; korvaaja: string | null }

/** Kalenterin tila tunnisteelle. null = ei tiedetä (katko, tuntematon
 *  tunniste, vastaus ei tunnistettavassa muodossa). */
export async function haeLinkedEventsPoistotila(id: string): Promise<Poistotila | null> {
  if (!onLinkedEventsTunniste(id)) return null
  try {
    const params = new URLSearchParams({ ids: id, show_deleted: 'true', format: 'json' })
    const res = await fetch(`${LE_BASE}/event/?${params}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { data?: { id?: string; deleted?: boolean; replaced_by?: unknown }[] }
    const rivi = (j.data ?? []).find((r) => r?.id === id)
    if (!rivi || typeof rivi.deleted !== 'boolean') return null
    return { poistettu: rivi.deleted, korvaaja: rivi.deleted ? korvaajanTunniste(rivi.replaced_by, id) : null }
  } catch {
    return null
  }
}

/** Siistii nimen näytettäväksi; hylkää kalenterin poistomerkinnät. */
export function siistiNimi(nimi: unknown): string | null {
  if (typeof nimi !== 'string') return null
  const s = nimi.replace(/\s+/g, ' ').trim()
  if (s.length < 2 || /^(poistettu|raderad|deleted)$/i.test(s)) return null
  return s.length > 120 ? `${s.slice(0, 119).trimEnd()}…` : s
}

/** Viimeisin tunnettu nimi: jakohetken tilannekuva, sitten oma avausseuranta.
 *  Seuranta tallentaa avatun tapahtuman nimen (label), joten jokaisella
 *  tapahtumalla, jonka joku on avannut, on nimi tallessa. */
export async function viimeisinTunnettuNimi(id: string): Promise<string | null> {
  const tilannekuva = await lueJaettuTilannekuva(id).catch(() => null)
  const kuvasta = siistiNimi(tilannekuva?.title)
  if (kuvasta) return kuvasta
  if (!supabaseAdmin) return null
  try {
    const { data, error } = await supabaseAdmin
      .from('click_events')
      .select('label')
      .eq('event_id', id)
      .not('label', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(4000))
    if (error) return null
    return siistiNimi(data?.[0]?.label)
  } catch {
    return null
  }
}
