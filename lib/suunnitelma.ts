// Oma suunnitelma — käyttäjän itse kokoama päivän/illan ohjelma.
//
// MALLI: suunnitelma on JÄRJESTETTY lista askeleita (tapahtuma, ravintola,
// opaskohde tai oma vapaa askel). Tapahtumilla on KIINNITETTY alkuaika
// (ankkuri — oikeaa aikataulua ei sovitella); muille sovitin ehdottaa ajat.
// Käyttäjän järjestys on laki: sovitin EI järjestä uudelleen, vaan laskee
// ajat annetussa järjestyksessä ja varoittaa jos jokin ei toimi (kiinni,
// ei ehdi ankkurille, menee yli puolenyön katon).
//
// SOVITIN nojaa kaarimoottorin testattuihin primitiiveihin: kävelyajat
// (lib/group), aukiolo-clamp (lib/opening-hours) ja roolikestot/puskurit
// (lib/candidate). Puhdas funktio — now annetaan parametrina.
//
// TALLENNUS: localStorage (ei kirjautumista), MONTA suunnitelmaa joista yksi on
// aktiivinen (ks. varasto-osio alempana). Jakaminen tekee palvelimelle
// SNAPSHOTIN — jaettu linkki ei elä tämän tilan mukana.

import type { Restaurant, Event } from './types'
// Vain tyyppi — poistuu käännöksessä, joten runtime-kehää komponenttiin ei synny.
import type { PaikkaTieto } from '../components/PlaceDetailPanel'
import { walkMinutesBetween } from './group'
import { clampToOpenHour, isOpenAt } from './opening-hours'
import { DUR_H, TRAVEL_BUFFER_H, ARC_END_CAP_H, DRINKS_END_CAP_H } from './group-scheduler'
import { helsinkiClock } from './arvo-ilta'
import { helsinkiToday } from './helsinki-time'
import { tuntematonAika } from './utils'
import { externalUrlFor } from './event-links'
import { naytettavaKuvaus } from './event-text'
import { track } from './track'

export type AskelRooli = 'tekeminen' | 'ruoka' | 'drinkit' | 'ohjelma'
export type Kulkutapa = 'kavely' | 'julkinen' | 'pyora'

export const KULKUTAPA_META: Record<Kulkutapa, { emoji: string; riviAvain: string }> = {
  kavely: { emoji: '🚶', riviAvain: 'plan.walk' },
  julkinen: { emoji: '🚇', riviAvain: 'plan.by_julkinen' },
  pyora: { emoji: '🚴', riviAvain: 'plan.by_pyora' },
}

export interface SuunnitelmaAskel {
  id: string
  tyyppi: 'tapahtuma' | 'ravintola' | 'paikka' | 'oma'
  /** Alkuperäinen kohteen id — "jo suunnitelmassa" -tila napeille. */
  viiteId?: string
  nimi: string
  osoite?: string
  lat?: number
  lon?: number
  kuva?: string | null
  /** Tapahtuman OIKEA alkuaika (ISO). Ankkuri: sovitin ei siirrä tätä. */
  ankkuriISO?: string
  /** Käyttäjän käsin asettama kellonaika "HH:MM" — voittaa ehdotuksen. */
  kasinKlo?: string
  /** Käyttäjä kuittasi askeleen varoituksen pois ("tiedän kyllä, menen
   *  ratikalla") — varoitus lasketaan yhä mutta UI ei näytä sitä.
   *  Nollautuu kun askeleen aikaa muutetaan. */
  varoitusKuitattu?: boolean
  /** Siirtymän kulkutapa EDELLISESTÄ askeleesta tähän. Puuttuva = kävely
   *  omalla arviolla (walkMinutesBetween). Valinta hakee oikeat ajat
   *  Digitransitista (/api/matka) ja tallettaa keston siirtymaMin-kenttään. */
  kulkutapa?: Kulkutapa
  /** Valitun kulkutavan kesto minuutteina (Digitransit-reititys). */
  siirtymaMin?: number
  /** OSM opening_hours aukiolotarkistuksiin (ravintolat, opaskohteet). */
  aukiolot?: string | null
  rooli: AskelRooli
  /** Ravintolan TYYPPIKOHTAINEN oletuskellonaika "HH:MM" (ruokapaikat 18.00,
   *  kahvilat 15.00, baarit 23.00, yökerhot 00.30 — HANDOFF-mobiili §6).
   *  Käytetään VAIN kun askel on suunnitelman ensimmäinen eikä käyttäjä ole
   *  asettanut aloitusaikaa: ketjun muut askeleet saavat aikansa sovittimesta
   *  (edellisen loppu + siirtymä), jotta ilta etenee järjestyksessä eikä
   *  jokainen ravintola hyppää omaan vakioaikaansa. */
  oletusKlo?: string
  /** Infokortti: lyhyt kuvaus + turvallinen lisätietolinkki — talletetaan
   *  lisäyshetkellä, jotta myös JAETTU suunnitelma voi näyttää ne. */
  kuvaus?: string
  linkki?: string | null
  /** Rikastettu tilannekuva jaetun sivun infopaneelia varten: yksittäisiä
   *  siivottuja kenttiä, EI kokonaisia lähdeolioita (auditoinnin linjaus
   *  5.9.2026) — vastaanottajan kortti näyttää silti samat tiedot kuin
   *  sovelluksen oma kortti (omistaja 6.9.2026). */
  paikkaNimi?: string
  /** Tapahtuman loppuaika (ISO) — jaetun kortin aikarivi "klo 19.00–20.15". */
  loppuISO?: string
  hinta?: string | null
  tyyppiNimike?: string
  puhelin?: string | null
  arvosana?: number
  arvosteluja?: number
  /** Koko lähdeolio lisäyshetkeltä: askeleen napautus avaa sillä SAMAN
   *  oikean infopaneelin kuin muuallakin sovelluksessa. Kulkee vain
   *  paikallisessa varastossa — jaon POST riisuu tämän pois (snapshot-
   *  kentät riittävät jaetulla sivulla). Puuttuu vanhoista ja jaetusta
   *  kopioiduista askeleista → silloin näytetään suppea infolevitys. */
  data?: AskelData
}

export type AskelData =
  | { laji: 'tapahtuma'; tapahtuma: Event }
  | { laji: 'ravintola'; ravintola: Restaurant; tyyli?: { cp: string; color: string } }
  | { laji: 'paikka'; paikka: PaikkaTieto; guideSlug: string }

export interface Suunnitelma {
  otsikko: string
  /** YYYY-MM-DD (Helsinki). */
  paiva: string
  /** Aloitusaika "HH:MM" — tyhjä = sovitin päättelee. */
  alkuKlo?: string
  askeleet: SuunnitelmaAskel[]
}

export const ASKEL_MAX = 15

/** Roolin oletuskesto tunneissa — samat kuin kaarimoottorissa. */
export function roolinKesto(rooli: AskelRooli): number {
  const map: Record<AskelRooli, number> = {
    tekeminen: DUR_H.activity,
    ruoka: DUR_H.food,
    drinkit: DUR_H.drinks,
    ohjelma: DUR_H.program,
  }
  return map[rooli]
}

export const ROOLI_META: Record<AskelRooli, { emoji: string }> = {
  tekeminen: { emoji: '🧭' },
  ruoka: { emoji: '🍽' },
  drinkit: { emoji: '🍸' },
  ohjelma: { emoji: '🎟' },
}

// ── Aikamuunnokset (Helsinki-seinäkello desimaalitunteina) ──────────────────

export function kloTunneiksi(klo: string): number | null {
  const m = klo.match(/^(\d{1,2})[:.](\d{2})$/)
  if (!m) return null
  const h = Number(m[1]) + Number(m[2]) / 60
  return h >= 0 && h < 24 ? h : null
}

export function tunnitKloksi(h: number): string {
  const norm = ((h % 24) + 24) % 24
  const t = Math.floor(norm)
  const min = Math.round((norm - t) * 60)
  if (min === 60) return `${String((t + 1) % 24).padStart(2, '0')}:00`
  return `${String(t).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** ISO-aikaleiman Helsinki-desimaalitunti. */
function ankkuriTunti(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return g('hour') + g('minute') / 60
}

// ── Aikasovitin ──────────────────────────────────────────────────────────────

export type VaroitusSyy = 'kiinni' | 'ei-ehdi' | 'myohaan' | 'mennyt'

export interface SovitettuAskel {
  askel: SuunnitelmaAskel
  /** Ehdotettu/kiinnitetty alkuaika "HH:MM". */
  klo: string
  /** Kävelyminuutit EDELLISESTÄ askeleesta (undefined = sama kortteli / ei koordinaatteja). */
  kavelyMin?: number
  varoitus?: VaroitusSyy
}

/** Laskee ajat käyttäjän järjestyksessä. Ankkurit (tapahtumat) ja käsin
 *  asetetut ajat ovat kiinteitä; muille ehdotetaan aikaisin toteutettava
 *  aika: edellisen loppu + kävely + 15 min puskuri, aukioloihin sovitettuna. */
export function sovitaAjat(s: Suunnitelma, nyt: Date): SovitettuAskel[] {
  if (s.askeleet.length === 0) return []
  const kello = helsinkiClock(nyt)
  // Päivätön suunnitelma (esim. ensimmäinen lisäys oli ravintola, jolla ei
  // ole päivämäärää) sovitetaan tälle päivälle. Ilman vartijaa syntyi
  // Invalid Date, joka jumitti aukiolokirjaston ikuissilmukkaan (6.9.2026).
  const kaytettyPaiva = /^\d{4}-\d{2}-\d{2}$/.test(s.paiva) ? s.paiva : kello.date
  const paivaDate = new Date(`${kaytettyPaiva}T12:00:00`)
  const tanaan = kello.date === kaytettyPaiva

  // Aloituskursori: käyttäjän valinta → ensimmäisen askeleen OMA kiinnitetty
  // aika → oletus. Aiempi versio hyppäsi suoraan oletukseen (18:00) vaikka
  // käyttäjä oli asettanut ensimmäiselle askeleelle ajan käsin — haamu-
  // lähtöaika tuotti vääriä "et ehdi" -varoituksia koko ketjuun (omistajan
  // havainto 6.9.2026: käsin 17:00 sai varoituksen "edellisestä" jota ei ole).
  let kursori: number
  const alkuKasin = s.alkuKlo ? kloTunneiksi(s.alkuKlo) : null
  const eka = s.askeleet[0]
  const ekaKiinnitetty = eka.kasinKlo
    ? kloTunneiksi(eka.kasinKlo)
    : eka.ankkuriISO && !tuntematonAika(eka.ankkuriISO)
      ? ankkuriTunti(eka.ankkuriISO)
      : null
  // Ensimmäisen askeleen tyyppikohtainen oletusaika (ravintolat): tänään
  // vain jos se ei ole jo mennyt — muuten "nyt + 30 min" kuten ennen.
  const ekaOletus = eka.oletusKlo ? oletusTunti(eka.oletusKlo) : null
  let oletusKaytossa = false
  if (alkuKasin !== null) {
    kursori = alkuKasin
  } else if (ekaKiinnitetty !== null) {
    kursori = ekaKiinnitetty
  } else if (tanaan) {
    // Tänään: seuraava tasavartti + puoli tuntia valmistautumiseen.
    kursori = Math.ceil((kello.hour + 0.5) * 4) / 4
    if (ekaOletus !== null && ekaOletus >= kursori) { kursori = ekaOletus; oletusKaytossa = true }
  } else if (ekaOletus !== null) {
    kursori = ekaOletus
    oletusKaytossa = true
  } else {
    kursori = 18
  }

  const tulos: SovitettuAskel[] = []
  let edellinen: SuunnitelmaAskel | null = null

  for (const askel of s.askeleet) {
    // Siirtymä edellisestä: valittu kulkutapa (Digitransit-kesto) tai
    // kävelyarvio + puskuri (sama kortteli → pieni tauko).
    let kavelyMin: number | undefined
    if (edellinen) {
      kavelyMin = askel.siirtymaMin ?? walkMinutesBetween(edellinen, askel)
      kursori += (kavelyMin !== undefined ? kavelyMin / 60 : 0) + TRAVEL_BUFFER_H
    }

    let klo: number
    let varoitus: VaroitusSyy | undefined

    const ankkuri = askel.ankkuriISO && !tuntematonAika(askel.ankkuriISO)
      ? ankkuriTunti(askel.ankkuriISO)
      : null
    const kasin = askel.kasinKlo ? kloTunneiksi(askel.kasinKlo) : null

    if (kasin !== null) {
      klo = kasin
      // "Et ehdi edellisestä" vain jos edellinen on olemassa — ensimmäisen
      // askeleen aika on määritelmällisesti saavutettavissa.
      if (edellinen && kursori > klo + 0.05) varoitus = 'ei-ehdi'
      else if (askel.aukiolot && isOpenAt(askel.aukiolot, kelloksi(paivaDate, klo)) === false) varoitus = 'kiinni'
    } else if (ankkuri !== null) {
      klo = ankkuri
      if (edellinen && kursori > klo + 0.05) varoitus = 'ei-ehdi'
    } else {
      const sovitettu = askel.aukiolot
        ? clampToOpenHour(askel.aukiolot, paivaDate, kursori, Math.min(roolinKesto(askel.rooli), 1))
        : kursori
      if (sovitettu === null) {
        klo = kursori
        varoitus = 'kiinni'
      } else {
        klo = Math.max(sovitettu, kursori)
        // clampToOpenHour voi palauttaa kursoria AIEMMAN ikkunan alun (paikka
        // ehti kiinni) — max nostaisi ajan sulkeutumisen yli ilman varoitusta.
        if (askel.aukiolot && isOpenAt(askel.aukiolot, kelloksi(paivaDate, klo)) === false) varoitus = 'kiinni'
      }
    }

    if (!varoitus && tanaan && klo + 0.05 < kello.hour) varoitus = 'mennyt'
    // Yökerhon oma oletus 00.30 on tarkoituksella myöhään — siitä ei varoiteta.
    const omaMyohainenOletus = oletusKaytossa && edellinen === null && Math.abs(klo - kursori) < 0.01
    // Drinkkiaskel (baari/yökerho) saa alkaa 01.30 asti — jatkoille "myöhään"
    // ei ole varoitus, "kiinni" on. Muut askeleet 23.30.
    const katto = askel.rooli === 'drinkit' ? DRINKS_END_CAP_H : ARC_END_CAP_H
    if (!varoitus && klo > katto && !omaMyohainenOletus) varoitus = 'myohaan'

    tulos.push({ askel, klo: tunnitKloksi(klo), kavelyMin, varoitus })
    // Jatko lasketaan ajasta jonka käyttäjä NÄKEE — kiinnitetty aika on
    // totuus, ei piilokursori (automaattiaskeleilla klo >= kursori, sama tulos).
    kursori = klo + roolinKesto(askel.rooli)
    edellinen = askel
  }
  return tulos
}

/** "HH:MM" → desimaalitunti; alle klo 05 tulkitaan seuraavan vuorokauden
 *  puolelle (00:30 → 24.5), jotta yökerho asettuu illan JATKOKSI eikä
 *  aamuyöhön ennen illallista. */
function oletusTunti(klo: string): number | null {
  const h = kloTunneiksi(klo)
  if (h === null) return null
  return h < 5 ? h + 24 : h
}

function kelloksi(paiva: Date, h: number): Date {
  const d = new Date(paiva)
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)
  return d
}

// ── Tila (localStorage + tilaajat) ───────────────────────────────────────────
//
// MONTA SUUNNITELMAA (omistaja 2.11.2026: "suunnitelman voi tallentaa
// itselleen talteen ja tehdä vaikka monta valmiiksi"). Varastossa on lista
// tallennettuja suunnitelmia ja yksi AKTIIVINEN, jota keräilynapit ja
// Suunnitelma-välilehti muokkaavat. Vanha yhden suunnitelman API
// (lueSuunnitelma, lisaaTapahtuma, …) toimii ennallaan aktiiviseen, joten
// paneelien "Lisää suunnitelmaan" ei tiedä listasta mitään.
//
// "Tallenna" ei ole erillinen toiminto: jokainen suunnitelma on aina
// tallessa, ja Uusi suunnitelma jättää edellisen listaan. Kaikki tallentuu
// tähän laitteeseen ilman kirjautumista, kuten suosikit.
//
// SIIRTO: vanha avain 'oma-suunnitelma-v1' luetaan ensimmäisellä kerralla
// listan ensimmäiseksi suunnitelmaksi. Avainta ei poisteta eikä päivitetä —
// paluu vanhaan versioon näyttäisi viimeisimmän yhden suunnitelman.
//
// KIINTIÖ: askeleen täysi lähdeolio (data) on raskain osa. Jos localStorage
// täyttyy, tallennus yritetään uudelleen ilman muiden kuin aktiivisen
// suunnitelman lähdeolioita, sitten ilman yhtäkään (karsiLahdeoliot) —
// suunnitelmat säilyvät, vain askeleen napautus avaa suppean infokortin.

const LS_AVAIN_VANHA = 'oma-suunnitelma-v1'
const LS_AVAIN = 'omat-suunnitelmat-v1'
/** Listan katto: 20 × 15 askelta pysyy reilusti localStoragen rajoissa. */
export const SUUNNITELMA_MAX = 20

export interface TallennettuSuunnitelma extends Suunnitelma {
  id: string
  /** ISO-aikaleimat: luotu ja viimeksi muokattu (listan järjestys). */
  luotu: string
  muokattu: string
}

export interface SuunnitelmaVarasto {
  aktiivinen: string
  suunnitelmat: TallennettuSuunnitelma[]
}

const PAIVA_RE = /^\d{4}-\d{2}-\d{2}$/

function uusiSuunnitelmaId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function tyhjaTallennettu(nyt: string): TallennettuSuunnitelma {
  return { id: uusiSuunnitelmaId(), otsikko: '', paiva: '', askeleet: [], luotu: nyt, muokattu: nyt }
}

/** Kelpuuttaa yhden suunnitelman raakadatasta (uusi tai vanha avain);
 *  null = ei suunnitelma. Askeleista hyväksytään nimelliset oliot. */
function kelpuutaSuunnitelma(raaka: unknown, nyt: string): TallennettuSuunnitelma | null {
  if (!raaka || typeof raaka !== 'object') return null
  const r = raaka as Partial<TallennettuSuunnitelma>
  if (!Array.isArray(r.askeleet)) return null
  const askeleet = r.askeleet
    .filter((a): a is SuunnitelmaAskel => !!a && typeof a === 'object' && typeof (a as SuunnitelmaAskel).nimi === 'string')
    .slice(0, ASKEL_MAX)
    .map((a) => (typeof a.id === 'string' && a.id ? a : { ...a, id: uusiId() }))
  return {
    id: typeof r.id === 'string' && r.id ? r.id : uusiSuunnitelmaId(),
    otsikko: typeof r.otsikko === 'string' ? r.otsikko.slice(0, 80) : '',
    paiva: typeof r.paiva === 'string' ? r.paiva : '',
    alkuKlo: typeof r.alkuKlo === 'string' ? r.alkuKlo : undefined,
    askeleet,
    luotu: typeof r.luotu === 'string' ? r.luotu : nyt,
    muokattu: typeof r.muokattu === 'string' ? r.muokattu : nyt,
  }
}

/** Rakentaa varaston raakadatasta: uusi avain → lista; muuten vanha yhden
 *  suunnitelman avain siirretään listan ainoaksi; muuten yksi tyhjä
 *  suunnitelma. Aktiivinen osoittaa aina olemassa olevaan, id:t ovat
 *  yksilöllisiä ja lista mahtuu kattoon (aktiivinen säilyy aina).
 *  Puhdas funktio — testattavissa ilman selainta. */
export function normalisoiVarasto(uusi: unknown, vanha: unknown, nyt: string): SuunnitelmaVarasto {
  let lista: TallennettuSuunnitelma[] = []
  let aktiivinen = ''
  const u = uusi as Partial<SuunnitelmaVarasto> | null
  if (u && typeof u === 'object' && Array.isArray(u.suunnitelmat)) {
    lista = u.suunnitelmat.map((s) => kelpuutaSuunnitelma(s, nyt)).filter((s): s is TallennettuSuunnitelma => s !== null)
    aktiivinen = typeof u.aktiivinen === 'string' ? u.aktiivinen : ''
  } else {
    const siirretty = kelpuutaSuunnitelma(vanha, nyt)
    if (siirretty) { lista = [siirretty]; aktiivinen = siirretty.id }
  }
  const nahdyt = new Set<string>()
  lista = lista.map((s) => {
    const yksilollinen = nahdyt.has(s.id) ? { ...s, id: uusiSuunnitelmaId() } : s
    nahdyt.add(yksilollinen.id)
    return yksilollinen
  })
  if (lista.length > SUUNNITELMA_MAX) {
    lista = [...lista.filter((s) => s.id === aktiivinen), ...lista.filter((s) => s.id !== aktiivinen)].slice(0, SUUNNITELMA_MAX)
  }
  if (lista.length === 0) lista = [tyhjaTallennettu(nyt)]
  if (!lista.some((s) => s.id === aktiivinen)) aktiivinen = lista[0].id
  return { aktiivinen, suunnitelmat: lista }
}

export function onMennytSuunnitelma(s: Pick<Suunnitelma, 'paiva'>, tanaan: string): boolean {
  return PAIVA_RE.test(s.paiva) && s.paiva < tanaan
}

/** Listan järjestys näkymässä: tulevat päivät nousevasti (sama päivä →
 *  viimeksi muokattu ensin), sitten päivättömät viimeksi muokattu ensin,
 *  lopuksi menneet uusin ensin. Puhdas funktio. */
export function jarjestaSuunnitelmat(lista: TallennettuSuunnitelma[], tanaan: string): TallennettuSuunnitelma[] {
  const paivallinen = (s: TallennettuSuunnitelma) => PAIVA_RE.test(s.paiva)
  const tulevat = lista.filter((s) => paivallinen(s) && !onMennytSuunnitelma(s, tanaan))
    .sort((a, b) => a.paiva.localeCompare(b.paiva) || b.muokattu.localeCompare(a.muokattu))
  const paivattomat = lista.filter((s) => !paivallinen(s)).sort((a, b) => b.muokattu.localeCompare(a.muokattu))
  const menneet = lista.filter((s) => onMennytSuunnitelma(s, tanaan))
    .sort((a, b) => b.paiva.localeCompare(a.paiva) || b.muokattu.localeCompare(a.muokattu))
  return [...tulevat, ...paivattomat, ...menneet]
}

/** Poistaa suunnitelman varastosta. Aktiivisen poisto siirtää aktiivisuuden
 *  listajärjestyksen ensimmäiseen; viimeisen poisto jättää uuden tyhjän.
 *  Tuntematon id → sama varasto. Puhdas funktio. */
export function poistaVarastosta(v: SuunnitelmaVarasto, id: string, nyt: string, tanaan: string): SuunnitelmaVarasto {
  const jaljella = v.suunnitelmat.filter((s) => s.id !== id)
  if (jaljella.length === v.suunnitelmat.length) return v
  if (jaljella.length === 0) {
    const tyhja = tyhjaTallennettu(nyt)
    return { aktiivinen: tyhja.id, suunnitelmat: [tyhja] }
  }
  const aktiivinen = v.aktiivinen === id ? jarjestaSuunnitelmat(jaljella, tanaan)[0].id : v.aktiivinen
  return { aktiivinen, suunnitelmat: jaljella }
}

function ilmanLahdeoliota(a: SuunnitelmaAskel): SuunnitelmaAskel {
  const kopio = { ...a }
  delete kopio.data
  return kopio
}

/** Riisuu askelten täydet lähdeoliot muilta kuin säilytettävältä
 *  suunnitelmalta (null = kaikilta) — kiintiön ylittyessä tallennus
 *  yritetään uudelleen kevyempänä. Koskemattomat suunnitelmat säilyttävät
 *  viitteensä. Puhdas funktio. */
export function karsiLahdeoliot(v: SuunnitelmaVarasto, sailyta: string | null): SuunnitelmaVarasto {
  return {
    ...v,
    suunnitelmat: v.suunnitelmat.map((s) => (s.id === sailyta || !s.askeleet.some((a) => a.data)
      ? s
      : { ...s, askeleet: s.askeleet.map(ilmanLahdeoliota) })),
  }
}

const TYHJA: TallennettuSuunnitelma = { id: '', otsikko: '', paiva: '', askeleet: [], luotu: '', muokattu: '' }
const EI_YHTAAN: TallennettuSuunnitelma[] = []
const PALVELIN_VARASTO: SuunnitelmaVarasto = { aktiivinen: '', suunnitelmat: EI_YHTAAN }

let tila: SuunnitelmaVarasto | null = null
const tilaajat = new Set<() => void>()

function lueJson(avain: string): unknown {
  try {
    const raaka = localStorage.getItem(avain)
    return raaka ? JSON.parse(raaka) : null
  } catch {
    return null
  }
}

function lataaVarasto(): SuunnitelmaVarasto {
  if (tila) return tila
  if (typeof window === 'undefined') return PALVELIN_VARASTO
  tila = normalisoiVarasto(lueJson(LS_AVAIN), lueJson(LS_AVAIN_VANHA), new Date().toISOString())
  return tila
}

/** Kirjoittaa varaston. Kiintiön ylittyessä kevennetään portaittain; jos
 *  mikään ei mene läpi (privaattitila), tila jää muistiin istunnon ajaksi. */
function tallenna(v: SuunnitelmaVarasto): void {
  const yritykset = [v, karsiLahdeoliot(v, v.aktiivinen), karsiLahdeoliot(v, null)]
  for (const yritys of yritykset) {
    try {
      localStorage.setItem(LS_AVAIN, JSON.stringify(yritys))
      tila = yritys
      return
    } catch { /* kiintiö täynnä tai privaattitila → seuraava porras */ }
  }
}

function paivitaVarasto(muutos: (v: SuunnitelmaVarasto) => SuunnitelmaVarasto): void {
  const vanha = lataaVarasto()
  const uusi = muutos(vanha)
  if (uusi === vanha) return
  tila = uusi
  tallenna(uusi)
  tilaajat.forEach((cb) => cb())
}

/** Muuttaa AKTIIVISTA suunnitelmaa. Muutos palauttaa koko suunnitelman
 *  sisällön (kuten ennen listaa); id ja luontiaika säilyvät, muokattu päivittyy. */
function paivita(muutos: (s: Suunnitelma) => Suunnitelma): void {
  paivitaVarasto((v) => {
    const nyt = new Date().toISOString()
    return {
      ...v,
      suunnitelmat: v.suunnitelmat.map((s) => (s.id === v.aktiivinen
        ? { ...muutos(s), id: s.id, luotu: s.luotu, muokattu: nyt }
        : s)),
    }
  })
}

/** Aktiivinen suunnitelma — sama viite kunnes jokin muuttuu
 *  (useSyncExternalStore). Palvelimella vakio tyhjä. */
export function lueSuunnitelma(): TallennettuSuunnitelma {
  const v = lataaVarasto()
  return v.suunnitelmat.find((s) => s.id === v.aktiivinen) ?? TYHJA
}

/** Kaikki tallennetut suunnitelmat tallennusjärjestyksessä (näkymä järjestää
 *  jarjestaSuunnitelmat-funktiolla). Sama viite kunnes jokin muuttuu. */
export function lueSuunnitelmat(): TallennettuSuunnitelma[] {
  return lataaVarasto().suunnitelmat
}

/** useSyncExternalStore-yhteensopiva tilaus. Palvelimella vakioviite. */
export function tilaaSuunnitelma(cb: () => void): () => void {
  tilaajat.add(cb)
  return () => tilaajat.delete(cb)
}

export function lueSuunnitelmaServer(): TallennettuSuunnitelma {
  return TYHJA
}

export function lueSuunnitelmatServer(): TallennettuSuunnitelma[] {
  return EI_YHTAAN
}

/** Uusi tyhjä suunnitelma aktiiviseksi; edellinen jää listaan talteen.
 *  null = lista täynnä (SUUNNITELMA_MAX). */
export function uusiSuunnitelma(): string | null {
  if (lataaVarasto().suunnitelmat.length >= SUUNNITELMA_MAX) return null
  const uusi = tyhjaTallennettu(new Date().toISOString())
  paivitaVarasto((v) => ({ aktiivinen: uusi.id, suunnitelmat: [...v.suunnitelmat, uusi] }))
  return uusi.id
}

export function vaihdaSuunnitelma(id: string): void {
  paivitaVarasto((v) => (v.aktiivinen !== id && v.suunnitelmat.some((s) => s.id === id) ? { ...v, aktiivinen: id } : v))
}

export function poistaSuunnitelma(id: string): void {
  paivitaVarasto((v) => poistaVarastosta(v, id, new Date().toISOString(), helsinkiToday()))
}

let idLaskuri = 0
function uusiId(): string {
  idLaskuri += 1
  return `a${Date.now().toString(36)}${idLaskuri}`
}

export function onSuunnitelmassa(viiteId: string): boolean {
  return lueSuunnitelma().askeleet.some((a) => a.viiteId === viiteId)
}

export function poistaViitteella(viiteId: string): void {
  paivita((s) => ({ ...s, askeleet: s.askeleet.filter((a) => a.viiteId !== viiteId) }))
}

function lisaaAskel(askel: Omit<SuunnitelmaAskel, 'id'>, paivaEhdotus?: string): boolean {
  const s = lueSuunnitelma()
  if (s.askeleet.length >= ASKEL_MAX) return false
  paivita((vanha) => ({
    ...vanha,
    // Ensimmäinen tapahtuma antaa suunnitelmalle päivän, ellei jo valittu.
    paiva: vanha.paiva || paivaEhdotus || '',
    askeleet: [...vanha.askeleet, { ...askel, id: uusiId() }],
  }))
  // Kaikki keräilynapit kulkevat tästä — yksi mittari kattaa tapahtumat,
  // ravintolat ja opaskohteet (meta kertoo tyypin).
  track('plan_add', { label: askel.nimi, meta: askel.tyyppi })
  return true
}

/** Sama HTML-riisunta kuin EventDetailPanelin kuvausrenderöinnissä —
 *  tilannekuvaan tallennetaan puhdas teksti kappalevaihdot säilyttäen
 *  (LinkedEvents antaa kuvaukset <p>/<br>-muodossa). */
function riisuHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Tapahtuma askeleeksi — PUHDAS rakentaja, ei kirjoita varastoon. Käytetään
 *  sekä keräilynapista (lisaaTapahtuma) että valmiista illan rungoista
 *  (lib/illan-rungot), jotta askel on täsmälleen sama molemmista poluista. */
export function tapahtumaAskel(e: Event): Omit<SuunnitelmaAskel, 'id'> {
  return {
    tyyppi: 'tapahtuma',
    viiteId: e.id,
    nimi: e.title,
    // Kaupunki mukaan kuten sovelluksen kortissa ("Lönnrotinkatu 6, Helsinki").
    osoite: [e.location?.streetAddress, e.location?.city].filter(Boolean).join(', ') || undefined,
    lat: e.location?.lat,
    lon: e.location?.lon,
    kuva: e.image,
    ankkuriISO: e.startTime,
    rooli: 'ohjelma',
    // naytettavaKuvaus: skraperin '@ <paikka>' -placeholder ei ole kuvaus eikä
    // sitä saa tallentaa askeleeseen — se näkyisi sekä omassa suunnitelmassa
    // että KAVERILLE JAETUSSA suunnitelmassa (JaettuSuunnitelma).
    kuvaus: riisuHtml(naytettavaKuvaus(e) ?? '').slice(0, 4000) || undefined,
    // Sama portti kuin korteissa: ei kilpailijalle, ei maksunkeruusivulle.
    linkki: externalUrlFor(e),
    paikkaNimi: e.location?.name || undefined,
    loppuISO: e.endTime || undefined,
    hinta: e.isFree ? 'Maksuton' : e.price || undefined,
    data: { laji: 'tapahtuma', tapahtuma: e },
  }
}

export function lisaaTapahtuma(e: Event): boolean {
  return lisaaAskel(tapahtumaAskel(e), helsinkiPaivaISO(e.startTime))
}

/** Ravintolatyypin oletuskellonaika aikajanalle (HANDOFF-mobiili §6). */
export function oletusKloTyypille(type: Restaurant['type']): string {
  switch (type) {
    case 'kahvila': return '15:00'
    case 'baari': return '23:00'
    case 'yokerho': return '00:30'
    default: return '18:00'
  }
}

/** Ravintola askeleeksi — puhdas rakentaja, ks. tapahtumaAskel. */
export function ravintolaAskel(r: Restaurant, tyyli?: { cp: string; color: string }): Omit<SuunnitelmaAskel, 'id'> {
  return {
    tyyppi: 'ravintola',
    viiteId: r.id,
    nimi: r.name,
    osoite: r.address || undefined,
    lat: r.lat ?? undefined,
    lon: r.lon ?? undefined,
    kuva: r.image,
    aukiolot: r.openingHours,
    rooli: r.type === 'baari' || r.type === 'yokerho' ? 'drinkit' : 'ruoka',
    oletusKlo: oletusKloTyypille(r.type),
    // blurb on toimituksellinen esittely; description on raaka OSM-keittiö-
    // stringi ("french") eikä kelpaa kuvaukseksi.
    kuvaus: riisuHtml(r.blurb || '').slice(0, 4000) || undefined,
    linkki: r.www && /^https?:\/\//i.test(r.www) ? r.www : null,
    tyyppiNimike: (r.cuisineCategories?.[0] ?? r.description ?? r.type ?? '').toString() || undefined,
    puhelin: r.phone,
    arvosana: r.googleRating,
    arvosteluja: r.reviewCount,
    data: { laji: 'ravintola', ravintola: r, tyyli },
  }
}

export function lisaaRavintola(r: Restaurant, tyyli?: { cp: string; color: string }): boolean {
  return lisaaAskel(ravintolaAskel(r, tyyli))
}

export function lisaaPaikka(p: PaikkaTieto & { description?: string | null }, guideSlug = ''): boolean {
  return lisaaAskel({
    tyyppi: 'paikka',
    viiteId: p.id,
    nimi: p.name,
    osoite: p.address || undefined,
    lat: p.lat ?? undefined,
    lon: p.lon ?? undefined,
    kuva: p.image ?? null,
    aukiolot: p.openingHours ?? null,
    rooli: 'tekeminen',
    kuvaus: riisuHtml(p.description || '').slice(0, 4000) || undefined,
    linkki: p.www && /^https?:\/\//i.test(p.www) ? p.www : null,
    tyyppiNimike: p.kicker || undefined,
    puhelin: p.phone ?? null,
    arvosana: p.rating ?? undefined,
    arvosteluja: p.reviews ?? undefined,
    data: { laji: 'paikka', paikka: p, guideSlug },
  })
}

/** Asettaa siirtymän kulkutavan ja keston (tai palauttaa kävelyarvion kun
 *  tapa on undefined). Nollaa askeleen varoituskuittauksen — aika muuttuu. */
export function asetaKulkutapa(id: string, tapa: Kulkutapa | undefined, min?: number): void {
  paivita((s) => ({
    ...s,
    askeleet: s.askeleet.map((a) => (a.id === id
      ? { ...a, kulkutapa: tapa, siirtymaMin: tapa ? min : undefined, varoitusKuitattu: undefined }
      : a)),
  }))
}

/** Siirtymävalinnat ja kuittaukset kuuluvat askelPAREILLE — kun järjestys
 *  muuttuu tai askel poistuu, parit vaihtuvat eikä vanha valinta päde. */
function nollaaSiirtymat(askeleet: SuunnitelmaAskel[]): SuunnitelmaAskel[] {
  return askeleet.map((a) => ({ ...a, kulkutapa: undefined, siirtymaMin: undefined, varoitusKuitattu: undefined }))
}

/** Piilottaa askeleen varoituksen — käyttäjä tietää paremmin (esim. kulkee
 *  ratikalla, jota sovitin ei mallinna). */
export function kuittaaVaroitus(id: string): void {
  paivita((s) => ({
    ...s,
    askeleet: s.askeleet.map((a) => (a.id === id ? { ...a, varoitusKuitattu: true } : a)),
  }))
}

export function poistaAskel(id: string): void {
  paivita((s) => ({ ...s, askeleet: nollaaSiirtymat(s.askeleet.filter((a) => a.id !== id)) }))
}

/** Siirtää askeleen suoraan annettuun kohtaan — raahausjärjestely. */
export function siirraIndeksiin(id: string, uusiIndeksi: number): void {
  paivita((s) => {
    const i = s.askeleet.findIndex((a) => a.id === id)
    if (i === -1) return s
    const kohde = Math.max(0, Math.min(s.askeleet.length - 1, uusiIndeksi))
    if (kohde === i) return s
    const uudet = [...s.askeleet]
    const [askel] = uudet.splice(i, 1)
    uudet.splice(kohde, 0, askel)
    return { ...s, askeleet: nollaaSiirtymat(uudet) }
  })
}

export function siirraAskelta(id: string, suunta: -1 | 1): void {
  paivita((s) => {
    const i = s.askeleet.findIndex((a) => a.id === id)
    const j = i + suunta
    if (i === -1 || j < 0 || j >= s.askeleet.length) return s
    const uudet = [...s.askeleet]
    ;[uudet[i], uudet[j]] = [uudet[j], uudet[i]]
    return { ...s, askeleet: nollaaSiirtymat(uudet) }
  })
}

export function asetaOtsikko(otsikko: string): void {
  paivita((s) => ({ ...s, otsikko: otsikko.slice(0, 80) }))
}

export function asetaPaiva(paiva: string): void {
  // Päivän vaihto muuttaa aukiolot ja koko ketjun → kuittaukset eivät päde.
  paivita((s) => ({ ...s, paiva, askeleet: s.askeleet.map((a) => ({ ...a, varoitusKuitattu: undefined })) }))
}

export function asetaAlkuKlo(klo: string | undefined): void {
  // Koko ketjun ajat lasketaan uusiksi → vanhat kuittaukset eivät päde.
  paivita((s) => ({ ...s, alkuKlo: klo, askeleet: s.askeleet.map((a) => ({ ...a, varoitusKuitattu: undefined })) }))
}

export function asetaKasinKlo(id: string, klo: string | undefined): void {
  paivita((s) => {
    // Ajan muutos nollaa varoituskuittauksen sekä TÄLTÄ askeleelta että
    // SEURAAVALTA: "et ehdi" istuu askelparilla, ja kumman tahansa pään
    // aikamuutos voi tehdä vanhasta "tiedän kyllä" -kuittauksesta vanhentuneen.
    const i = s.askeleet.findIndex((a) => a.id === id)
    return {
      ...s,
      askeleet: s.askeleet.map((a, j) => (j === i
        ? { ...a, kasinKlo: klo, varoitusKuitattu: undefined }
        : j === i + 1
          ? { ...a, varoitusKuitattu: undefined }
          : a)),
    }
  })
}

export function tyhjennaSuunnitelma(): void {
  paivita(() => ({ otsikko: '', paiva: '', askeleet: [] }))
}

export function korvaaSuunnitelma(uusi: Suunnitelma): void {
  paivita(() => ({
    otsikko: (uusi.otsikko ?? '').slice(0, 80),
    paiva: uusi.paiva ?? '',
    alkuKlo: uusi.alkuKlo,
    askeleet: (uusi.askeleet ?? []).slice(0, ASKEL_MAX).map((a) => ({ ...a, id: uusiId() })),
  }))
}

/** Tuo valmiin suunnitelman (jaetun linkin kopio): tyhjä aktiivinen
 *  korvataan, muuten tuotu tulee UUDEKSI suunnitelmaksi, jotta oma
 *  keskeneräinen ilta ei katoa. Lista täynnä → korvataan aktiivinen. */
export function tuoSuunnitelma(uusi: Suunnitelma): void {
  if (lueSuunnitelma().askeleet.length > 0) uusiSuunnitelma()
  korvaaSuunnitelma(uusi)
}

function helsinkiPaivaISO(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(iso))
}

/** Google Maps -reittiohjelinkki suunnitelman järjestyksessä, kävellen.
 *  Yhdellä pisteellä lähtö jää pois → Maps käyttää käyttäjän omaa sijaintia.
 *  Maps URLs -API sallii enintään 9 välipistettä — sitä pidemmästä
 *  suunnitelmasta pudotetaan välipisteitä lopusta (lähtö ja määränpää
 *  säilyvät aina; ASKEL_MAX=15, joten raja voi tulla vastaan). */
export function reittiohjeUrl(pisteet: Array<{ lat?: number | null; lon?: number | null }>): string | null {
  const koord = pisteet
    .filter((p) => p.lat != null && p.lon != null)
    .map((p) => `${p.lat},${p.lon}`)
  if (koord.length === 0) return null
  const q = new URLSearchParams({ api: '1', travelmode: 'walking' })
  q.set('destination', koord[koord.length - 1])
  if (koord.length >= 2) {
    q.set('origin', koord[0])
    const valit = koord.slice(1, -1).slice(0, 9)
    if (valit.length) q.set('waypoints', valit.join('|'))
  }
  return `https://www.google.com/maps/dir/?${q.toString()}`
}
