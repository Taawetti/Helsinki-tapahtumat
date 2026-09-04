// Kohderyhmärajaus suosituspinnoille (omistaja 24.8.2026): sovelluksen
// suositukset on suunnattu 18–40-vuotiaille helsinkiläisille, jotka etsivät
// mielenkiintoista tekemistä. Lapsille/perheille, nuorisolle (alaikäiset),
// senioreille ja käsityö-/askartelukerhoihin suunnatut tapahtumat EIVÄT
// kuulu suosituksiin (etusivun poiminnat + hero, Idea-pakka) — ne löytyvät
// edelleen kategorioista ja hausta ("voi etsiä sitten kategorioista mutta
// ei suosituksiin").
//
// Mitatut vuodot 24.8.2026, jotka tämä sulkee: "Picassot — taiteilua yhdessä
// vanhemman kanssa" (Perhetalo Naapuri), "Lammen liikuntahetki 0-6-vuotiaille",
// "Ilo liikkua-jumpparyhmä 1½- alle 2v", "Sateenkaarinuorten ilta 13-17-
// vuotiaille", "Neuletapaaminen / Tule mukaan neulomaan", leikkipuistojen
// liikuntahetket, digituen neuvonta.
//
// TARKKUUSANSAT (testit lukitsevat):
//  - "nuorten aikuisten" / "nuorille aikuisille" ON kohderyhmää (18–25) —
//    negatiivinen lookahead, pelkkä "nuorten" ilman aikuisia = alaikäiset
//  - ikähaitari vain 0–17 alkuisena ("13-17-vuotiaille" pois, "yli
//    18-vuotiaille" ja K18-merkinnät EIVÄT osu)
//  - "alle 2v"…"alle 12v" = lapset; "alle 18-vuotiailta kielletty" ei osu
//  - bänditrap: "Nuorgam" ei sisällä sanaa \bnuorten\b → ei osu

import { CHAMPIONSHIP_REGEX, classifyEvent, getEventVibes } from './event-classify'
import type { Event } from './types'

interface AudienceCheckable {
  title: string
  shortDescription?: string | null
  categories: string[]
  location?: { name?: string | null } | null
  /** Luokittelijan antamat tunnelmat. Tekstisäännöt eivät näe näitä: lapsille
   *  luokiteltu tapahtuma, jonka otsikossa ei lue mitään lapsista, läpäisi
   *  aiemmin tämän tarkistuksen kokonaan (mitattu 27.8.2026). */
  vibes?: string[]
}

const KIDS_TEENS =
  'vauva|taapero|muskari|satutunti|satutuokio|satuhetki|\\bloru|leikkipuisto|leikkituokio|leikki-ikäis|' +
  'perhekahvila|perheaamu|perhetalo|lapsiperhe|päiväkoti|eskari|koululais|kouluikäis|alakouluikäis|yläkouluikäis|' +
  '\\blapsi\\b|lapsille|lapsil|lapsen kanssa|\\blasten\\b|\\blapset\\b|' +
  'nuorisotalo|nuorisotila|\\bnuorten\\b(?!\\s+aikuis)|nuorille(?!\\s+aikuis)|' +
  'vanhemman kanssa|huoltajan kanssa|aikuisen kanssa'

// Ikähaitarit: alkupää 0–17 ("13-17-vuotiaille", "0-6 vuotiaille",
// "7–8-vuotiaat", "8-vuotiaille"). Vartalo 'vuotia' kattaa taivutukset
// (vuotiaat/vuotiaille/vuotiaita — mitattu vuoto 25.8.: "7–8-vuotiaat"
// ei osunut 'vuotiail'-muotoon). Kaksinumeroinen vaihtoehto (1[0-7]) ENNEN
// yksinumeroista, muuten "13" osuisi pelkkänä "1":nä ja jatko pettäisi.
// "18-vuotiaille" / "yli 18-vuotiailta" EIVÄT osu (18 ei läpäise numero-
// osaa, eikä 1|8 välissä ole sanarajaa). Syntymävuosikohdennus
// ("2018-2019 syntyneet") on aina ikäryhmärajaus → pois; "1800-luvulla
// syntyneet aatteet" ei osu (syntyne ei seuraa vuosilukua suoraan).
const AGE_RANGE =
  '\\b(?:1[0-7]|[0-9])(?:\\s*[–—-]\\s*(?:1[0-7]|[0-9]))?\\s*[–—-]?\\s*vuotia|' +
  '\\balle\\s*(?:1[0-2]|[2-9])\\s*[- ]?v\\b|alle kouluikäis|' +
  '\\b(?:19|20)\\d{2}\\s*(?:[–—-]\\s*(?:19|20)\\d{2}\\s*)?syntyne'

const SENIORS =
  '\\bseniori|eläkeläis|ikäihmis|ikäänty|seniorikeskus|palvelukeskus|palvelutalo|muistisair|digituki|digituen|digineuvo'

const HOBBY_CIRCLES =
  '\\bneule|neulon|neulomaan|virkkau|virkkaa|ompelukerho|ompeluseura|ompelupaja|ompeluohjaus|' +
  'käsityökerho|käsityöryhmä|kädentaito|askartelu|tilkku'

// Yhteisö- ja asukastalojen päiväohjelma (omistaja 27.8.2026 valitsi "pois
// kokonaan" alaskuopauksen sijaan). Seniorikeskukset ja leikkipuistot olivat jo
// poissa SENIORS-/KIDS_TEENS-säännöillä; yhteisötalo oli ainoa vastaava paikka-
// tyyppi joka puuttui, ja se päästi läpi mm. bingon klo 12.30 ja tikkakerhon.
//
// PAIKKATYYPIT, EI TOIMINTASANOJA. lib/nightlifen COMMUNITY_DAYTIME_REGEX on
// alaskuopausta varten ja siksi väljempi; sen sanaa 'omatoimi' EI otettu tänne,
// koska mitattuna se olisi vienyt Pasilan kirjaston kasvienvaihtopäivän ja
// Malmitalon varautumisluennon — molemmat kelpaavat kohderyhmälle.
const COMMUNITY_VENUES = '\\byhteisötalo|\\basukastalo|\\bkerhohuone'

// Opastetut kierrokset ja kaupunkikävelyt (omistaja 25.8. ja 27.8.2026:
// "Suomenlinna-kierros kuulostaa turistihommalta", "en halua turistikierroksia").
//
// Kaikki alla olevat luvut on mitattu 3 136 oikean tapahtuman otoksesta
// 27.8.2026. Mittaus on toistettavissa: aja kuvio otoksen otsikoita vasten.
//
// 1) VAIN OTSIKOSTA. Kuvauksen lukeminen pudotti konsertin "400 Years of the
//    House of Nobility: En saga", koska sen kuvauksessa MAINITTIIN saman talon
//    opastuskierros. Aito kierros kertoo luonteensa otsikossa; konsertti ei.
//
// 2) TÄSMÄLLINEN, EI PELKKÄ "kierros"/"tour"/"kävely". Löysä kuvio osui 68
//    tapahtumaan, joista 40 ei ollut kierroksia: bändien kiertueet (Devin
//    Townsend … Solo Tour, Samu Haber – Good Boy Tour, Brymir … Tour 2026),
//    kilpailukierrokset ja jopa "viheralueiden hiilenkierrosta".
//    Tämä kuvio osuu 28:aan ja kaikki 28 ovat aitoja kierroksia.
//
// 3) ÄLÄ LAAJENNA ILMAN MITTAUSTA. Otoksen "Helsinki tour" EI ole kierros vaan
//    klubi-ilta (kategoriat Yöelämä, Klubi) — juuri sitä sisältöä jota pakan
//    kuuluu ehdottaa. Samoin "Kuraattorikierros … -näyttelyssä" on kulttuuria,
//    jota omistaja nimenomaan haluaa. Siksi \w*kierros on sidottu sanaan
//    "opastettu"; irrallaan se veisi molemmat mukanaan.
export const TOUR_TITLE_REGEX = new RegExp(
  'opastet\\w*\\s+\\w*(?:kierros|kävely|retki)|opastuskierros|opaskierros|yleisökierros|' +
  'kaupunkikierros|kävelykierros|museokierros|kiertokävely|kaupunkikävely|arkkitehtuurikävely|' +
  'sightseeing|guided\\s+(?:tour|walk)|walking\\s+tour|city\\s+tour|turistikierros',
  'i',
)

/** Tunnelmat jotka eivät kuulu suosituksiin. Luokittelija voi merkitä
 *  tapahtuman lapsille vaikka otsikossa ei lue mitään lapsista. */
const OUT_OF_TARGET_VIBES = ['lapset']

// Kartan "Lapset & perhe" -kategoria (omistaja 4.9.2026): perhetapahtumat
// näkyvät VAIN kun kategoria on valittu, senioritapahtumat eivät koskaan.
// Sama tekstipohja kuin isOutsideTargetAudiencessa (otsikko + lyhytkuvaus +
// kategoriat + paikan nimi).
const PERHE_REGEX = new RegExp(`${KIDS_TEENS}|${AGE_RANGE}`, 'i')
const SENIORI_REGEX = new RegExp(SENIORS, 'i')

function audienceHay(e: AudienceCheckable): string {
  return [e.title, e.shortDescription ?? '', e.location?.name ?? '', ...e.categories].join(' ')
}

/** Lapsiperheille suunnattu tapahtuma (ei seniorisignaalia). */
export function onPerheTapahtuma(e: AudienceCheckable): boolean {
  const hay = audienceHay(e)
  return PERHE_REGEX.test(hay) && !SENIORI_REGEX.test(hay)
}

/** Senioreille suunnattu tapahtuma — ei näytetä kartalla lainkaan. */
export function onSenioriTapahtuma(e: AudienceCheckable): boolean {
  return SENIORI_REGEX.test(audienceHay(e))
}

export const OUT_OF_TARGET_REGEX = new RegExp(
  `${KIDS_TEENS}|${AGE_RANGE}|${SENIORS}|${HOBBY_CIRCLES}|${COMMUNITY_VENUES}`,
  'i',
)

/** Onko tapahtuma suunnattu kohderyhmän (18–40) ULKOPUOLELLE?
 *  Skannaa otsikon, lyhytkuvauksen, kategoriat ja tapahtumapaikan nimen
 *  (Perhetalo/Leikkipuisto/Seniorikeskus ovat vahvoja signaaleja) — EI koko
 *  kuvausta, koska festivaalimarkkinointi ("ohjelmaa koko perheelle") ei saa
 *  pudottaa aitoa festaria. */
export function isOutsideTargetAudience(e: AudienceCheckable): boolean {
  // 1) Luokittelu. Tarkistetaan ensin, koska se ei riipu sanamuodoista.
  //    Vibet lasketaan jos niitä ei ole: /api/events asettaa ne kaikille, mutta
  //    SSR-seedit ja vanhat välimuistivastaukset tulevat ilman — ja silloin
  //    sääntö olisi jäänyt hiljaa tekemättä juuri etusivun poiminnoissa.
  //    Eristetty kuten getEventVibes: luokitteluvirhe ei saa kaataa listaa.
  let vibes = e.vibes
  if (!vibes) {
    try {
      vibes = classifyEvent({ title: e.title, shortDescription: e.shortDescription ?? undefined, categories: e.categories })
    } catch {
      vibes = []
    }
  }
  // Mestaruuskilpailu ei ole lastentapahtuma, vaikka lähde merkitsisi sen
  // perheille (omistaja 27.8.2026). Mitattu 5 062 tuotannon tapahtumasta:
  // kilpailusignaali osuu 11:een ja niistä lapset-leima on YHDELLÄ — Skate SM.
  // Tekstisäännöt ajetaan silti alla, joten "Lasten SM-kisat" putoaisi yhä.
  if (vibes.some((v) => OUT_OF_TARGET_VIBES.includes(v)) &&
      !CHAMPIONSHIP_REGEX.test(`${e.title} ${e.shortDescription ?? ''}`)) return true

  // 2) Opastetut kierrokset: VAIN otsikosta, ks. TOUR_TITLE_REGEX.
  if (TOUR_TITLE_REGEX.test(e.title)) return true

  // 3) Muut tekstisäännöt: otsikko, lyhytkuvaus, paikan nimi ja kategoriat.
  const hay = [e.title, e.shortDescription ?? '', e.location?.name ?? '', ...e.categories].join(' ')
  return OUT_OF_TARGET_REGEX.test(hay)
}

// ── Poimintojen ykköskori (omistaja 25.8.2026): suosituksiin ENSIN
// kulttuuritapahtumat — etusivun kategoriaruudukon aihepiirit + festivaalit
// ("haluan kulttuuritapahtumia, näitä kategorioita mitä kuvassa näkyy +
// festivaaleja"). Vasta kun nämä eivät riitä, muut tapahtumat täyttävät
// loput ("jos nämä eivät riitä niin sitten voi tulla myös muuta").
// Opastetut kierrokset ym. turistisisältö putoaa kakkoskoriin itsestään.
// 'klassinen' mukana: sinfonia/ooppera on kulttuuria (omistaja hyväksyi
// juhlaviikkojen sinfonianoston 24.8.).


export const PRIMARY_PICK_VIBES = [
  'keikka', 'yoelama', 'standup', 'urheilu', 'baari',
  'underground', 'teatteri', 'taide', 'klassinen', 'festivaali',
] as const

/** Kuuluuko tapahtuma poimintojen ykköskoriin (kulttuurikategoriat +
 *  festivaalit)? Kakkoskori täyttää vasta kun ykköskori ei riitä. */
export function isPrimaryPick(e: Event): boolean {
  if (e.source === 'festivals') return true
  // Kirjaston harrastetapahtuma ei ole ykköskoria, vaikka lavea 'musiikki'-
  // kategoria osuisi keikka-vibeen (omistaja 4.9.2026: "Ukulelejamit ei ole
  // niin hyvä tapahtuma että se nousee oikeiden keikkojen edelle").
  if (e.categories.some((c) => /kirjasto/i.test(c)) || /kirjasto/i.test(e.location?.name ?? '')) return false
  const vibes = getEventVibes(e)
  return PRIMARY_PICK_VIBES.some((v) => vibes.includes(v))
}
