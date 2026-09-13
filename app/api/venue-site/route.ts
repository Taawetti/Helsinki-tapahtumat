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

const lisaa = (map: Map<string, string>, name: string | null | undefined, www: string | null | undefined) => {
  if (!name || !www) return
  const k = key(name)
  if (!k || map.has(k)) return            // ensimmäinen voittaa (kuratoitu ensin)
  const u = normalizeUrl(www)
  if (u) map.set(k, u)
}

// ── STAATTINEN KARTTA: pelkkiä importteja, EI yhtään verkkopyyntöä ──────────
// PRIORITEETTI: kuratoitu > virallinen rekisteri. Ensimmäinen voittaa, joten
// järjestys ratkaisee — kuratoitu tieto on tarkistettua ja LinkedEventsin
// place-rekisteri kaupungin ylläpitämää.
let staattinen: Map<string, string> | null = null

function staattinenKartta(): Map<string, string> {
  if (staattinen) return staattinen
  const map = new Map<string, string>()
  for (const v of VENUE_PAGES) lisaa(map, v.name, v.www)
  for (const v of HELSINKI_NIGHTCLUBS) lisaa(map, v.name, v.www)
  // LinkedEventsin paikkarekisteri (data/venue-sites.json, viikkohaku):
  // ~1900 paikkaa kotisivuineen — kirjastot, seniorikeskukset, kulttuuritalot,
  // elokuvateatterit. Mitattu 25.8.2026: nostaa kattavuuden 28 % → 68 %.
  for (const [k, www] of Object.entries((venueSiteData as { sites?: Record<string, string> }).sites ?? {})) {
    if (!map.has(k)) {
      const u = normalizeUrl(www)
      if (u) map.set(k, u)
    }
  }
  staattinen = map
  return map
}

// ── OSM-TÄYDENNYS: haetaan TAUSTALLA, eikä yksikään pyyntö odota sitä ───────
// TUOTANTOVIKA 13.9.2026. Tämä reitti odotti ENNEN aktiviteetti- ja
// ravintolahakuja (Overpass/OSM) kesken pyynnön. Kylmällä välimuistilla se
// aikakatkaisi: 250 paikannimen mittauksessa 4 kyselyä palautti tyhjän 30
// sekunnin jälkeen — ja tyhjä vastaus näkyi käyttäjälle siten, että
// infopaneelin nappi muuttui hiljaa Google-hauksi. Ne neljä olivat Oodi
// (94 tapahtumaa mitatussa kuukaudessa), Töölön kirjasto (44) ja Stoa (41),
// eli 179 tapahtumaa sai väärän napin vaikka oikea osoite oli tiedossa.
// Lämpimänä sama kysely vastasi 0,22 sekunnissa.
//
// MIKSI TÄMÄ EI MENETÄ JUURI MITÄÄN: mitattu samasta 250 nimen otoksesta —
// staattinen kartta kattaa 159 nimeä 168:sta, ja OSM on AINOA lähde vain
// yhdeksälle (mm. Lapinlahden Lähde, Kiasma, Lazy Fox).
//
// REHELLINEN VARAUMA: serverless-ajossa instanssi jäädytetään vastauksen
// jälkeen, joten tämä taustahaku voi jäädä kesken eikä OSM-osuus välttämättä
// koskaan täyty tuotannossa. Se on TIETOINEN valinta: hinta on ne 9 nimeä
// (5 % otoksesta), jotka putoavat paneelin omaan "Paikan kaikki tapahtumat"
// -toimintoon, ja vastineeksi yksikään pyyntö ei voi enää jäädä roikkumaan
// Overpassin varaan. Vaihtoehto (after()/waitUntil) maksaisi funktioaikaa,
// ja tässä projektissa on jo törmätty Vercelin FAIR_USE_LIMITS_EXCEEDED-rajaan.
let osm: Map<string, string> | null = null
let osmYritetty = 0
const OSM_UUDELLEEN_MS = 60 * 60 * 1000

function taydennaTaustalla(): void {
  if (Date.now() - osmYritetty < OSM_UUDELLEEN_MS) return
  osmYritetty = Date.now()
  const tee = async () => {
    const map = new Map<string, string>()
    try {
      const acts = await fetchActivitiesCached()
      for (const a of acts) lisaa(map, a.name, a.www)
    } catch { /* aktiviteetit alhaalla — ravintolat voivat silti osua */ }
    try {
      const rests = await fetchOSMCached()
      for (const r of rests) lisaa(map, r.name, r.www)
    } catch { /* ei kriittinen */ }
    // Tyhjää tulosta ei oteta käyttöön: molemmat lähteet olivat alhaalla.
    if (map.size > 0) osm = map
  }
  // Tulipalonsammutus: taustatehtävän virhe EI saa kaataa reittiä.
  void tee().catch(() => { /* yritetään tunnin päästä uudelleen */ })
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.slice(0, 120) ?? ''
  if (!name.trim()) return NextResponse.json({ www: null })
  try {
    const k = key(name)
    // Vastaus tulee AINA staattisesta kartasta; taustahaku vain rikastaa.
    const www = staattinenKartta().get(k) ?? osm?.get(k) ?? null
    taydennaTaustalla()
    // VAIN LÖYTYNYT OSOITE VÄLIMUISTITETAAN. Tyhjä vastaus voi johtua siitä
    // että taustatäydennys ei ole vielä valmis (osm === null): prosessin
    // ensimmäinen pyyntö ei rakenteellisesti voi tuntea OSM-nimiä. Jos sen
    // nullin lähettäisi s-maxage=3600:lla, CDN tarjoilisi väärää tyhjää vielä
    // tunnin senkin jälkeen kun palvelin jo tietää osoitteen — vanha koodi ei
    // voinut tehdä niin, koska se odotti haun valmiiksi ennen vastausta.
    return NextResponse.json(
      { www },
      { headers: { 'Cache-Control': www ? 's-maxage=3600, stale-while-revalidate=86400' : 'no-store' } },
    )
  } catch {
    return NextResponse.json({ www: null })
  }
}
