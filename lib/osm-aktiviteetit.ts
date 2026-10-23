// OSM-aktiviteettien OTOS: Overpass-haku, OSM-tagien tulkinta Activity-
// riveiksi, romahdusvahti ja otoksen säilytys Supabase Storagessa.
//
// EI Next-riippuvuuksia: samaa koodia ajavat /api/activities (luku),
// /api/cron/osm-otos (päivittäinen päivitys) ja scripts/hae-osm-otos.ts
// (sama putki käsin + repoon committoitu pohjaotos).
//
// MIKSI OTOS EIKÄ SUORA HAKU (mitattu 23.10.2026). /api/activities haki
// Overpassista jokaisella välimuistin ohituksella: ~3 200 kohdetta, 2,7 Mt,
// hyvänä päivänä 20–35 s. 23.10. ensimmäinen peili (overpass.openstreetmap.fr)
// alkoi vastata 403 "only available to white-listed usages", toinen
// (z.overpass-api.de) vastasi 37–41 sekunnissa ja kolmas (kumi.systems) ei
// vastannut lainkaan. unstable_cachen avain sisältää funktion lähdekoodin,
// joten JOKAINEN reittipaketti (activities, guides, /saunat, /ilmaiset-museot…)
// pitää omaa kopiotaan — ja /api/guides/[slug] (maxDuration 30) ei koskaan
// ehtinyt täyttää omaansa: saunaopas ja ilmaiset museot vastasivat 504
// FUNCTION_INVOCATION_TIMEOUT joka pyynnöllä, ja /saunat-sivu jäi 38 tunnin
// ikäiseen ISR-versioon, koska uudelleenrakennus kaatui samaan.
//
// Nyt pyyntöpolku ei kutsu Overpassia lainkaan. Se lukee VALMIIN otoksen
// Storagesta (OTOS_BUCKET/OTOS_POLKU), ja jos sitä ei ole (ensimmäinen deploy,
// Storage alhaalla, kehitys ilman avaimia), repoon committoidun pohjaotoksen
// data/aktiviteetit-osm.json. Otoksen päivittää päivittäinen cron omalla
// aikabudjetillaan — sama "varasto täyttyy taustalla, pyyntö lukee valmista"
// -periaate kuin lib/lahdevarasto tapahtumille.

import type { Activity, ActivityCategory } from './types'

export interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** Valmis otos: Overpass-vastaus tulkittuna Activity-riveiksi. Sama muoto
 *  Storagessa ja repossa (data/aktiviteetit-osm.json). Rivit ovat PUHTAITA
 *  OSM-rivejä — täydennykset (SUPPLEMENT), kuvat ja Google-rikastus tehdään
 *  lukuvaiheessa /api/activities-reitissä kuten ennenkin. */
export interface OsmOtos {
  fetchedAt: string
  /** Mistä peilistä otos haettiin — vianetsintää varten. */
  peili: string
  activities: Activity[]
}

// ── Overpass-kysely ─────────────────────────────────────────────────────────
// Helsinki+Espoo+Vantaa bbox: south,west,north,east

export const OSM_BBOX = '60.09,24.58,60.41,25.26'

/** Solmut JA alueet (museot, puistot ym. ovat usein suljettuja alueita).
 *  timeoutS on Overpassin oma raja: asiakkaan aikakatkaisu asetetaan
 *  hieman sen yli, jotta palvelin lopettaa ennen asiakasta (katkaistu
 *  kysely jäisi palvelimen jonoon kuluttamaan kiintiötä). */
export function osmKysely(timeoutS = 35): string {
  return `[out:json][timeout:${timeoutS}][bbox:${OSM_BBOX}];
(
  node["leisure"~"^(sauna|swimming_area|swimming_pool|park|garden|nature_reserve|sports_centre|fitness_centre|amusement_park)$"]["name"];
  node["amenity"~"^(sauna|marketplace|library)$"]["name"];
  node["tourism"~"^(museum|attraction|gallery|viewpoint|zoo)$"]["name"];
  node["natural"="beach"]["name"];
  way["tourism"~"^(museum|attraction|gallery|zoo)$"]["name"];
  way["leisure"~"^(park|garden|nature_reserve|sports_centre|amusement_park)$"]["name"];
  way["amenity"~"^(marketplace|library)$"]["name"];
  way["natural"="beach"]["name"];
);
out center;`
}

/** overpass.openstreetmap.fr EI ole listalla: se vastaa 23.10.2026 alkaen
 *  403 "This service is only available to white-listed usages". */
export const OVERPASS_PEILIT = [
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const

export const OSM_HEADERS = {
  'User-Agent': 'Helsinki-Tapahtumat/1.0 (https://github.com/Taawetti/Helsinki-tapahtumat)',
  'Accept': 'application/json',
}

// ── OSM-tagit → kategoria, kuvaus, osoite ───────────────────────────────────

export function osmCategory(tags: Record<string, string>): ActivityCategory {
  const tourism = tags.tourism
  const leisure = tags.leisure
  const natural = tags.natural
  const amenity = tags.amenity

  if (leisure === 'sauna' || amenity === 'sauna') return 'sauna'
  if (tourism === 'museum') return 'museo'
  if (tourism === 'gallery') return 'galleria'
  if (tourism === 'viewpoint') return 'nakopaikka'
  if (natural === 'beach' || leisure === 'swimming_area' || leisure === 'swimming_pool') return 'uimaranta'
  if (leisure === 'park' || leisure === 'garden' || leisure === 'nature_reserve') return 'puisto'
  if (amenity === 'marketplace') return 'markkina'
  if (leisure === 'sports_centre' || leisure === 'pitch' || leisure === 'fitness_centre') return 'urheilu'
  if (tourism === 'attraction') return 'nahtavyys'
  if (tourism === 'zoo' || leisure === 'amusement_park' || amenity === 'library') return 'muu'
  return 'muu'
}

export function osmDescription(tags: Record<string, string>, cat: ActivityCategory): string {
  // Suomenkielinen kategoriateksti
  const labels: Record<ActivityCategory, string> = {
    // kirpputori ei tule OSM:stä vaan data/secondhand.json:sta (MapView
    // yhdistää sen karttakerrokseen) — tyyppi vaatii silti rivin tähän.
    kirpputori: 'Kirpputori',
    // pubivisa: sama tilanne, lähde data/pubivisa-koordinaatit.json
    pubivisa: 'Pubivisa',
    sauna:      'Julkinen sauna',
    museo:      'Museo',
    nahtavyys:  'Nähtävyys',
    galleria:   'Taidegalleria',
    nakopaikka: 'Näköalapaikka',
    uimaranta:  'Uimaranta / uimapaikka',
    puisto:     'Puisto / luontoalue',
    markkina:   'Kauppahalli / tori',
    urheilu:    'Urheilupaikka',
    muu:        'Aktiviteetti',
  }
  // Saunan lämmitystapa mukaan
  if (cat === 'sauna' && tags['sauna:fuel']) {
    const fuel = tags['sauna:fuel']
    const fuelFi = fuel === 'wood' ? 'puusauna' : fuel === 'electric' ? 'sähkösauna' : fuel
    return `Julkinen sauna — ${fuelFi}`
  }
  // Historiallisen kohteen alatyyppi jos saatavilla
  if (tags.historic) return `Historiallinen kohde (${tags.historic})`
  return labels[cat]
}

export function osmAddress(tags: Record<string, string>): string {
  const street = tags['addr:street'] ?? ''
  const num = tags['addr:housenumber'] ?? ''
  return street ? `${street}${num ? ` ${num}` : ''}` : ''
}

/** Overpass-elementit → Activity-rivit. Puhdas funktio (testit
 *  scripts/test-categories.ts). Sama tulkinta kuin /api/activities-reitissä
 *  ennen otosta: nimettömät pois, sama nimi + sama ~100 m piste kerran,
 *  yksityiset saunat ja altaat pois. */
export function elementitAktiviteeteiksi(elements: OsmElement[]): Activity[] {
  const seen = new Set<string>()
  const results: Activity[] = []

  for (const el of elements) {
    const tags = el.tags ?? {}
    const name = (tags.name || tags['name:fi'] || '').trim()
    if (!name) continue

    const lat = el.type === 'node' ? el.lat : el.center?.lat
    const lon = el.type === 'node' ? el.lon : el.center?.lon
    if (!lat || !lon) continue

    // Sama kohde solmuna ja alueena → yksi rivi
    const key = `${name.toLowerCase()}|${Math.round(lat * 1000)}|${Math.round(lon * 1000)}`
    if (seen.has(key)) continue
    seen.add(key)

    const cat = osmCategory(tags)

    // Yksityiset uima-altaat pois
    if ((tags.leisure === 'swimming_pool' || tags.amenity === 'swimming_pool') && tags.access === 'private') continue
    // Yksityiset saunat pois
    if (cat === 'sauna' && tags.access === 'private') continue

    results.push({
      id: `act-${el.type[0]}${el.id}`,
      name,
      description: osmDescription(tags, cat),
      category: cat,
      address: osmAddress(tags),
      city: tags['addr:city'] ?? '',
      lat,
      lon,
      www: tags.website ?? tags.url ?? tags['contact:website'] ?? null,
      phone: tags.phone ?? tags['contact:phone'] ?? null,
      openingHours: tags.opening_hours ?? undefined,
      image: null,
      fee: tags.fee === 'yes' ? true : tags.fee === 'no' ? false : undefined,
      charge: tags.charge ?? tags.entrance_fee ?? undefined,
      wheelchair: tags.wheelchair === 'yes' ? true : tags.wheelchair === 'no' ? false : undefined,
      saunaFuel: tags['sauna:fuel'] ?? undefined,
      outdoor: tags.indoor === 'no' ? true : undefined,
      wikidata: tags.wikidata ?? undefined,
      wikipedia: tags.wikipedia ?? undefined,
    })
  }

  return results
}

// ── Overpass-haku peilit läpi aikabudjetilla ────────────────────────────────

export interface OverpassYritys { peili: string; status: number; ms: number; virhe?: string }
export interface OverpassHaku { activities: Activity[]; peili: string; ms: number; yritykset: OverpassYritys[] }

/** Hakee otoksen peileiltä järjestyksessä, kunnes yksi vastaa kelvollisesti
 *  tai budjetti loppuu. HEITTÄÄ kun yksikään ei vastannut — tyhjä otos ei
 *  saa koskaan korvata hyvää. Osittainen vastaus (Overpass palauttaa 200 ja
 *  remark-kentän kun kysely katkesi kesken) hylätään samoin. */
export async function haeOsmAktiviteetit(o: { budjettiMs?: number; aikakatkaisuMs?: number; peilit?: readonly string[] } = {}): Promise<OverpassHaku> {
  const t0 = Date.now()
  const budjetti = o.budjettiMs ?? 110_000
  const maxAikakatkaisu = o.aikakatkaisuMs ?? 60_000
  const peilit = o.peilit ?? OVERPASS_PEILIT
  const yritykset: OverpassYritys[] = []

  for (const peili of peilit) {
    const jaljella = budjetti - (Date.now() - t0)
    // Alle 15 s ei riitä: vastaus on 2,7 Mt ja kestää hyvänäkin päivänä 20 s.
    if (jaljella < 15_000) break
    const aikakatkaisu = Math.min(maxAikakatkaisu, jaljella - 5_000)
    const palvelinS = Math.max(20, Math.floor(aikakatkaisu / 1000) - 5)
    const alku = Date.now()
    try {
      const res = await fetch(peili, {
        method: 'POST',
        headers: { ...OSM_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(osmKysely(palvelinS)),
        signal: AbortSignal.timeout(aikakatkaisu),
      })
      if (!res.ok) {
        yritykset.push({ peili, status: res.status, ms: Date.now() - alku, virhe: `HTTP ${res.status}` })
        continue
      }
      const data = (await res.json()) as { elements?: OsmElement[]; remark?: string }
      if (data.remark && /runtime error|timed out|out of memory/i.test(data.remark)) {
        yritykset.push({ peili, status: res.status, ms: Date.now() - alku, virhe: `osittainen vastaus: ${data.remark.slice(0, 80)}` })
        continue
      }
      const activities = elementitAktiviteeteiksi(data.elements ?? [])
      if (activities.length === 0) {
        yritykset.push({ peili, status: res.status, ms: Date.now() - alku, virhe: 'tyhjä vastaus' })
        continue
      }
      yritykset.push({ peili, status: res.status, ms: Date.now() - alku })
      return { activities, peili, ms: Date.now() - t0, yritykset }
    } catch (e) {
      const virhe = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      yritykset.push({ peili, status: 0, ms: Date.now() - alku, virhe: virhe.slice(0, 80) })
    }
  }

  const seloste = yritykset.map((y) => `${new URL(y.peili).host} ${y.virhe ?? ''} (${y.ms} ms)`).join('; ')
  throw new Error(`kaikki Overpass-peilit epäonnistuivat: ${seloste || 'budjetti loppui ennen ensimmäistä yritystä'}`)
}

/** Yksi Overpass-kysely peilit läpi: ensimmäinen kelvollinen vastaus
 *  palautetaan, muuten heitetään kaikkien peilien syyt. Osittainen vastaus
 *  (remark) hylätään. Skriptien yhteinen apu — yksi peili ei riitä: 23.10.2026
 *  overpass-api.de vastasi 502 "at capacity" ja kaatoi viikkoajon askeleen
 *  "Hae tekemisen syyt", vaikka z.overpass-api.de vastasi samaan aikaan. */
export async function haeOverpass<T extends { remark?: string } = { elements?: OsmElement[]; remark?: string }>(
  kysely: string,
  o: { aikakatkaisuMs?: number; peilit?: readonly string[]; userAgent?: string } = {},
): Promise<{ data: T; peili: string }> {
  const peilit = o.peilit ?? OVERPASS_PEILIT
  const virheet: string[] = []
  for (const peili of peilit) {
    const host = new URL(peili).host
    try {
      const res = await fetch(peili, {
        method: 'POST',
        headers: { ...OSM_HEADERS, ...(o.userAgent ? { 'User-Agent': o.userAgent } : {}), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(kysely),
        signal: AbortSignal.timeout(o.aikakatkaisuMs ?? 150_000),
      })
      if (!res.ok) { virheet.push(`${host}: HTTP ${res.status}`); continue }
      const data = (await res.json()) as T
      if (data.remark && /runtime error|timed out|out of memory/i.test(data.remark)) {
        virheet.push(`${host}: osittainen vastaus: ${data.remark.slice(0, 60)}`)
        continue
      }
      return { data, peili }
    } catch (e) {
      virheet.push(`${host}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`.slice(0, 100))
    }
  }
  throw new Error(`overpass: kaikki peilit epäonnistuivat — ${virheet.join('; ')}`)
}

// ── Romahdusvahti ───────────────────────────────────────────────────────────
// Mitattu 23.10.2026: 3 175 kohdetta, joista 43 saunaa ja 92 museota.
// Vähempi tarkoittaa hakuvikaa (osittainen vastaus, peilin vajaa kanta),
// eikä vajaa otos saa korvata edellistä — saunaopas näyttäisi sen suoraan.

export const OTOS_RAJAT = { kohteita: 1500, saunoja: 20, museoita: 40, osuusEdellisesta: 0.6 } as const

export function tarkistaOtos(uusi: Activity[], edellinen?: Activity[] | null): { ok: true } | { ok: false; syy: string } {
  const saunoja = uusi.filter((a) => a.category === 'sauna').length
  const museoita = uusi.filter((a) => a.category === 'museo').length
  if (uusi.length < OTOS_RAJAT.kohteita) return { ok: false, syy: `kohteita ${uusi.length} < ${OTOS_RAJAT.kohteita}` }
  if (saunoja < OTOS_RAJAT.saunoja) return { ok: false, syy: `saunoja ${saunoja} < ${OTOS_RAJAT.saunoja}` }
  if (museoita < OTOS_RAJAT.museoita) return { ok: false, syy: `museoita ${museoita} < ${OTOS_RAJAT.museoita}` }
  if (edellinen && edellinen.length > 0 && uusi.length < edellinen.length * OTOS_RAJAT.osuusEdellisesta) {
    return { ok: false, syy: `kohteita ${uusi.length} < ${Math.round(OTOS_RAJAT.osuusEdellisesta * 100)} % edellisestä (${edellinen.length})` }
  }
  return { ok: true }
}

// ── Säilytys Supabase Storagessa ────────────────────────────────────────────
// Yksityinen bucket, yksi JSON-tiedosto. Storage eikä taulu, koska otos on
// ~0,7 Mt:n möykky jota luetaan ja kirjoitetaan kokonaisena, ja bucketin voi
// luoda palvelinavaimella lennossa — uutta taulua varten pitäisi ajaa SQL
// käsin. Suora REST-kutsu kuten lib/kuvavarasto: env luetaan kutsuhetkellä,
// jotta skriptit ehtivät ladata .env.localin (GitHub Actionsissa osoitteen
// salaisuus on SUPABASE_URL, ei NEXT_PUBLIC_).

export const OTOS_BUCKET = 'osm-varasto'
export const OTOS_POLKU = 'aktiviteetit.json'

function storageAsetukset(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? { url, key } : null
}

const tunnistus = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}` })

/** Otos Storagesta, tai null kun sitä ei ole tai lukua ei voi tehdä (ei
 *  avaimia, bucket puuttuu, Storage ei vastaa). Ei koskaan heitä: kutsuja
 *  siirtyy pohjaotokseen. */
export async function lueOtosVarastosta(aikakatkaisuMs = 15_000): Promise<OsmOtos | null> {
  const s = storageAsetukset()
  if (!s) return null
  try {
    const res = await fetch(`${s.url}/storage/v1/object/${OTOS_BUCKET}/${OTOS_POLKU}`, {
      headers: tunnistus(s.key),
      signal: AbortSignal.timeout(aikakatkaisuMs),
    })
    if (!res.ok) {
      // 400/404 = bucket tai tiedosto puuttuu (ensimmäinen deploy) — ei vika.
      if (res.status !== 400 && res.status !== 404) console.warn(`[osm-otos] varaston luku: HTTP ${res.status}`)
      return null
    }
    const otos = (await res.json()) as Partial<OsmOtos>
    if (typeof otos?.fetchedAt !== 'string' || !Array.isArray(otos.activities) || otos.activities.length === 0) return null
    return { fetchedAt: otos.fetchedAt, peili: otos.peili ?? '', activities: otos.activities as Activity[] }
  } catch (e) {
    console.warn('[osm-otos] varaston luku epäonnistui:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Vie otoksen Storageen (korvaa edellisen). Luo bucketin ensimmäisellä
 *  kerralla. HEITTÄÄ virheen syineen — kutsuja (cron, skripti) raportoi. */
export async function kirjoitaOtosVarastoon(otos: OsmOtos): Promise<{ tavua: number }> {
  const s = storageAsetukset()
  if (!s) throw new Error('NEXT_PUBLIC_SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu')
  const body = JSON.stringify(otos)
  const vie = () => fetch(`${s.url}/storage/v1/object/${OTOS_BUCKET}/${OTOS_POLKU}`, {
    method: 'POST',
    headers: { ...tunnistus(s.key), 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  let up = await vie()
  if (!up.ok) {
    const teksti = await up.text()
    if (!/bucket not found/i.test(teksti)) throw new Error(`vienti ${up.status}: ${teksti.slice(0, 120)}`)
    const luonti = await fetch(`${s.url}/storage/v1/bucket`, {
      method: 'POST',
      headers: { ...tunnistus(s.key), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: OTOS_BUCKET, name: OTOS_BUCKET, public: false }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!luonti.ok) {
      const t = await luonti.text()
      if (!/already exists|duplicate/i.test(t)) throw new Error(`bucketin luonti ${luonti.status}: ${t.slice(0, 120)}`)
    }
    up = await vie()
    if (!up.ok) throw new Error(`vienti ${up.status}: ${(await up.text()).slice(0, 120)}`)
  }
  return { tavua: Buffer.byteLength(body) }
}
