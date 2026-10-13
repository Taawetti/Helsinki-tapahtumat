// Lähdevarasto — valmiiksi koottu tapahtumavarasto (omistaja 24.9.2026 "B",
// toteutettu 12.10.2026).
//
// ONGELMA: /api/events kokosi tapahtumat 45 ulkoisesta lähteestä JOKA
// välimuistin ohittavalla pyynnöllä sisäisinä HTTP-kutsuina (api/<lahde>) —
// yksi kooste = 45 funktiokutsua, 7–11 s. CDN-lämmitys toisti sen viidelle
// aikaikkunalle 5 min välein (~440 kutsua / 10 min), ja kun 10.10.2026
// kahdeksan Facebookin esikatseluhakijaa avasi jaetun linkin samalla
// sekunnilla, kutsut viisinkertaistuivat ja Vercel hälytti.
//
// RATKAISU: jokaisen ulkoisen lähteen tapahtumat haetaan TAUSTALLA 10 päivän
// paloina Supabase-tauluun `lahdevarasto` (sql/create-lahdevarasto.sql), ja
// kooste lukee palat sieltä YHDELLÄ kyselyllä. Rakentaja (rakennaVarasto)
// ajetaan /api/warm-reitistä 5 min välein (Vercel cron + UptimeRobot) ja se
// hakee vain ERÄÄNTYNEET (lähde, pala) -parit: tämän päivän pala 10 min,
// seuraava 30 min, kaukaisemmat 2 h välein. Jos pala puuttuu tai on liian
// vanha, kooste hakee sen suoraan lähteestä kuten ennen ja kirjoittaa sen
// varastoon (write-through) — varasto paranee liikenteestä, vaikka
// rakentaja olisi kuollut. Jos taulua ei ole tai Supabase ei vastaa, kooste
// toimii täsmälleen kuten ennen (suora haku).
//
// LinkedEvents EI ole varastossa: sen päiväpalat ovat jo Vercelin
// datavälimuistissa (fetch revalidate 300), eikä se ole se 45-kertainen
// kutsuketju jota tämä korjaa.
//
// PALA on kohdistettu kiinteään ruudukkoon (epookkipäivä − epookkipäivä mod
// 10), jotta eri pyynnöt (tänään, viikonloppu, kuukausi, 90 pv haku) jakavat
// samat rivit. Palaan tallennetaan tapahtumat, joiden Helsinki-alkupäivä on
// alku−4 … loppu: koosteen "käynnissä oleva lyhyt monipäiväinen tapahtuma"
// -sääntö (≤ 4 pv) tarvitsee palaa edeltävät alut.
//
// Puhtaat funktiot (päivämatematiikka, erääntyminen, kelpoisuus, jako
// paloihin) ovat testattavissa ilman Supabasea (scripts/test-categories.ts).

import type { Event } from './types'
import { supabaseAdmin } from './supabase'
import { helsinkiDateOf, helsinkiToday, normalizeHelsinkiTimestamp } from './helsinki-time'

// External sources fetched via internal API routes (api/<name>).
// Order defines merge priority: earlier sources win dedup upgrades first.
// JÄRJESTYSTÄ EI SAA SÄÄTÄÄ ILMAN MITTAUSTA. Kokeiltu 25.8.2026: 'stadissa'
// siirto listan viimeiseksi (jotta kilpailijan linkki häviäisi dedupissä)
// EI muuttanut mitattavasti mitään — kilpailijalinkkien määrä pysyi 198/1875
// molemmilla järjestyksillä, koska päällekkäiset tapaukset korjautuvat jo
// ticketUrl-päivityksen kautta. Kilpailijalinkki hoidetaan täsmällisellä
// infoUrl-päivityksellä koosteessa (isCompetitorUrl).
export const ULKOISET_LAHTEET = [
  'ticketmaster', 'fienta', 'billetto', 'meetup', 'rss', 'venues', 'culture', 'espoo',
  'helmet', 'ilmonet', 'finna', 'visitfinland', 'sports', 'festivals', 'theatre',
  'bars', 'ra', 'museums', 'liiga', 'kide', 'arenas', 'recurring', 'pubivisat',
  'stadissa', 'myhelsinki', 'openings', 'allas', 'lippu', 'scraped',
  'flyingdutchman', 'juttutupa', 'lepakkomies', 'glivelab', 'kulttuuritalo',
  'postbar', 'korjaamo', 'malmitalo', 'vuotalo', 'savoy', 'nauramaan', 'siltanen',
  'apollo', 'maxine', 'tanssintalo',
  // openmicfinland.fi VIIMEISENÄ: sama jami voi tulla myös paikan omasta
  // skraperista (Semifinal, Lepakkomies), ja dedupissa aiempi lähde voittaa —
  // paikan oma ilmoitus on tarkempi kuin valtakunnallinen kalenteri.
  'openmic',
] as const
export type UlkoinenLahde = (typeof ULKOISET_LAHTEET)[number]

export const TAULU = 'lahdevarasto'
export const PALAN_PITUUS_PV = 10
/** Kuinka pitkälle rakentaja kokoaa: haun 'search'-ikkuna on 90 pv. */
export const HORISONTTI_PV = 92
/** Käynnissä oleva lyhyt monipäiväinen tapahtuma (≤ 4 pv) näkyy koosteessa
 *  jatkopäivinään → palaan otetaan myös enintään 4 pv ennen sitä alkavat. */
export const KAYNNISSA_PV = 4

const PV_MS = 86_400_000
const MIN_MS = 60_000

// ── Päivämatematiikka (UTC-epookkipäivät; ISO-päivät ovat Helsinki-päiviä) ──

function epookkiPaiva(iso: string): number {
  return Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / PV_MS)
}
function isoPaiva(epookki: number): string {
  return new Date(epookki * PV_MS).toISOString().slice(0, 10)
}
export function siirraPaivaa(iso: string, n: number): string {
  return isoPaiva(epookkiPaiva(iso) + n)
}
/** Päivän palan alku kiinteässä 10 päivän ruudukossa. */
export function palanAlku(iso: string): string {
  const e = epookkiPaiva(iso)
  return isoPaiva(e - (((e % PALAN_PITUUS_PV) + PALAN_PITUUS_PV) % PALAN_PITUUS_PV))
}
export function palanLoppu(alku: string): string {
  return siirraPaivaa(alku, PALAN_PITUUS_PV - 1)
}
/** Palojen alut, jotka kattavat välin start…end (molemmat mukana). */
export function palatValille(start: string, end: string): string[] {
  const eka = palanAlku(start)
  const vika = palanAlku(end < start ? start : end)
  const palat: string[] = []
  for (let e = epookkiPaiva(eka); e <= epookkiPaiva(vika); e += PALAN_PITUUS_PV) palat.push(isoPaiva(e))
  return palat
}
/** Rakentajan horisontti: tämän päivän palasta HORISONTTI_PV päivän päähän. */
export function horisontinPalat(tanaan: string): string[] {
  return palatValille(tanaan, siirraPaivaa(tanaan, HORISONTTI_PV))
}
/** Palan etäisyys tämän päivän palasta paloina: 0 = sisältää tämän päivän,
 *  1 = seuraava, negatiivinen = mennyt. */
export function palanEtaisyys(alku: string, tanaan: string): number {
  return Math.round((epookkiPaiva(alku) - epookkiPaiva(palanAlku(tanaan))) / PALAN_PITUUS_PV)
}

// ── Päivitysväli ja kelpoisuus ──────────────────────────────────────────────

/** Kuinka usein pala haetaan uudestaan: tämän päivän pala 10 min (illan
 *  ohjelma elää), seuraava 30 min, kaukaisemmat 2 h. Menneet kuten tämän
 *  päivän pala (niitä ei rakenneta, vain luetaan write-throughista). */
export function paivitysvaliMs(alku: string, tanaan: string): number {
  const d = palanEtaisyys(alku, tanaan)
  if (d <= 0) return 10 * MIN_MS
  if (d === 1) return 30 * MIN_MS
  return 120 * MIN_MS
}

/** Onko pari erääntynyt rakennettavaksi. Epäonnistuneen yrityksen jälkeen
 *  uusi yritys jo puolen välin kuluttua. */
export function onEraantynyt(rivi: { yritetty: string | null; ok: boolean }, nyt: Date, valiMs: number): boolean {
  if (!rivi.yritetty) return true
  const ika = nyt.getTime() - new Date(rivi.yritetty).getTime()
  return ika >= (rivi.ok ? valiMs : valiMs / 2)
}

/** Kelpaako tallennettu pala koosteen luettavaksi: viimeisin ONNISTUNUT haku
 *  on enintään 6 päivitysväliä vanha (tämän päivän pala 1 h, seuraava 3 h,
 *  kaukaiset 12 h). Vanhempi tai puuttuva → haetaan suoraan lähteestä.
 *  ok=false ei estä: lähteen katkossa näytetään edellinen onnistunut data
 *  (ja sources-tila kertoo katkosta). */
export function kelpaaLukuun(rivi: { haettu: string | null }, nyt: Date, tanaan: string, alku: string): boolean {
  if (!rivi.haettu) return false
  const ika = nyt.getTime() - new Date(rivi.haettu).getTime()
  return ika >= 0 && ika <= 6 * paivitysvaliMs(alku, tanaan)
}

// ── Tapahtumien jako paloihin ───────────────────────────────────────────────

function alkupaiva(e: Event): string | null {
  try { return helsinkiDateOf(e.startTime) } catch { return null }
}

/** Kuuluuko tapahtuma palaan: alkupäivä alku−KAYNNISSA_PV … loppu. */
export function kuuluuPalaan(e: Event, alku: string, loppu: string): boolean {
  const d = alkupaiva(e)
  return d !== null && d >= siirraPaivaa(alku, -KAYNNISSA_PV) && d <= loppu
}

/** Jakaa lähteen palauttamat tapahtumat paloihin (sama tapahtuma voi kuulua
 *  kahteen palaan käynnissä-säännön takia; kooste poistaa duplikaatit
 *  otsikko+päivä-avaimella). */
export function erittelePaloihin(events: Event[], palat: string[]): Map<string, Event[]> {
  const tulos = new Map<string, Event[]>(palat.map((p) => [p, []]))
  for (const e of events) {
    for (const alku of palat) {
      if (kuuluuPalaan(e, alku, palanLoppu(alku))) tulos.get(alku)!.push(e)
    }
  }
  return tulos
}

/** Sama aikavyöhykenormalisointi kuin koosteessa — tehdään JO tallennettaessa,
 *  jotta varaston data on vertailukelpoista päivien yli. Koosteen oma
 *  normalisointi on idempotentti (offsetillinen leima ei muutu). */
export function normalisoiAikaleimat(events: Event[]): Event[] {
  return events.map((e) => ({
    ...e,
    startTime: normalizeHelsinkiTimestamp(e.startTime) ?? e.startTime,
    endTime: normalizeHelsinkiTimestamp(e.endTime),
  }))
}

/** Rakentajan hakuväli palalle: menneitä päiviä ei haeta, paitsi käynnissä-
 *  säännön 4 päivää. Tämän päivän palassa (alku jopa 9 pv sitten) tämä
 *  pienentää lähteen työtä ja — tärkeämpää — lähteissä, jotka hakevat
 *  alkupäivästä eteenpäin katolla (myhelsinki: 28 pv, 200 riviä), katto ei
 *  kulu menneisiin päiviin ennen kuin palan loppupäivät on luettu. Mitattu
 *  13.10.2026: viikon ikkunassa myhelsinki 36 varastosta vs 45 suoraan. */
export function rakentajanVali(alku: string, loppu: string, tanaan: string): { start: string; end: string } {
  const aikaisin = siirraPaivaa(tanaan, -KAYNNISSA_PV)
  return { start: alku < aikaisin ? aikaisin : alku, end: loppu }
}

/** Varaston rivit kattavat vain tämän päivän −4 pv alkaen (rakentajanVali).
 *  Vanhempia päiviä kysyvä pyyntö (jaettu linkki menneelle päivälle) ei saa
 *  lukea varastoa, koska rivi näyttäisi kelvolliselta mutta puuttuisi juuri
 *  kysytyt päivät. */
export function kattaakoVarasto(start: string, tanaan: string): boolean {
  return start >= siirraPaivaa(tanaan, -KAYNNISSA_PV)
}

/** Rakennusjärjestys: läheisin pala ensin, sen sisällä pisimpään odottanut. */
export function jarjestaRakennettavat<T extends { alku: string; yritetty: string | null }>(rivit: T[], tanaan: string): T[] {
  const aika = (y: string | null) => (y ? new Date(y).getTime() : 0)
  return [...rivit].sort((a, b) =>
    palanEtaisyys(a.alku, tanaan) - palanEtaisyys(b.alku, tanaan) || aika(a.yritetty) - aika(b.yritetty) || a.alku.localeCompare(b.alku))
}

// ── Lähdereitin haku (yhteinen rakentajalle ja koosteen varahaulle) ─────────

export interface LahdeHaku {
  ok: boolean
  events: Event[]
  virhe?: string
  ms: number
}

/** Hakee yhden lähteen tapahtumat väliltä sisäisestä reitistä. Kaikki virheet
 *  (aikakatkaisu, verkko, muu kuin 200, rikkinäinen JSON) → ok:false. Hakusanaa
 *  EI välitetä: varastoon ei saa tallentua hakusanalla rajattua dataa, ja
 *  kooste suodattaa hakusanan yhtenäisesti koko lopputulokseen. */
export async function haeLahdeVali(origin: string, lahde: string, start: string, end: string, aikakatkaisuMs: number): Promise<LahdeHaku> {
  const t0 = Date.now()
  try {
    const res = await fetch(`${origin}/api/${lahde}?${new URLSearchParams({ start, end })}`, { signal: AbortSignal.timeout(aikakatkaisuMs) })
    if (!res.ok) return { ok: false, events: [], virhe: `HTTP ${res.status}`, ms: Date.now() - t0 }
    const j = (await res.json()) as { events?: Event[] }
    return { ok: true, events: normalisoiAikaleimat(Array.isArray(j.events) ? j.events : []), ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, events: [], virhe: e instanceof Error ? e.name : String(e), ms: Date.now() - t0 }
  }
}

// ── Varaston luku ja kirjoitus ──────────────────────────────────────────────

export interface LahdepalaRivi {
  lahde: string
  alku: string
  loppu: string
  tapahtumat: Event[]
  lkm: number
  ok: boolean
  virhe: string | null
  kesto_ms: number | null
  haettu: string | null
  yritetty: string | null
}

const avain = (lahde: string, alku: string) => `${lahde}|${alku}`

/** Lukee kaikkien lähteiden rivit annetuille paloille. null = varastoa ei
 *  voi käyttää (ei Supabase-asetuksia, taulu puuttuu, verkkovirhe) → kutsuja
 *  toimii kuten ennen varastoa. */
export async function lueLahdepalat(palat: string[]): Promise<{ rivit: LahdepalaRivi[] } | { virhe: string }> {
  if (!supabaseAdmin) return { virhe: 'ei supabase-asetuksia' }
  if (palat.length === 0) return { rivit: [] }
  try {
    const { data, error } = await supabaseAdmin.from(TAULU).select('*').in('alku', palat)
    if (error) return { virhe: error.message }
    return { rivit: (data ?? []) as LahdepalaRivi[] }
  } catch (e) {
    return { virhe: e instanceof Error ? e.message : String(e) }
  }
}

/** Tallennuserän yläraja tavuina. Mitattu 13.10.2026: 60 rivin kertatallennus
 *  (tämän päivän pala 1,2k tapahtumaa × 45 lähdettä) kaatui "fetch failed"
 *  -verkkovirheeseen; yksittäiset rivit ovat 1–900 kB. Erät pidetään alle
 *  ~1,5 MB:n ja epäonnistunut erä yritetään kerran uudestaan rivi kerrallaan. */
export const TALLENNUSERA_TAVUA = 1_500_000

/** Jakaa rivit tallennuseriin koon mukaan (ylisuuri rivi omana eränään). */
export function jaaEriin<T>(rivit: T[], koko: (r: T) => number, raja = TALLENNUSERA_TAVUA): T[][] {
  const erat: T[][] = []
  let era: T[] = []
  let summa = 0
  for (const r of rivit) {
    const k = koko(r)
    if (era.length > 0 && summa + k > raja) { erat.push(era); era = []; summa = 0 }
    era.push(r)
    summa += k
  }
  if (era.length > 0) erat.push(era)
  return erat
}

const rivinKoko = (r: LahdepalaRivi) => JSON.stringify(r.tapahtumat).length + 200

/** Tallentaa onnistuneet palat erissä. Palauttaa rivit joita EI saatu
 *  tallennettua (verkkovirhe tms.), jotta kutsuja voi vapauttaa niiden
 *  varauksen — muuten pala odottaisi seuraavaa päivitysväliä turhaan. */
async function tallennaOnnistuneet(rivit: LahdepalaRivi[]): Promise<LahdepalaRivi[]> {
  if (!supabaseAdmin) return rivit
  const epaonnistuneet: LahdepalaRivi[] = []
  for (const era of jaaEriin(rivit, rivinKoko)) {
    let tallennettu = false
    try {
      const { error } = await supabaseAdmin.from(TAULU).upsert(era, { onConflict: 'lahde,alku' })
      tallennettu = !error
    } catch { /* verkkovirhe → rivi kerrallaan alla */ }
    if (tallennettu) continue
    for (const r of era) {
      try {
        const { error } = await supabaseAdmin.from(TAULU).upsert([r], { onConflict: 'lahde,alku' })
        if (error) epaonnistuneet.push(r)
      } catch {
        epaonnistuneet.push(r)
      }
    }
  }
  return epaonnistuneet
}

// ── Koosteen luku: varasto + varahaku puuttuville ───────────────────────────

export interface VarastoMeta {
  /** Luettiinko varastosta (false = taulu/yhteys puuttuu → suora haku). */
  kaytetty: boolean
  /** Varastosta kelvollisina luetut (lähde, pala) -parit. */
  luettu: number
  /** Puuttuneet/vanhentuneet parit, jotka haettiin suoraan lähteestä. */
  puuttui: number
  /** Vanhimman luetun palan ikä minuutteina. */
  vanhinMin: number | null
  virhe?: string
}

export interface UlkoisetTulos {
  tulokset: Map<string, { ok: boolean; events: Event[] }>
  varasto: VarastoMeta
}

/**
 * Ulkoisten lähteiden tapahtumat välille start…end: varastosta, ja puuttuvat
 * tai vanhentuneet palat suoraan lähteestä (yksi kutsu / lähde puuttuvien
 * palojen yli, tulos kirjoitetaan varastoon). Palauttaa lähteittäin
 * välille rajatut tapahtumat samassa muodossa kuin lähdereitit.
 */
export async function haeUlkoisetLahteet(o: { origin: string; start: string; end: string; nyt?: Date; aikakatkaisuMs?: number; ohita?: boolean }): Promise<UlkoisetTulos> {
  const nyt = o.nyt ?? new Date()
  const tanaan = helsinkiToday()
  const palat = palatValille(o.start, o.end)
  const alaraja = siirraPaivaa(o.start, -KAYNNISSA_PV)
  const valilla = (e: Event) => { const d = alkupaiva(e); return d !== null && d >= alaraja && d <= o.end }

  // ohita: suora haku ilman varastoa eikä write-throughia (/api/events?varasto=0)
  // — A/B-vertailu ja hätäkytkin, jos varaston data näyttää väärältä.
  const luettu = o.ohita ? { virhe: 'ohitettu (varasto=0)' }
    : !kattaakoVarasto(o.start, tanaan) ? { virhe: 'mennyt väli (varasto kattaa tästä päivästä −4 pv)' }
    : await lueLahdepalat(palat)
  const varastossa = new Map<string, LahdepalaRivi>()
  if ('rivit' in luettu) for (const r of luettu.rivit) varastossa.set(avain(r.lahde, r.alku), r)
  const kaytetty = 'rivit' in luettu

  const tulokset = new Map<string, { ok: boolean; events: Event[] }>()
  const meta: VarastoMeta = { kaytetty, luettu: 0, puuttui: 0, vanhinMin: null, ...('virhe' in luettu ? { virhe: luettu.virhe } : {}) }
  const kirjoitettavat: LahdepalaRivi[] = []

  await Promise.all(ULKOISET_LAHTEET.map(async (lahde) => {
    const events: Event[] = []
    let ok = true
    const puuttuvat: string[] = []
    for (const alku of palat) {
      const r = varastossa.get(avain(lahde, alku))
      if (r && kelpaaLukuun(r, nyt, tanaan, alku)) {
        meta.luettu++
        const ikaMin = Math.round((nyt.getTime() - new Date(r.haettu!).getTime()) / MIN_MS)
        if (meta.vanhinMin === null || ikaMin > meta.vanhinMin) meta.vanhinMin = ikaMin
        if (!r.ok) ok = false
        for (const e of r.tapahtumat) if (valilla(e)) events.push(e)
      } else {
        puuttuvat.push(alku)
      }
    }
    if (puuttuvat.length > 0) {
      meta.puuttui += puuttuvat.length
      // Yksi kutsu puuttuvien palojen yli — sama kuin koosteen vanha suora
      // haku, 8 s aikakatkaisu (lähteen kohtalo riippuu vain sen omasta
      // nopeudesta, ks. koosteen historia).
      const haku = await haeLahdeVali(o.origin, lahde, puuttuvat[0], palanLoppu(puuttuvat[puuttuvat.length - 1]), o.aikakatkaisuMs ?? 8000)
      if (!haku.ok) ok = false
      else {
        const jaettu = erittelePaloihin(haku.events, puuttuvat)
        const haettuISO = nyt.toISOString()
        for (const alku of puuttuvat) {
          const palanTapahtumat = jaettu.get(alku) ?? []
          if (kaytetty) {
            kirjoitettavat.push({ lahde, alku, loppu: palanLoppu(alku), tapahtumat: palanTapahtumat, lkm: palanTapahtumat.length, ok: true, virhe: null, kesto_ms: haku.ms, haettu: haettuISO, yritetty: haettuISO })
          }
        }
        for (const e of haku.events) if (valilla(e)) events.push(e)
      }
    }
    tulokset.set(lahde, { ok, events })
  }))

  // Write-through: varasto paranee liikenteestä. Ei estä vastausta, mutta
  // odotetaan loppuun (funktio ei saa päättyä kesken kirjoituksen).
  if (kirjoitettavat.length > 0) await tallennaOnnistuneet(kirjoitettavat)  // epäonnistuneet jäävät seuraavaan kertaan

  return { tulokset, varasto: meta }
}

// ── Rakentaja (app/api/warm, 5 min välein) ──────────────────────────────────

export interface RakennusTulos {
  ok: boolean
  virhe?: string
  ms: number
  /** Horisontin palojen määrä ja rivit (lähde × pala). */
  palat: number
  rivit: number
  eraantyneita: number
  haettu: number
  onnistui: number
  epaonnistui: number
  /** Varatut mutta budjetin loputtua vapautetut parit. */
  vapautettu: number
  siivottu: number
}

interface MetaRivi { lahde: string; alku: string; loppu: string; ok: boolean; haettu: string | null; yritetty: string | null }

/**
 * Hakee erääntyneet (lähde, pala) -parit horisontista ja tallentaa ne.
 * Rinnakkaiset rakentajat (cron + UptimeRobot) eivät hae samaa paria:
 * pari VARATAAN päivittämällä yritetty-leima ehdolla "yritetty vanhempi kuin
 * puoli päivitysväliä", ja vain varauksen saaneet parit haetaan.
 */
export async function rakennaVarasto(o: { origin: string; nyt?: Date; budjettiMs?: number; rinnakkain?: number; maxHaut?: number; aikakatkaisuMs?: number }): Promise<RakennusTulos> {
  const t0 = Date.now()
  const nyt = o.nyt ?? new Date()
  const tanaan = helsinkiToday()
  const budjetti = o.budjettiMs ?? 30_000
  const rinnakkain = o.rinnakkain ?? 8
  const maxHaut = o.maxHaut ?? 40
  const aikakatkaisu = o.aikakatkaisuMs ?? 20_000
  const tulos: RakennusTulos = { ok: false, ms: 0, palat: 0, rivit: 0, eraantyneita: 0, haettu: 0, onnistui: 0, epaonnistui: 0, vapautettu: 0, siivottu: 0 }
  const valmis = (virhe?: string) => { tulos.ms = Date.now() - t0; if (virhe) tulos.virhe = virhe; else tulos.ok = true; return tulos }
  if (!supabaseAdmin) return valmis('ei supabase-asetuksia')

  try {
    const palat = horisontinPalat(tanaan)
    tulos.palat = palat.length

    // 1) Rivit olemassa jokaiselle (lähde, pala) -parille — uudet palat
    //    ilmestyvät kun aika kuluu. ignoreDuplicates: vanhat rivit eivät muutu.
    const pohjat = ULKOISET_LAHTEET.flatMap((lahde) => palat.map((alku) => ({ lahde, alku, loppu: palanLoppu(alku) })))
    const pohja = await supabaseAdmin.from(TAULU).upsert(pohjat, { onConflict: 'lahde,alku', ignoreDuplicates: true })
    if (pohja.error) return valmis(`rivien luonti: ${pohja.error.message}`)

    // 2) Menneet palat pois (write-through voi luoda niitä menneiden
    //    päivien pyynnöistä; ne vanhenevat itsestään eikä niitä rakenneta).
    const siivous = await supabaseAdmin.from(TAULU).delete().lt('loppu', siirraPaivaa(tanaan, -1)).select('lahde')
    tulos.siivottu = siivous.data?.length ?? 0

    // 3) Erääntyneet parit läheisin ensin.
    const meta = await supabaseAdmin.from(TAULU).select('lahde, alku, loppu, ok, haettu, yritetty').in('alku', palat)
    if (meta.error) return valmis(`luku: ${meta.error.message}`)
    const rivit = (meta.data ?? []) as MetaRivi[]
    tulos.rivit = rivit.length
    const eraantyneet = jarjestaRakennettavat(rivit.filter((r) => onEraantynyt(r, nyt, paivitysvaliMs(r.alku, tanaan))), tanaan)
    tulos.eraantyneita = eraantyneet.length
    if (eraantyneet.length === 0) return valmis()

    // 4) Varaus palakohtaisesti (yksi päivitys / pala): ehto estää kahta
    //    rakentajaa hakemasta samaa paria.
    const nytISO = nyt.toISOString()
    const varatut: MetaRivi[] = []
    const ehdokkaat = eraantyneet.slice(0, maxHaut)
    for (const alku of palat) {
      const nimet = ehdokkaat.filter((r) => r.alku === alku).map((r) => r.lahde)
      if (nimet.length === 0) continue
      const raja = new Date(nyt.getTime() - paivitysvaliMs(alku, tanaan) / 2).toISOString()
      const varaus = await supabaseAdmin.from(TAULU).update({ yritetty: nytISO }).eq('alku', alku).in('lahde', nimet)
        .or(`yritetty.is.null,yritetty.lt.${raja}`).select('lahde, alku, loppu, ok, haettu, yritetty')
      if (!varaus.error) varatut.push(...((varaus.data ?? []) as MetaRivi[]))
    }

    // 5) Haut rinnakkain budjetin rajoissa.
    const jono = jarjestaRakennettavat(varatut, tanaan)
    const onnistuneet: LahdepalaRivi[] = []
    const epaonnistuneet: { lahde: string; alku: string; virhe: string; ms: number }[] = []
    const vapautettavat: MetaRivi[] = []
    const tyontekija = async () => {
      while (jono.length > 0) {
        if (Date.now() - t0 > budjetti) { vapautettavat.push(...jono.splice(0)); return }
        const r = jono.shift()!
        const vali = rakentajanVali(r.alku, r.loppu, tanaan)
        const haku = await haeLahdeVali(o.origin, r.lahde, vali.start, vali.end, aikakatkaisu)
        tulos.haettu++
        if (haku.ok) {
          const palanTapahtumat = haku.events.filter((e) => kuuluuPalaan(e, r.alku, r.loppu))
          const leima = new Date().toISOString()
          onnistuneet.push({ lahde: r.lahde, alku: r.alku, loppu: r.loppu, tapahtumat: palanTapahtumat, lkm: palanTapahtumat.length, ok: true, virhe: null, kesto_ms: haku.ms, haettu: leima, yritetty: leima })
        } else {
          epaonnistuneet.push({ lahde: r.lahde, alku: r.alku, virhe: haku.virhe ?? 'tuntematon', ms: haku.ms })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(rinnakkain, jono.length) }, tyontekija))

    // 6) Tallennus: onnistuneet kerralla (data + leimat), epäonnistuneet vain
    //    tilakentät (edellinen onnistunut data säilyy), vapautetut takaisin
    //    jonoon nollaamalla varaus.
    if (onnistuneet.length > 0) {
      const tallentamatta = await tallennaOnnistuneet(onnistuneet)
      tulos.onnistui = onnistuneet.length - tallentamatta.length
      // Tallentamatta jääneet vapautetaan heti uudelleen haettaviksi — muuten
      // varaus (yritetty) lykkäisi niitä puoli päivitysväliä.
      for (const r of tallentamatta) vapautettavat.push({ lahde: r.lahde, alku: r.alku, loppu: r.loppu, ok: false, haettu: null, yritetty: null })
      if (tallentamatta.length > 0) tulos.virhe = `tallennus epäonnistui ${tallentamatta.length} riville`
    }
    for (const e of epaonnistuneet) {
      await supabaseAdmin.from(TAULU).update({ ok: false, virhe: e.virhe.slice(0, 200), kesto_ms: e.ms, yritetty: new Date().toISOString() }).eq('lahde', e.lahde).eq('alku', e.alku)
      tulos.epaonnistui++
    }
    for (const v of vapautettavat) {
      await supabaseAdmin.from(TAULU).update({ yritetty: v.yritetty }).eq('lahde', v.lahde).eq('alku', v.alku)
      tulos.vapautettu++
    }
    return valmis()
  } catch (e) {
    return valmis(e instanceof Error ? e.message : String(e))
  }
}
