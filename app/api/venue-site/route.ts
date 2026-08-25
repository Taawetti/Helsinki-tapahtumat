// Tapahtumapaikan oma kotisivu nimellä. Käytetään kun tapahtuman ainoa
// linkki veisi kilpailevaan tapahtumakalenteriin (lib/event-links) — silloin
// näytetään mieluummin paikan oma sivu kuin kilpailijan listaus.
//
// Kevyt tarkoituksella: yksi nimi sisään, yksi osoite ulos. Koko venue→www
// -kartan lähettäminen klientille olisi satoja kilotavuja, ja tätä tarvitaan
// vain avatuissa paneeleissa.
//
// MATCHAUS ON TÄSMÄLLINEN, EI SUMEA — sama linjaus kuin oppaiden
// paikkarikastuksessa (lib/guide-data): sumea vertailu tuotti mitatusti
// vääriä osumia ("Kaapelitehdas Puristamo" → Elite, "Taidehalli" →
// Meilahden taidehalli). Väärä linkki on pahempi kuin ei linkkiä.
import { NextRequest, NextResponse } from 'next/server'
import { fetchActivitiesCached } from '@/app/api/activities/route'
import { fetchOSMCached } from '@/app/api/restaurants/route'
import { VENUE_PAGES } from '@/lib/venue-pages'
import { HELSINKI_NIGHTCLUBS } from '@/lib/helsinki-nightclubs'
import { isCompetitorUrl } from '@/lib/event-links'
import venueSiteData from '@/data/venue-sites.json'

export const revalidate = 3600

/** Vertailuavain: pienet kirjaimet, tuplavälit pois, loppuosan tarkenne
 *  ("Kiasma, nykytaiteen museo" → "kiasma") pois — pilkku erottaa nimen
 *  kuvailusta LinkedEventsin paikannimissä. */
function key(name: string): string {
  return name.split(',')[0].toLowerCase().trim().replace(/\s+/g, ' ')
}

function normalizeUrl(www: string): string | null {
  const v = www.trim()
  if (!v) return null
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`
  // Kilpailijan osoite ei kelpaa paikan sivuksi missään tapauksessa.
  return isCompetitorUrl(url) ? null : url
}

let cache: { map: Map<string, string>; ts: number } | null = null
const TTL = 60 * 60 * 1000

async function buildMap(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.ts < TTL) return cache.map
  const map = new Map<string, string>()
  const add = (name: string | null | undefined, www: string | null | undefined) => {
    if (!name || !www) return
    const k = key(name)
    if (!k || map.has(k)) return          // ensimmäinen voittaa (kuratoitu ensin)
    const u = normalizeUrl(www)
    if (u) map.set(k, u)
  }
  // PRIORITEETTI: kuratoitu > virallinen rekisteri > OSM. Ensimmäinen voittaa,
  // joten järjestys ratkaisee — kuratoitu tieto on tarkistettua, LinkedEventsin
  // place-rekisteri on kaupungin ylläpitämää, OSM talkoodataa.
  for (const v of VENUE_PAGES) add(v.name, v.www)
  for (const v of HELSINKI_NIGHTCLUBS) add(v.name, v.www)
  // LinkedEventsin paikkarekisteri (data/venue-sites.json, viikkohaku):
  // 2187 paikkaa kotisivuineen — kirjastot, seniorikeskukset, kulttuuritalot,
  // elokuvateatterit. Mitattu 25.8.2026: nostaa kattavuuden 28 % → 68 %.
  for (const [k, www] of Object.entries((venueSiteData as { sites?: Record<string, string> }).sites ?? {})) {
    if (!map.has(k)) {
      const u = normalizeUrl(www)
      if (u) map.set(k, u)
    }
  }
  try {
    const acts = await fetchActivitiesCached()
    for (const a of acts) add(a.name, a.www)
  } catch { /* aktiviteetit alhaalla — ravintolat voivat silti osua */ }
  try {
    const rests = await fetchOSMCached()
    for (const r of rests) add(r.name, r.www)
  } catch { /* ei kriittinen */ }
  cache = { map, ts: Date.now() }
  return map
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.slice(0, 120) ?? ''
  if (!name.trim()) return NextResponse.json({ www: null })
  try {
    const map = await buildMap()
    return NextResponse.json(
      { www: map.get(key(name)) ?? null },
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } },
    )
  } catch {
    return NextResponse.json({ www: null })
  }
}
