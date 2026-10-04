// Valmiit rungot (HANDOFF-mobiili.md §7; uudistus 4.10.2026) — Suunnitelma-
// välilehden tyhjä tila tarjoaa enintään kolme valmista ehdotusta, jotka
// käyttäjä voi ottaa pohjaksi yhdellä napautuksella.
//
// RUNGOT KOOSTETAAN PÄIVÄN OIKEASTA DATASTA, ei kovakoodatuista esimerkeistä:
// tapahtumat ovat tämän päivän (tai myöhään illalla huomisen) kohderyhmään
// kuuluvia tapahtumia (lib/audience), ja ravintolat/baarit valitaan oikeasta
// ravintoladatasta niin, että ne ovat lähellä tapahtumaa (≤ 2 km) ja auki
// suunniteltuun aikaan. Siirtymä- ja kellonaikalogiikka on kokonaan
// lib/suunnitelman sovittimen (ja HSL-kulkutapavalinnan) — tässä EI lasketa
// aikoja, vain valitaan askeleet. Puhdas funktio: `nyt` annetaan parametrina.
//
// KOLME PAIKKAA (omistaja 4.10.2026: "kolme esimerkkiä: yksi baari/jatko,
// yksi festivaali–ruoka, yksi urheilutapahtuma–ruoka … nostetaan isot
// tapahtumat, ei pelkkää baariasiaa, päivätapahtumia ja ravintoloita ilman
// baaria"):
//   A. Iso päivätapahtuma + ruoka — festivaali/markkinat/iso paikka
//      (onIsoTapahtuma). Käynnissä oleva monipäiväinen tapahtuma (Silakka-
//      markkinat, viikon festivaali) kelpaa: siihen mennään seuraavalla
//      tasavartilla ja syömään sen jälkeen.
//   B. Urheilu + ruoka — iltaotteluun illallinen ENNEN, päiväotteluun JÄLKEEN.
//   Varalla (jos A/B ei löydy): muu tapahtuma + ruoka (keikka, kulttuuri,
//   stand up) — "Illallinen ja keikka" on näistä klassikko.
//   C. Baari/jatkot — YKSI: keikka ja jatkot, baari → klubi, kulttuuri +
//      baari, stand up + baari, peli ja oluet; viimeisenä paikkailta.
//   Kun tänään ei ole enää mitään (myöhäisilta): A/B täytetään HUOMISEN
//   isoilla tapahtumilla (runko.paiva = huominen, UI merkitsee "Huomenna").
//   Viimeinen varaus kun ruokayhdistelmiä ei riitä: lisää paikkailtoja.
//
// Askeleet rakennetaan samoilla rakentajilla kuin paneelien keräilynapit
// (tapahtumaAskel, ravintolaAskel), joten runko on täsmälleen sama asia kuin
// käsin koottu suunnitelma — myös jaettuna.

import type { Event, Restaurant } from './types'
import type { TranslationKey } from './i18n'
import { getEventVibes } from './event-classify'
import { isOutsideTargetAudience, isPrimaryPick } from './audience'
import { onVisa, onPeruttu, onSuuriPaikka, poimintaPisteet } from './picks'
import { haversineMeters, walkMinutesBetween } from './group'
import { DUR_H, TRAVEL_BUFFER_H, ARC_END_CAP_H, DRINKS_END_CAP_H } from './group-scheduler'
import { isOpenAt } from './opening-hours'
import { helsinkiClock, addDays } from './arvo-ilta'
import { tuntematonAika } from './utils'
import { track } from './track'
import { tapahtumaAskel, ravintolaAskel, korvaaSuunnitelma, tunnitKloksi, type SuunnitelmaAskel } from './suunnitelma'
import { onKeikkapaikka } from './venue-type-overrides'

export type RunkoId =
  | 'festival_food' | 'sport_food' | 'event_food' | 'dinner_gig'
  | 'gig_bar' | 'culture' | 'party' | 'standup' | 'sport'
  | 'late_dinner' | 'bar_hop' | 'club_night'

export interface Runko {
  id: RunkoId
  emoji: string
  otsikkoAvain: TranslationKey
  /** YYYY-MM-DD (Helsinki) — rungon päivä (tänään tai huomenna). */
  paiva: string
  askeleet: Omit<SuunnitelmaAskel, 'id'>[]
}

type Askel = Omit<SuunnitelmaAskel, 'id'>

const MAX_ETAISYYS_M = 2000
/** Laatukynnys tyypeittäin: uskottava arvosana JA riittävä otos. Illallis-
 *  paikalta vaaditaan enemmän (ja vähintään €€) — "Illallinen ja keikka"
 *  ei saa tarkoittaa lähintä kebabia (mitattu 24.9.2026: Vuo Kebab ja
 *  Pizzeria oli lähin 4,3+/150+ -paikka). */
const KYNNYS: Record<'ravintola' | 'baari' | 'yokerho', { arvosana: number; arvosteluja: number; hinta: number }> = {
  ravintola: { arvosana: 4.4, arvosteluja: 250, hinta: 2 },
  baari: { arvosana: 4.3, arvosteluja: 150, hinta: 1 },
  // Yökerhojen arvosanat ovat rakenteellisesti matalampia (jonot, hinnat).
  yokerho: { arvosana: 4.0, arvosteluja: 100, hinta: 1 },
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
/** Paikkailtojen ankkuri kun tapahtumaa ei ole: Helsingin keskusta. */
const KESKUSTA = { lat: 60.1695, lon: 24.9384 }
/** Valmistautumisaika: tapahtumaan pääsee lähtemällä heti (20 min), mutta
 *  ENNEN tapahtumaa tulevaan ravintolaan/baariin pitää ehtiä ensin (45 min).
 *  Omistaja 24.9.2026 klo 20.23: "voisi ehdottaa vielä tänään jotain tulevaa
 *  tapahtumaa mikä alkaa esim. 21.00, sitten baari". */
const VALMISTAUTUMINEN_H = 1 / 3
const VALMISTAUTUMINEN_ENNEN_H = 0.75
/** Ilta alkaa 17.30: tätä myöhemmin alkavaan tapahtumaan syödään ENNEN,
 *  aiempaan (päivätapahtuma) JÄLKEEN. */
const ILTA_ALKAA_H = 17.5
/** Tapahtuman jälkeinen ruokailu alkaa viimeistään 21.30 — 1¼ h:n ateria
 *  ehtii ennen sovittimen 23.30 yörajaa (ARC_END_CAP_H). */
const RUOKA_JALKEEN_VIIMEISTAAN_H = 21.5
/** Käynnissä olevaan (monipäiväiseen / koko päivän) tapahtumaan mennään
 *  viimeistään klo 20 ja siellä ollaan vähintään tunti ennen sulkemista. */
const KAYNTI_VIIMEISTAAN_H = 20
const KAYNTI_MIN_H = 1
/** Huomenna käynnissä olevaan (viikon markkinat) ehdotetaan käyntiä klo 12. */
const HUOMISEN_KAYNTI_H = 12

type Laji = 'keikka' | 'kulttuuri' | 'standup' | 'bileet' | 'urheilu'

function laji(e: Event): Laji | null {
  const v = getEventVibes(e)
  if (v.includes('standup')) return 'standup'
  if (v.includes('yoelama') || v.includes('underground')) return 'bileet'
  if (v.includes('keikka')) return 'keikka'
  if (v.includes('urheilu')) return 'urheilu'
  if (v.includes('teatteri') || v.includes('taide') || v.includes('museo')) return 'kulttuuri'
  return null
}

/** Markkinat ovat festivaalin kaltaisia koko päivän tapahtumia (Stadin
 *  Silakkamarkkinat, Hakaniemen Maalaismarkkinat, joulumarkkinat), vaikka
 *  luokittelija ei anna niille vibeä. Yhdyssana-auditointi: \b vaatii sanan
 *  LOPUN, joten osuma on nimenomaan "…markkinat" (Silakkamarkkinat), ei
 *  "markkinatalous" tai "markkinointi". */
const MARKKINAT_REGEX = /markkinat\b/i

/** Festivaali: rakenteinen vibe, kuratoitu festivaalitaulu tai markkinat. */
export function onFestivaali(e: Event): boolean {
  return getEventVibes(e).includes('festivaali') || e.source === 'festivals' || MARKKINAT_REGEX.test(e.title)
}

/** Urheilutapahtuma. 'urheilu'-vibe tulee myös paikan nimestä ("Käpylän
 *  urheilupuisto"), jolloin sirkusnäytös luokittuu urheiluksi (mitattu
 *  4.10.2026: Sirkus Finlandia = urheilu + teatteri) — esitysvibet vetävät. */
const EI_URHEILUA: readonly string[] = ['teatteri', 'keikka', 'taide', 'museo', 'standup', 'lapset']
export function onUrheilu(e: Event): boolean {
  const v = getEventVibes(e)
  return v.includes('urheilu') && !v.some((x) => EI_URHEILUA.includes(x))
}

/** Iso tapahtuma ruokayhdistelmän kärkeen: festivaali/markkinat tai kaupungin
 *  iso paikka (lib/picks SUURET_PAIKAT). Urheilu on oma paikkansa (B), ja
 *  yöelämä (klubi-ilta, vaikka festivaalin nimissä — mitattu 4.10.2026:
 *  "Aavistus Festival: VJ Club Night") kuuluu baaripaikkaan (C), ei
 *  ruokayhdistelmään. */
export function onIsoTapahtuma(e: Event): boolean {
  return !onUrheilu(e) && laji(e) !== 'bileet' && (onFestivaali(e) || onSuuriPaikka(e))
}

function tunti(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return g('hour') + g('minute') / 60
}
const alkuTunti = (e: Event) => tunti(e.startTime)

function helsinkiPaiva(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(iso))
}

function kelloksi(paiva: string, h: number): Date {
  const d = new Date(`${paiva}T12:00:00`)
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)
  return d
}

/** Tapahtuman loppu annetun päivän tunteina: 24 jos jatkuu seuraaviin
 *  päiviin, null jos loppua ei tiedetä tai se oli jo ennen päivää. */
function loppuTunti(e: Event, paiva: string): number | null {
  if (!e.endTime || tuntematonAika(e.endTime)) return null
  const loppuPaiva = helsinkiPaiva(e.endTime)
  if (loppuPaiva < paiva) return null
  return loppuPaiva > paiva ? 24 : tunti(e.endTime)
}

/** Lähin laatukynnyksen ylittävä paikka, joka on auki annettuun aikaan. */
function lahinAuki(
  paikat: Restaurant[],
  tyyppi: 'ravintola' | 'baari' | 'yokerho',
  kohde: { lat?: number; lon?: number },
  paiva: string,
  klo: number,
  poissa: ReadonlySet<string>,
  /** Paikan on oltava auki vielä tämänkin verran myöhemmin (h). Oletus 1 h
   *  = sovittimen clampToOpenHour-vaatimus (min(roolin kesto, 1)); ateria
   *  vaatii 1¼ h — paikka joka sulkee puolen tunnin päästä ei kelpaa. */
  aukiViela = 1,
  /** Tosi kun paikkaan KÄVELLÄÄN edellisestä askeleesta (kohde): saapumis-
   *  aika = klo + kävely, kuten sovitin laskee. Ennen tapahtumaa tulevassa
   *  askeleessa klo on jo paikan oma alkuaika (kävely tulee sen jälkeen). */
  kavelyMukaan = false,
): Restaurant | null {
  if (kohde.lat == null || kohde.lon == null) return null
  const k = KYNNYS[tyyppi]
  // Sovittimen "myöhään"-raja: ravintola 23.30, baari/yökerho 01.30.
  const katto = tyyppi === 'ravintola' ? ARC_END_CAP_H : DRINKS_END_CAP_H
  let paras: Restaurant | null = null
  let parasM = Infinity
  for (const r of paikat) {
    if (r.type !== tyyppi || poissa.has(r.id)) continue
    // Lipullinen keikkapaikka ei ole baari- eikä yökerhoaskel ilman keikkaa.
    if (tyyppi !== 'ravintola' && onKeikkapaikka(r.name)) continue
    if (r.lat == null || r.lon == null) continue
    if ((r.googleRating ?? 0) < k.arvosana || (r.reviewCount ?? 0) < k.arvosteluja) continue
    // Hintataso tunnetaan vain osalle — puuttuva ei pudota.
    if (r.priceRange !== undefined && r.priceRange < k.hinta) continue
    const m = haversineMeters(kohde.lat, kohde.lon, r.lat, r.lon)
    if (m > MAX_ETAISYYS_M || m >= parasM) continue
    // Mitattu 24.9.2026: "John Scott's 23.30 → Pub Peräkammari" sai heti
    // "kiinni"-varoituksen, koska baarin aukiolo tarkistettiin lähtöajalla
    // eikä saapumisajalla (kävely 20 min).
    const saapuu = klo + (kavelyMukaan ? (walkMinutesBetween(kohde, r) ?? 0) / 60 : 0)
    if (saapuu > katto) continue
    // Aukiolo TIEDETTÄVÄ ja auki: tuntematon ei kelpaa runkoon (käsin
    // lisätessä käyttäjä näkee varoituksen, runko luvataan valmiina).
    if (isOpenAt(r.openingHours, kelloksi(paiva, saapuu)) !== true) continue
    if (aukiViela > 0 && isOpenAt(r.openingHours, kelloksi(paiva, saapuu + aukiViela)) !== true) continue
    paras = r
    parasM = m
  }
  return paras
}

export interface RunkoOpts {
  /** Tapahtuma-/paikka-id:t joita EI käytetä — "Vaihda ehdotusta" (omistaja
   *  24.9.2026) antaa tähän jo ehdotetut, jotta jokainen painallus tuottaa
   *  uuden ehdotuksen. */
  ohita?: ReadonlySet<string>
}

/** Ehdokas ruokayhdistelmään: tapahtuma, rungon päivä, aikaisin sallittu
 *  alkuaika ennen-askeleelle (tänään nyt + 45 min; huomenna ei rajaa) ja
 *  käynnissä olevalle tapahtumalle käyntiaika. */
interface Ehdokas { e: Event; paiva: string; raja: number; kaynti?: number }

/**
 * Enintään kolme runkoa. Palauttaa tyhjän listan kun päivästä ei saa yhtään
 * uskottavaa ehdotusta — kutsuja piilottaa silloin koko lohkon eikä näytä
 * täytettä. `events` saa sisältää myös huomisen tapahtumat (UI hakee kaksi
 * päivää): niitä käytetään vain kun tämän päivän ruokayhdistelmät eivät
 * riitä.
 */
export function rakennaRungot(events: Event[], restaurants: Restaurant[], nyt: Date, opts: RunkoOpts = {}): Runko[] {
  const kello = helsinkiClock(nyt)
  const paiva = kello.date
  const huomenna = addDays(paiva, 1)
  const ohita = opts.ohita ?? new Set<string>()
  // Tapahtumaan ehtii 20 minuutissa; ravintolaan/baariin ENNEN tapahtumaa
  // vasta 45 minuutissa.
  const rajaTapahtuma = kello.hour + VALMISTAUTUMINEN_H
  const raja = kello.hour + VALMISTAUTUMINEN_ENNEN_H
  // Seuraava tasavartti + puoli tuntia — sama kuin sovittimen tämän päivän
  // aloituskursori, joten kortin ajat vastaavat aikajanaa.
  const kaynti = Math.ceil((kello.hour + 0.5) * 4) / 4

  const pohja = events.filter((e) =>
    !ohita.has(e.id) && !tuntematonAika(e.startTime) && !onVisa(e) && !onPeruttu(e)
    && !isOutsideTargetAudience(e) && e.location?.lat != null && e.location?.lon != null)
  // Kuvalliset ensin — runko näkyy kortteina; sitten aikajärjestys.
  const jarjestys = (a: Event, b: Event) => Number(!!b.image) - Number(!!a.image) || alkuTunti(a) - alkuTunti(b)
  // Varayhdistelmien järjestys: lib/picks poimintapisteet (kuva, festivaali,
  // keikka, iso paikka), tasapelissä aikajärjestys.
  const pisteJarjestys = (a: Ehdokas, b: Ehdokas) => poimintaPisteet(b.e) - poimintaPisteet(a.e) || alkuTunti(a.e) - alkuTunti(b.e)
  // Isojen tapahtumien järjestys: festivaali/markkinat ennen pelkkää isoa
  // paikkaa, kuvallinen ennen kuvatonta, sitten AIKAISIN ensin — käynnissä
  // oleva koko kaupungin tapahtuma (Silakkamarkkinat klo 9–19) on ehdotus
  // juuri nyt, ei vasta iltapäivän pienemmän festivaalin jälkeen (mitattu
  // 4.10.2026: poimintapisteet nostivat Kaarelan tanssifestivaalin edelle).
  const isoJarjestys = (a: Ehdokas, b: Ehdokas) =>
    Number(onFestivaali(b.e)) - Number(onFestivaali(a.e)) || Number(!!b.e.image) - Number(!!a.e.image) || alkuTunti(a.e) - alkuTunti(b.e)

  /** Tänään alkavat, joihin ehtii. */
  const tulevat = pohja.filter((e) => helsinkiPaiva(e.startTime) === paiva && alkuTunti(e) >= rajaTapahtuma).sort(jarjestys)
  /** Käynnissä olevat: alkoi jo (tänään tai aiemmin), loppu TIEDETÄÄN ja
   *  siellä ehtii olla vähintään tunnin käyntiajasta; ei enää klo 20 jälkeen. */
  const kaynnissa = pohja.filter((e) => {
    if (new Date(e.startTime).getTime() > nyt.getTime()) return false
    const loppu = loppuTunti(e, paiva)
    return loppu !== null && kaynti <= KAYNTI_VIIMEISTAAN_H && kaynti + KAYNTI_MIN_H <= loppu
  }).sort(jarjestys)
  /** Huomenna alkavat (kaikki kellonajat) + huomenna käynnissä olevat monipäiväiset. */
  const huomiset = pohja.filter((e) => helsinkiPaiva(e.startTime) === huomenna).sort(jarjestys)
  const huomennaKaynnissa = pohja.filter((e) => {
    if (helsinkiPaiva(e.startTime) >= huomenna) return false
    const loppu = loppuTunti(e, huomenna)
    return loppu !== null && HUOMISEN_KAYNTI_H + KAYNTI_MIN_H <= loppu
  }).sort(jarjestys)

  const tanaanEhdokkaat: Ehdokas[] = [
    ...tulevat.map((e) => ({ e, paiva, raja })),
    ...kaynnissa.map((e) => ({ e, paiva, raja, kaynti })),
  ]
  const huomisetEhdokkaat: Ehdokas[] = [
    ...huomiset.map((e) => ({ e, paiva: huomenna, raja: -Infinity })),
    ...huomennaKaynnissa.map((e) => ({ e, paiva: huomenna, raja: -Infinity, kaynti: HUOMISEN_KAYNTI_H })),
  ]

  const kaytetytTapahtumat = new Set<string>()
  // Ohituslista koskee myös paikkoja: "Vaihda ehdotusta" antaa uuden
  // ravintolan ja baarin, ei pelkkää uutta tapahtumaa.
  const kaytetytPaikat = new Set<string>(ohita)
  const rungot: Runko[] = []

  // ── Ruokayhdistelmät (A, B ja varalla) ────────────────────────────────────

  const ruokaOtsikko = (e: Event, ennen: boolean): Pick<Runko, 'id' | 'emoji' | 'otsikkoAvain'> => {
    if (onUrheilu(e)) return { id: 'sport_food', emoji: '⚽', otsikkoAvain: 'plan.tpl_sport_food' }
    if (onFestivaali(e)) return { id: 'festival_food', emoji: '🎪', otsikkoAvain: 'plan.tpl_festival_food' }
    if (laji(e) === 'keikka' && ennen) return { id: 'dinner_gig', emoji: '🎸', otsikkoAvain: 'plan.tpl_dinner_gig' }
    return { id: 'event_food', emoji: '🎟', otsikkoAvain: 'plan.tpl_event_food' }
  }

  /** Käynnissä olevaan tapahtumaan mennään valittuun käyntiaikaan: askeleen
   *  aika kiinnitetään (kasinKlo) eikä ankkuroida tapahtuman oikeaan alkuun,
   *  joka oli jo (ehkä eilen). Käyttäjä voi siirtää käyntiaikaa kuten omaa
   *  askeltaan; loppuaika ja koko lähdeolio säilyvät kortilla. */
  const kaynnissaAskel = (e: Event, klo: number): Askel => {
    const { ankkuriISO: _ankkuri, ...askel } = tapahtumaAskel(e)
    return { ...askel, kasinKlo: tunnitKloksi(klo) }
  }

  /** Tapahtuma + ravintola. Iltatapahtumaan (≥ 17.30) ravintola ENNEN:
   *  2¼ h ennen (16.30–20.00), aterian 1,5 h + kävely + 15 min puskuri
   *  mahduttava ennen alkua — sama kaava kuin lib/suunnitelma sovitaAjat
   *  (ilman tätä klo 17.45 ehdotettiin "illallinen 18.30 → keikka 19.00"
   *  ja runko sai heti "Huomioi aika" -varoituksen, mitattu 24.9.2026).
   *  Muuten ravintola JÄLKEEN: tapahtuma 2 h + puskuri + kävely, viimeistään
   *  21.30, paikan oltava auki saapuessa ja 1¼ h sen jälkeen. */
  const ruokaPari = (k: Ehdokas): Runko | null => {
    const e = k.e
    const loc = e.location!
    const h = k.kaynti ?? alkuTunti(e)
    if (k.kaynti === undefined && h >= ILTA_ALKAA_H) {
      const klo = clamp(h - 2.25, 16.5, 20)
      if (klo >= k.raja) {
        const r = lahinAuki(restaurants, 'ravintola', loc, k.paiva, klo, kaytetytPaikat)
        if (r && klo + DUR_H.food + (walkMinutesBetween(r, loc) ?? 0) / 60 + TRAVEL_BUFFER_H <= h) {
          kaytetytPaikat.add(r.id)
          return { ...ruokaOtsikko(e, true), paiva: k.paiva, askeleet: [{ ...ravintolaAskel(r), oletusKlo: tunnitKloksi(klo) }, tapahtumaAskel(e)] }
        }
      }
    }
    const klo = h + DUR_H.program + TRAVEL_BUFFER_H
    if (klo <= RUOKA_JALKEEN_VIIMEISTAAN_H) {
      const r = lahinAuki(restaurants, 'ravintola', loc, k.paiva, klo, kaytetytPaikat, 1.25, true)
      if (r) {
        kaytetytPaikat.add(r.id)
        const tapahtuma = k.kaynti === undefined ? tapahtumaAskel(e) : kaynnissaAskel(e, k.kaynti)
        return { ...ruokaOtsikko(e, false), paiva: k.paiva, askeleet: [tapahtuma, ravintolaAskel(r)] }
      }
    }
    return null
  }
  const ensimmainenPari = (lista: Ehdokas[]): Runko | null => {
    for (const k of lista) {
      if (kaytetytTapahtumat.has(k.e.id)) continue
      const r = ruokaPari(k)
      if (r) { kaytetytTapahtumat.add(k.e.id); return r }
    }
    return null
  }
  const isot = (l: Ehdokas[]) => l.filter((k) => onIsoTapahtuma(k.e)).sort(isoJarjestys)
  const urheilut = (l: Ehdokas[]) => l.filter((k) => onUrheilu(k.e)).sort(pisteJarjestys)
  // Varalla: ykköskorin keikka/kulttuuri/stand up (ei yöelämää — se kuuluu
  // baaripaikkaan; ei luokittelematonta — harrastematinea ei ole ehdotus).
  const muut = (l: Ehdokas[]) => l.filter((k) => !onIsoTapahtuma(k.e) && !onUrheilu(k.e) && isPrimaryPick(k.e)
    && ['keikka', 'kulttuuri', 'standup'].includes(laji(k.e) ?? '')).sort(pisteJarjestys)
  const lisaa = (r: Runko | null) => { if (r) rungot.push(r) }

  // A. Iso päivätapahtuma + ruoka, B. Urheilu + ruoka — tänään.
  lisaa(ensimmainenPari(isot(tanaanEhdokkaat)))
  lisaa(ensimmainenPari(urheilut(tanaanEhdokkaat)))
  // Varalla tänään: muu tapahtuma + ruoka, kunnes kaksi ruokayhdistelmää.
  while (rungot.length < 2) {
    const r = ensimmainenPari(muut(tanaanEhdokkaat))
    if (!r) break
    rungot.push(r)
  }

  // ── C. Baari/jatkot — yksi ────────────────────────────────────────────────

  const ota = (l: Laji, minTunti = 0, ehto: (e: Event) => boolean = () => true): Event | null => {
    const e = tulevat.find((x) => !kaytetytTapahtumat.has(x.id) && laji(x) === l && alkuTunti(x) >= minTunti && ehto(x)) ?? null
    if (e) kaytetytTapahtumat.add(e.id)
    return e
  }
  // Kulttuuri-ilta hyväksyy myös keikka+teatteri-yhdistelmät ("Decorado –
  // Rakkautta & Anarkiaa"): laji() priorisoi keikan, mutta sama tapahtuma on
  // täysin kelvollinen kulttuuri-ilta baarin kanssa.
  const otaKulttuuri = (minTunti: number): Event | null => {
    const e = tulevat.find((x) => !kaytetytTapahtumat.has(x.id) && alkuTunti(x) >= minTunti
      && getEventVibes(x).some((v) => v === 'teatteri' || v === 'taide' || v === 'museo')) ?? null
    if (e) kaytetytTapahtumat.add(e.id)
    return e
  }
  // Tapahtuman JÄLKEEN tuleva baari ei saa alkaa yli sovittimen drinkki-
  // yökaton (DRINKS_END_CAP_H 01.30 → 'myohaan'-varoitus): tapahtuma + 2¼ h.
  // Kävely tarkistetaan vasta baarin kanssa (lahinAuki kavelyMukaan).
  const jatkotEhtii = (e: Event) => alkuTunti(e) + 2.25 <= DRINKS_END_CAP_H
  const baariKlo = (e: Event) => clamp(alkuTunti(e) - 1.75, 19, 22.5)
  const ehtiiBaariin = (e: Event) => baariKlo(e) >= raja && baariKlo(e) + DUR_H.drinks + TRAVEL_BUFFER_H <= alkuTunti(e)
  const ehtii = (klo: number, kestoH: number, paikka: { lat?: number; lon?: number }, e: Event) => {
    if (klo < raja) return false
    const kavely = walkMinutesBetween(paikka, e.location ?? {}) ?? 0
    return klo + kestoH + kavely / 60 + TRAVEL_BUFFER_H <= alkuTunti(e)
  }
  // Baari ENNEN tapahtumaa: askeleen oletusKlo asetetaan laskettuun aikaan,
  // jotta sovitin aloittaa siitä eikä tyypin vakiosta. Tapahtuman JÄLKEEN
  // tuleva paikka saa aikansa sovittimesta (edellisen loppu + siirtymä).
  const baari = (kohde: Event, klo: number, ennen: boolean): Askel | null => {
    const r = lahinAuki(restaurants, 'baari', kohde.location!, paiva, klo, kaytetytPaikat, 1, !ennen)
    if (!r) return null
    kaytetytPaikat.add(r.id)
    return ennen ? { ...ravintolaAskel(r), oletusKlo: tunnitKloksi(klo) } : ravintolaAskel(r)
  }
  const tapahtumaJaBaari = (id: RunkoId, emoji: string, avain: TranslationKey, e: Event | null, klo: (e: Event) => number): Runko | null => {
    if (!e) return null
    const b = baari(e, klo(e), false)
    if (!b) { kaytetytTapahtumat.delete(e.id); return null }
    return { id, emoji, otsikkoAvain: avain, paiva, askeleet: [tapahtumaAskel(e), b] }
  }
  const baariRunko = (): Runko | null => {
    // 1. Keikka ja jatkot: keikka → baari jälkeen.
    const g = tapahtumaJaBaari('gig_bar', '🍻', 'plan.tpl_gig_bar', ota('keikka', 17, jatkotEhtii), (e) => Math.max(21, alkuTunti(e) + 2.25))
    if (g) return g
    // 2. Bileisiin: baari 1¾ h ennen (19.00–22.30) → klubi myöhään.
    for (let yritys = 0; yritys < 6; yritys++) {
      const e = ota('bileet', 21, ehtiiBaariin)
      if (!e) break
      const b = baari(e, baariKlo(e), true)
      if (b && ehtii(baariKlo(e), DUR_H.drinks, b, e)) return { id: 'party', emoji: '🪩', otsikkoAvain: 'plan.tpl_party', paiva, askeleet: [b, tapahtumaAskel(e)] }
      // Ei sovi: vapauta paikka, koeta seuraavaa tapahtumaa (tapahtuma jää
      // käytetyksi, ettei sama pari toistu).
      if (b?.viiteId) kaytetytPaikat.delete(b.viiteId)
    }
    // 3. Kulttuuri-ilta: teatteri/taide/museo → baari. 4. Stand up → baari. 5. Peli ja oluet.
    return tapahtumaJaBaari('culture', '🎭', 'plan.tpl_culture', otaKulttuuri(17), (e) => Math.max(21, alkuTunti(e) + 2.25))
      ?? tapahtumaJaBaari('standup', '😂', 'plan.tpl_standup', ota('standup', 17), (e) => Math.max(21, alkuTunti(e) + 2))
      ?? tapahtumaJaBaari('sport', '⚽', 'plan.tpl_sport', ota('urheilu', 16), (e) => Math.max(20.5, alkuTunti(e) + 2.25))
  }

  // PAIKKAILLAT: ankkuri keskusta, jokainen ilta eri paikoista (omistaja
  // 24.9.2026 klo 20.23: "jos ei ole mitään tulevaa tapahtumaa, se voisi
  // ehdottaa vaikka joku ruokapaikka joka on myöhään auki ja baari").
  const paikkaillat = (): Runko[] => {
    const tulos: Runko[] = []
    const askel = (r: Restaurant, klo: number): Askel => ({ ...ravintolaAskel(r), oletusKlo: tunnitKloksi(klo) })
    // A. Myöhäinen illallinen (auki vielä 1¼ h) → baari.
    {
      const r = lahinAuki(restaurants, 'ravintola', KESKUSTA, paiva, kaynti, kaytetytPaikat, 1.25)
      if (r) {
        kaytetytPaikat.add(r.id)
        const b = lahinAuki(restaurants, 'baari', r, paiva, kaynti + DUR_H.food + TRAVEL_BUFFER_H, kaytetytPaikat, 1, true)
        if (b) { kaytetytPaikat.add(b.id); tulos.push({ id: 'late_dinner', emoji: '🍽', otsikkoAvain: 'plan.tpl_late_dinner', paiva, askeleet: [askel(r, kaynti), ravintolaAskel(b)] }) }
        else kaytetytPaikat.delete(r.id)
      }
    }
    // B. Baarikierros: kaksi eri baaria lähekkäin.
    {
      const b1 = lahinAuki(restaurants, 'baari', KESKUSTA, paiva, kaynti, kaytetytPaikat, 1)
      if (b1) {
        kaytetytPaikat.add(b1.id)
        const b2 = lahinAuki(restaurants, 'baari', b1, paiva, kaynti + DUR_H.drinks + TRAVEL_BUFFER_H, kaytetytPaikat, 1, true)
        if (b2) { kaytetytPaikat.add(b2.id); tulos.push({ id: 'bar_hop', emoji: '🍸', otsikkoAvain: 'plan.tpl_bar_hop', paiva, askeleet: [askel(b1, kaynti), ravintolaAskel(b2)] }) }
        else kaytetytPaikat.delete(b1.id)
      }
    }
    // C. Baari → yökerho (auki kun baarista lähdetään).
    {
      const b = lahinAuki(restaurants, 'baari', KESKUSTA, paiva, kaynti, kaytetytPaikat, 1)
      if (b) {
        kaytetytPaikat.add(b.id)
        const y = lahinAuki(restaurants, 'yokerho', b, paiva, kaynti + DUR_H.drinks + TRAVEL_BUFFER_H, kaytetytPaikat, 1, true)
        if (y) { kaytetytPaikat.add(y.id); tulos.push({ id: 'club_night', emoji: '🪩', otsikkoAvain: 'plan.tpl_club_night', paiva, askeleet: [askel(b, kaynti), ravintolaAskel(y)] }) }
        else kaytetytPaikat.delete(b.id)
      }
    }
    return tulos
  }

  const baariIlta = baariRunko()
  const varaIllat = baariIlta ? [] : paikkaillat()
  lisaa(baariIlta ?? varaIllat.shift() ?? null)

  // ── Täyttö huomisella: iso → urheilu → muu (merkitään UI:ssa "Huomenna") ──
  for (const hae of [isot, urheilut, muut]) {
    while (rungot.length < 3) {
      const r = ensimmainenPari(hae(huomisetEhdokkaat))
      if (!r) break
      rungot.push(r)
    }
  }
  // Viimeinen varaus: ruokayhdistelmiä ei riitä → loput paikkaillat, jotta
  // käyttäjä saa silti kolme ehdotusta (ennen 4.10.2026 kaikki kolme olivat
  // näitä). Tapahtumapohjaisen baari-illan rinnalle vain jos tilaa jäi.
  for (const p of varaIllat.length ? varaIllat : (rungot.length < 3 ? paikkaillat() : [])) {
    if (rungot.length >= 3) break
    rungot.push(p)
  }

  return rungot.slice(0, 3)
}

/** Rungon kohteiden id:t (tapahtumat JA paikat) — "Vaihda ehdotusta" ohittaa
 *  nämä seuraavalla kerralla, jotta myös ravintola ja baari vaihtuvat. */
export function rungonTapahtumat(runko: Runko): string[] {
  return runko.askeleet.flatMap((a) => (a.viiteId ? [a.viiteId] : []))
}

/** Ottaa rungon suunnitelman pohjaksi (korvaa suunnitelman). */
export function kaytaRunko(runko: Runko, otsikko: string, lahde: 'runko' | 'runko-vaihto' = 'runko'): void {
  korvaaSuunnitelma({
    otsikko,
    paiva: runko.paiva,
    askeleet: runko.askeleet.map((a, i) => ({ ...a, id: `runko${i}` })),
  })
  // Sama mittari kuin keräilynapeilla; meta kertoo että lähde oli runko
  // (tai "Vaihda ehdotusta" -painallus).
  track('plan_add', { label: runko.id, meta: lahde })
}

/** Seuraava ehdotus "Vaihda ehdotusta" -napille: mieluiten samaa lajia kuin
 *  nykyinen, muuten mikä tahansa uusi; jos ohituslista on syönyt kaikki,
 *  aloitetaan alusta ohittaen vain nykyisen ehdotuksen tapahtumat. null =
 *  päivästä ei saa yhtään runkoa. */
export function seuraavaRunko(
  events: Event[], restaurants: Restaurant[], nyt: Date,
  nykyinen: Runko['id'] | null, ohita: ReadonlySet<string>, nykyisenTapahtumat: ReadonlySet<string>,
): { runko: Runko; ohita: Set<string> } | null {
  const valitse = (lista: Runko[]) => lista.find((r) => r.id === nykyinen) ?? lista[0] ?? null
  const tapahtumaIdt = new Set(events.map((e) => e.id))
  const vainTapahtumat = (s: ReadonlySet<string>) => new Set([...s].filter((id) => tapahtumaIdt.has(id)))
  // Kolme yritystä löysentäen: 1) kaikki ehdotetut (tapahtumat JA paikat)
  // poissa → aidosti uusi ehdotus; 2) vain ehdotetut tapahtumat poissa (paikat
  // saavat toistua — pieni ravintolakanta ei saa tyhjentää kiertoa);
  // 3) vain nykyisen ehdotuksen tapahtumat poissa → kierto alkaa alusta.
  const yritykset: ReadonlySet<string>[] = [ohita, vainTapahtumat(ohita), vainTapahtumat(nykyisenTapahtumat)]
  for (const o of yritykset) {
    const r = valitse(rakennaRungot(events, restaurants, nyt, { ohita: o }))
    if (!r) continue
    const uusiOhita = new Set(o)
    for (const id of rungonTapahtumat(r)) uusiOhita.add(id)
    return { runko: r, ohita: uusiOhita }
  }
  return null
}
