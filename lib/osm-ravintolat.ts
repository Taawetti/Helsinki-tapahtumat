// OSM-RAVINTOLOIDEN OTOS: Overpass-kysely, elementtien karsinta,
// romahdusvahti ja otoksen säilytys Supabase Storagessa.
//
// EI Next-riippuvuuksia: samaa koodia ajavat /api/restaurants (luku),
// /api/cron/osm-ravintolat (päivittäinen päivitys) ja
// scripts/hae-osm-ravintolat.ts (sama putki käsin + repoon committoitu
// pohjaotos data/ravintolat-osm.json).
//
// MIKSI OTOS EIKÄ SUORA HAKU (mitattu 30.10.2026). /api/restaurants haki
// Overpassista aina, kun sen 24 h välimuisti oli tyhjä — ja /api/cron
// vanhentaa sen joka aamu klo 6 UTC. Peilit vastasivat ravintolakyselyyn
// 35 s (z.overpass-api.de), 46 s (overpass-api.de) tai eivät lainkaan
// (kumi.systems); yhden solmun testikysely kesti 59 s ja overpass-api.de
// ilmoitti "at capacity, request queue is full". Reitin peilikohtainen
// aikakatkaisu oli 35 s ja funktion raja 60 s, joten haku katkesi tai funktio
// kuoli, ja Ravintolat-välilehti jäi näyttämään "Haetaan ravintoloita".
// Nyt pyyntöpolku lukee VALMIIN otoksen Storagesta tai pohjaotoksen eikä
// koskaan odota Overpassia — sama malli kuin lib/osm-aktiviteetit (23.10.).
//
// Otos on PUHTAITA OSM-ELEMENTTEJÄ (karsituin tagein), ei valmiita
// Restaurant-rivejä: palkinnot, kuratoidut kuvat ja nimestä päättely asuvat
// reitissä ja muuttuvat deployn mukana, eikä päivän vanha otos saa jäädyttää
// niitä. Tulkinta: app/api/restaurants/route.ts elementitRavintoloiksi.

import {
  OSM_BBOX,
  haeOverpassBudjetilla,
  lueJsonVarastosta,
  kirjoitaJsonVarastoon,
  type OsmElement,
  type OverpassYritys,
} from './osm-aktiviteetit'

export type { OsmElement }

// ── Overpass-kysely ─────────────────────────────────────────────────────────

/** Sama amenity-joukko kuin reitin aiemmassa suorassa haussa. */
export const RAVINTOLA_AMENITYT = ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 'biergarten', 'nightclub'] as const

/** Solmut ja alueet (ravintola voi olla koko rakennus) keskipisteineen.
 *  timeoutS on Overpassin oma raja: asiakkaan aikakatkaisu asetetaan
 *  hieman sen yli, jotta palvelin lopettaa ennen asiakasta. */
export function ravintolaKysely(timeoutS = 30): string {
  const suodatin = `["amenity"~"^(${RAVINTOLA_AMENITYT.join('|')})$"]["name"]`
  return `[out:json][timeout:${timeoutS}][bbox:${OSM_BBOX}];(node${suodatin};way${suodatin};);out center;`
}

// ── Karsinta ────────────────────────────────────────────────────────────────

/** Tagit, jotka tulkinta lukee (elementitRavintoloiksi, parsePriceRange ja
 *  osmAddress reitissä). Vain nämä säilytetään: Overpass-vastaus on 1,9 Mt,
 *  karsittu otos noin 1 Mt. scripts/test-categories.ts tarkistaa, ettei
 *  reitti lue tagia, jota ei ole tässä listassa. */
export const RAVINTOLA_TAGIT = [
  'name', 'name:fi', 'amenity', 'cuisine',
  'addr:street', 'addr:housenumber', 'addr:city',
  'website', 'url', 'contact:website',
  'phone', 'contact:phone', 'email', 'contact:email', 'contact:instagram',
  'opening_hours', 'outdoor_seating', 'takeaway',
  'price_level', 'check_in:price_range',
] as const

/** Valmis otos: karsitut Overpass-elementit. Sama muoto Storagessa ja
 *  repossa (data/ravintolat-osm.json). */
export interface RavintolaOtos {
  fetchedAt: string
  /** Mistä peilistä otos haettiin — vianetsintää varten. */
  peili: string
  elements: OsmElement[]
}

/** Overpass-elementit → otoksen elementit: vain nimelliset ja koordinaatilliset
 *  kohteet, vain tulkinnan lukemat tagit; alueelta (way) jää keskipiste.
 *  Puhdas funktio (testit scripts/test-categories.ts). */
export function karsiRavintolaElementit(elements: OsmElement[]): OsmElement[] {
  const out: OsmElement[] = []
  for (const el of elements) {
    const tags = el.tags ?? {}
    if (!(tags.name || tags['name:fi'])) continue
    const lat = el.type === 'node' ? el.lat : el.center?.lat
    const lon = el.type === 'node' ? el.lon : el.center?.lon
    if (!lat || !lon) continue
    const karsitut: Record<string, string> = {}
    for (const k of RAVINTOLA_TAGIT) {
      const v = tags[k]
      if (typeof v === 'string' && v !== '') karsitut[k] = v
    }
    out.push(el.type === 'node'
      ? { type: 'node', id: el.id, lat, lon, tags: karsitut }
      : { type: el.type, id: el.id, center: { lat, lon }, tags: karsitut })
  }
  return out
}

// ── Overpass-haku peilit läpi aikabudjetilla ────────────────────────────────

export interface RavintolaHaku { elements: OsmElement[]; peili: string; ms: number; yritykset: OverpassYritys[] }

/** Hakee ja karsii otoksen peileiltä järjestyksessä budjetin rajoissa.
 *  HEITTÄÄ kun yksikään peili ei vastannut kelvollisesti — tyhjä tai
 *  osittainen vastaus ei saa koskaan korvata hyvää otosta. */
export async function haeOsmRavintolat(o: { budjettiMs?: number; aikakatkaisuMs?: number; peilit?: readonly string[] } = {}): Promise<RavintolaHaku> {
  const haku = await haeOverpassBudjetilla(ravintolaKysely, karsiRavintolaElementit, o)
  return { elements: haku.tulos, peili: haku.peili, ms: haku.ms, yritykset: haku.yritykset }
}

// ── Romahdusvahti ───────────────────────────────────────────────────────────
// Mitattu 30.10.2026: 3 583 kohdetta, joista 1 868 ravintolaa, 626 kahvilaa,
// 513 baaria/pubia, 538 pikaruokapaikkaa ja 33 yökerhoa. Selvästi vähempi
// tarkoittaa hakuvikaa (osittainen vastaus, peilin vajaa kanta), eikä vajaa
// otos saa korvata edellistä — Ravintolat-välilehti näyttäisi sen suoraan.

export const RAVINTOLA_OTOS_RAJAT = { kohteita: 2000, ravintoloita: 1000, kahviloita: 300, baareja: 250, osuusEdellisesta: 0.6 } as const

export function tarkistaRavintolaOtos(uusi: OsmElement[], edellinen?: OsmElement[] | null): { ok: true } | { ok: false; syy: string } {
  const lkm = (...amenityt: string[]) => uusi.filter((e) => amenityt.includes(e.tags?.amenity ?? '')).length
  const ravintoloita = lkm('restaurant')
  const kahviloita = lkm('cafe')
  const baareja = lkm('bar', 'pub', 'biergarten')
  const R = RAVINTOLA_OTOS_RAJAT
  if (uusi.length < R.kohteita) return { ok: false, syy: `kohteita ${uusi.length} < ${R.kohteita}` }
  if (ravintoloita < R.ravintoloita) return { ok: false, syy: `ravintoloita ${ravintoloita} < ${R.ravintoloita}` }
  if (kahviloita < R.kahviloita) return { ok: false, syy: `kahviloita ${kahviloita} < ${R.kahviloita}` }
  if (baareja < R.baareja) return { ok: false, syy: `baareja ${baareja} < ${R.baareja}` }
  if (edellinen && edellinen.length > 0 && uusi.length < edellinen.length * R.osuusEdellisesta) {
    return { ok: false, syy: `kohteita ${uusi.length} < ${Math.round(R.osuusEdellisesta * 100)} % edellisestä (${edellinen.length})` }
  }
  return { ok: true }
}

// ── Säilytys Supabase Storagessa ────────────────────────────────────────────
// Sama yksityinen bucket kuin aktiviteettiotoksella (OTOS_BUCKET), oma tiedosto.

export const RAVINTOLA_OTOS_POLKU = 'ravintolat.json'

/** Otos Storagesta, tai null kun sitä ei ole, lukua ei voi tehdä tai otos on
 *  vajaa (alle romahdusvahdin kohderajan — cron ei kirjoita vajaata, mutta
 *  pyyntöpolku ei luota siihen). Ei heitä: kutsuja siirtyy pohjaotokseen. */
export async function lueRavintolaOtosVarastosta(aikakatkaisuMs = 15_000): Promise<RavintolaOtos | null> {
  const otos = (await lueJsonVarastosta(RAVINTOLA_OTOS_POLKU, aikakatkaisuMs)) as Partial<RavintolaOtos> | null
  if (typeof otos?.fetchedAt !== 'string' || !Array.isArray(otos.elements)) return null
  if (otos.elements.length < RAVINTOLA_OTOS_RAJAT.kohteita) {
    console.warn(`[osm-ravintolat] varaston otos vajaa (${otos.elements.length} kohdetta) — käytetään pohjaotosta`)
    return null
  }
  return { fetchedAt: otos.fetchedAt, peili: otos.peili ?? '', elements: otos.elements as OsmElement[] }
}

/** Vie otoksen Storageen (korvaa edellisen). HEITTÄÄ virheen syineen —
 *  kutsuja (cron, skripti) raportoi. */
export async function kirjoitaRavintolaOtosVarastoon(otos: RavintolaOtos): Promise<{ tavua: number }> {
  return kirjoitaJsonVarastoon(RAVINTOLA_OTOS_POLKU, JSON.stringify(otos))
}

/** Pohjaotoksen tiedostomuoto: yksi elementti per rivi, jotta git-diff näyttää
 *  muuttuneet kohteet eikä yhtä megatavun riviä. */
export function ravintolaOtosTiedostoksi(otos: RavintolaOtos): string {
  const rivit = otos.elements.map((e) => '  ' + JSON.stringify(e))
  return `{"fetchedAt":${JSON.stringify(otos.fetchedAt)},"peili":${JSON.stringify(otos.peili)},"elements":[\n${rivit.join(',\n')}\n]}\n`
}
