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
// TALLENNUS: localStorage (ei kirjautumista). Jakaminen tekee palvelimelle
// SNAPSHOTIN — jaettu linkki ei elä tämän tilan mukana.

import type { Restaurant, Event } from './types'
// Vain tyyppi — poistuu käännöksessä, joten runtime-kehää komponenttiin ei synny.
import type { PaikkaTieto } from '../components/PlaceDetailPanel'
import { walkMinutesBetween } from './group'
import { clampToOpenHour, isOpenAt } from './opening-hours'
import { DUR_H, TRAVEL_BUFFER_H, ARC_END_CAP_H } from './group-scheduler'
import { helsinkiClock } from './arvo-ilta'
import { tuntematonAika } from './utils'
import { externalUrlFor } from './event-links'
import { track } from './track'

export type AskelRooli = 'tekeminen' | 'ruoka' | 'drinkit' | 'ohjelma'

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
  /** OSM opening_hours aukiolotarkistuksiin (ravintolat, opaskohteet). */
  aukiolot?: string | null
  rooli: AskelRooli
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
  const paivaDate = new Date(`${s.paiva}T12:00:00`)
  const kello = helsinkiClock(nyt)
  const tanaan = kello.date === s.paiva

  // Aloituskursori: käyttäjän valinta → ensimmäinen ankkuri → oletus.
  let kursori: number
  const alkuKasin = s.alkuKlo ? kloTunneiksi(s.alkuKlo) : null
  if (alkuKasin !== null) {
    kursori = alkuKasin
  } else {
    const ekaAnkkuri = s.askeleet.find((a) => a.ankkuriISO && !tuntematonAika(a.ankkuriISO))
    if (ekaAnkkuri && s.askeleet[0] === ekaAnkkuri) {
      kursori = ankkuriTunti(ekaAnkkuri.ankkuriISO!)
    } else if (tanaan) {
      // Tänään: seuraava tasavartti + puoli tuntia valmistautumiseen.
      kursori = Math.ceil((kello.hour + 0.5) * 4) / 4
    } else {
      kursori = 18
    }
  }

  const tulos: SovitettuAskel[] = []
  let edellinen: SuunnitelmaAskel | null = null

  for (const askel of s.askeleet) {
    // Siirtymä edellisestä: kävely + puskuri (sama kortteli → pieni tauko).
    let kavelyMin: number | undefined
    if (edellinen) {
      kavelyMin = walkMinutesBetween(edellinen, askel)
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
      if (kursori > klo + 0.05) varoitus = 'ei-ehdi'
      else if (askel.aukiolot && isOpenAt(askel.aukiolot, kelloksi(paivaDate, klo)) === false) varoitus = 'kiinni'
    } else if (ankkuri !== null) {
      klo = ankkuri
      if (kursori > klo + 0.05) varoitus = 'ei-ehdi'
    } else {
      const sovitettu = askel.aukiolot
        ? clampToOpenHour(askel.aukiolot, paivaDate, kursori, Math.min(roolinKesto(askel.rooli), 1))
        : kursori
      if (sovitettu === null) {
        klo = kursori
        varoitus = 'kiinni'
      } else {
        klo = Math.max(sovitettu, kursori)
      }
    }

    if (!varoitus && tanaan && klo + 0.05 < kello.hour) varoitus = 'mennyt'
    if (!varoitus && klo > ARC_END_CAP_H) varoitus = 'myohaan'

    tulos.push({ askel, klo: tunnitKloksi(klo), kavelyMin, varoitus })
    kursori = Math.max(kursori, klo) + roolinKesto(askel.rooli)
    edellinen = askel
  }
  return tulos
}

function kelloksi(paiva: Date, h: number): Date {
  const d = new Date(paiva)
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)
  return d
}

// ── Tila (localStorage + tilaajat) ───────────────────────────────────────────

const LS_AVAIN = 'oma-suunnitelma-v1'

function oletus(): Suunnitelma {
  return { otsikko: '', paiva: '', askeleet: [] }
}

const TYHJA: Suunnitelma = oletus()

let tila: Suunnitelma | null = null
const tilaajat = new Set<() => void>()

function lataa(): Suunnitelma {
  if (tila) return tila
  if (typeof window === 'undefined') return TYHJA
  try {
    const raaka = localStorage.getItem(LS_AVAIN)
    tila = raaka ? { ...oletus(), ...(JSON.parse(raaka) as Suunnitelma) } : oletus()
  } catch {
    tila = oletus()
  }
  return tila
}

function paivita(muutos: (s: Suunnitelma) => Suunnitelma): void {
  tila = muutos(lataa())
  try {
    localStorage.setItem(LS_AVAIN, JSON.stringify(tila))
  } catch { /* privaattitila */ }
  tilaajat.forEach((cb) => cb())
}

export function lueSuunnitelma(): Suunnitelma {
  return lataa()
}

/** useSyncExternalStore-yhteensopiva tilaus. Palvelimella vakioviite. */
export function tilaaSuunnitelma(cb: () => void): () => void {
  tilaajat.add(cb)
  return () => tilaajat.delete(cb)
}

export function lueSuunnitelmaServer(): Suunnitelma {
  return TYHJA
}

let idLaskuri = 0
function uusiId(): string {
  idLaskuri += 1
  return `a${Date.now().toString(36)}${idLaskuri}`
}

export function onSuunnitelmassa(viiteId: string): boolean {
  return lataa().askeleet.some((a) => a.viiteId === viiteId)
}

export function poistaViitteella(viiteId: string): void {
  paivita((s) => ({ ...s, askeleet: s.askeleet.filter((a) => a.viiteId !== viiteId) }))
}

function lisaaAskel(askel: Omit<SuunnitelmaAskel, 'id'>, paivaEhdotus?: string): boolean {
  const s = lataa()
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

export function lisaaTapahtuma(e: Event): boolean {
  return lisaaAskel({
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
    kuvaus: riisuHtml(e.description || e.shortDescription || '').slice(0, 4000) || undefined,
    // Sama portti kuin korteissa: ei kilpailijalle, ei maksunkeruusivulle.
    linkki: externalUrlFor(e),
    paikkaNimi: e.location?.name || undefined,
    loppuISO: e.endTime || undefined,
    hinta: e.isFree ? 'Maksuton' : e.price || undefined,
    data: { laji: 'tapahtuma', tapahtuma: e },
  }, helsinkiPaivaISO(e.startTime))
}

export function lisaaRavintola(r: Restaurant, tyyli?: { cp: string; color: string }): boolean {
  return lisaaAskel({
    tyyppi: 'ravintola',
    viiteId: r.id,
    nimi: r.name,
    osoite: r.address || undefined,
    lat: r.lat ?? undefined,
    lon: r.lon ?? undefined,
    kuva: r.image,
    aukiolot: r.openingHours,
    rooli: r.type === 'baari' || r.type === 'yokerho' ? 'drinkit' : 'ruoka',
    // blurb on toimituksellinen esittely; description on raaka OSM-keittiö-
    // stringi ("french") eikä kelpaa kuvaukseksi.
    kuvaus: riisuHtml(r.blurb || '').slice(0, 4000) || undefined,
    linkki: r.www && /^https?:\/\//i.test(r.www) ? r.www : null,
    tyyppiNimike: (r.cuisineCategories?.[0] ?? r.description ?? r.type ?? '').toString() || undefined,
    puhelin: r.phone,
    arvosana: r.googleRating,
    arvosteluja: r.reviewCount,
    data: { laji: 'ravintola', ravintola: r, tyyli },
  })
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

export function poistaAskel(id: string): void {
  paivita((s) => ({ ...s, askeleet: s.askeleet.filter((a) => a.id !== id) }))
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
    return { ...s, askeleet: uudet }
  })
}

export function siirraAskelta(id: string, suunta: -1 | 1): void {
  paivita((s) => {
    const i = s.askeleet.findIndex((a) => a.id === id)
    const j = i + suunta
    if (i === -1 || j < 0 || j >= s.askeleet.length) return s
    const uudet = [...s.askeleet]
    ;[uudet[i], uudet[j]] = [uudet[j], uudet[i]]
    return { ...s, askeleet: uudet }
  })
}

export function asetaOtsikko(otsikko: string): void {
  paivita((s) => ({ ...s, otsikko: otsikko.slice(0, 80) }))
}

export function asetaPaiva(paiva: string): void {
  paivita((s) => ({ ...s, paiva }))
}

export function asetaAlkuKlo(klo: string | undefined): void {
  paivita((s) => ({ ...s, alkuKlo: klo }))
}

export function asetaKasinKlo(id: string, klo: string | undefined): void {
  paivita((s) => ({
    ...s,
    askeleet: s.askeleet.map((a) => (a.id === id ? { ...a, kasinKlo: klo } : a)),
  }))
}

export function tyhjennaSuunnitelma(): void {
  paivita(() => oletus())
}

export function korvaaSuunnitelma(uusi: Suunnitelma): void {
  paivita(() => ({
    otsikko: (uusi.otsikko ?? '').slice(0, 80),
    paiva: uusi.paiva ?? '',
    alkuKlo: uusi.alkuKlo,
    askeleet: (uusi.askeleet ?? []).slice(0, ASKEL_MAX).map((a) => ({ ...a, id: uusiId() })),
  }))
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
