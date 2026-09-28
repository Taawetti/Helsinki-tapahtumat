// Jaetun tapahtumalinkin ratkaisu palvelimella (vain palvelinkoodiin).
//
// /e/[id] avaa sovelluksen infokortin. Tapahtuma löytyy kolmesta paikasta:
//  1. oma lähdesivu (LinkedEvents, Ticketmaster, festivaali) — app/e/[id]
//  2. jakohetken tilannekuva (jaetut_tapahtumat, ks. sql/create-jaetut-tapahtumat.sql)
//  3. sovelluksen oma kooste jakolinkin päivälle (?d=YYYY-MM-DD)
// Tämä moduuli hoitaa kohdat 2 ja 3.

import type { Event } from './types'
import { supabaseAdmin } from './supabase'
import { etsiTapahtuma, normalisoiAjat } from './event-page'

/** Julkinen osoite, jonka kautta kooste haetaan CDN:n läpi (sama syy kuin
 *  app/api/warm: suora funktiokutsu ohittaisi reunavälimuistin). Paikallisesti
 *  oma osoite, jotta sivun voi testata ilman tuotantoa. */
export function julkinenOsoite(host: string | null | undefined): string {
  const h = host ?? ''
  if (h.startsWith('localhost') || h.startsWith('127.')) return `http://${h}`
  return process.env.WARM_ORIGIN ?? 'https://mitatanaan.fi'
}

/** Tapahtuma koosteesta yhdelle päivälle. Parametrijärjestys on sama kuin
 *  selaimen omassa haussa (start, end, page, municipality), jotta CDN-osuma
 *  syntyy kun lähettäjä on juuri ladannut saman päivän. */
export async function haeKoosteesta(origin: string, paiva: string, id: string): Promise<Event | null> {
  const params = new URLSearchParams({ start: paiva, end: paiva, page: '1', municipality: 'helsinki' })
  try {
    const res = await fetch(`${origin}/api/events?${params}`, { signal: AbortSignal.timeout(45_000), next: { revalidate: 300 } })
    if (!res.ok) return null
    const data = (await res.json()) as { events?: Event[] }
    const ev = etsiTapahtuma(data.events ?? [], id)
    return ev ? normalisoiAjat(ev) : null
  } catch {
    return null
  }
}

/** Jakohetken tilannekuva. Puuttuva taulu tai rivi → null hiljaa: sivu
 *  jatkaa koosteeseen. */
export async function lueJaettuTilannekuva(id: string): Promise<Event | null> {
  if (!supabaseAdmin) return null
  try {
    const { data, error } = await supabaseAdmin.from('jaetut_tapahtumat').select('tapahtuma').eq('id', id).maybeSingle()
    if (error || !data?.tapahtuma) return null
    const ev = data.tapahtuma as Partial<Event>
    if (typeof ev.id !== 'string' || typeof ev.title !== 'string' || typeof ev.startTime !== 'string') return null
    return normalisoiAjat(ev as Event)
  } catch {
    return null
  }
}

/** Tallentaa palvelimen omasta koosteesta löydetyn tapahtuman. */
export async function tallennaJaettuTilannekuva(ev: Event, paiva: string): Promise<boolean> {
  if (!supabaseAdmin) return false
  const { error } = await supabaseAdmin
    .from('jaetut_tapahtumat')
    .upsert({ id: ev.id, paiva, tapahtuma: ev, jaettu_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) { console.warn('[jaa-tapahtuma] tallennus:', error.message); return false }
  return true
}
