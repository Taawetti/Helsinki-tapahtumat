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
  /** LinkedEventsin avainsanatunnukset. Rakenteinen signaali, jota mikään
   *  sanamuoto ei voi huijata — ks. onOsallistumisformaatti. */
  ysoIds?: string[]
  /** Luokittelijan antamat tunnelmat. Tekstisäännöt eivät näe näitä: lapsille
   *  luokiteltu tapahtuma, jonka otsikossa ei lue mitään lapsista, läpäisi
   *  aiemmin tämän tarkistuksen kokonaan (mitattu 27.8.2026). */
  vibes?: string[]
}

// Vartalot, ei perusmuodot: 'vauv' kattaa vauvojen/vauvoille (mitattu 29.9.2026:
// "Vauvojen aamut" Kalasataman kirjastossa läpäisi 'vauva'-muodon), '\\blasten'
// ilman loppurajaa kattaa lastenleffan ja lastenkonsertin. Lisäsignaalit
// 29.9.2026 (omistajan lista): BabyKino, koululomien ohjelma (syysloma-
// leffat, "Höstlovsbio"), lukukoirat, temppurata, ruotsin barn-/familje-.
const KIDS_TEENS =
  'vauv|taaper|muskari|satutunti|satutuokio|satuhetki|satupäiv|satuseikkailu|\\bloru|leikkipuisto|leikkituokio|leikki-ikäis|' +
  'perhekahvila|perheaamu|perhetalo|perhepäiv|lapsiperhe|päiväkoti|eskari|koululais|kouluikäis|alakouluikäis|yläkouluikäis|' +
  '\\blapsi\\b|lapsille|lapsil|lapsen kanssa|\\blasten|\\blapset\\b|\\bkids?\\b|\\bchildren|\\bjunior|' +
  'babykino|\\bbaby[- ]?(?:kino|sirkus|jooga|hieronta|muskari|treffit|disko|dance)|' +
  'nuorisotalo|nuorisotila|nuorisopalvelu|\\bnuorten\\b(?!\\s+aikuis)|nuorille(?!\\s+aikuis)|' +
  'vanhemman kanssa|huoltajan kanssa|aikuisen kanssa|' +
  'lukukoira|temppurata|pikkulaps|lomaleffa|syyslom|talvilom|hiihtolom|' +
  'höstlov|sportlov|\\bbarn(?:en|ens|kalas|teater|film|bio|program|familj)\\w*|\\bfamilje\\w*'

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

// '\bseniori' EI osu sanaan 'senioreille' (allatiivissa vartalo katkeaa
// ennen i:tä), joten vartalo on 'senior'. Mitattu 9.9.2026, 4208 tuotanto-
// tapahtumaa: 48 riviä / 17 otsikkoa pääsi kohderyhmäportin läpi pelkästään
// tästä — mm. 'Sirkuskurssi senioreille, Ryhmä 2' @Stoa, joka nousi HEROON
// kahtena päivänä, sekä HopeaCine-seniorinäytökset ja Enter ry:n
// digiopastukset. Kävin kaikki 17 läpi: jokainen on aidosti senioreille
// suunnattu, eli laajennus ei tuo yhtään väärää osumaa.
const SENIORS =
  '\\bsenior|eläkeläis|ikäihmis|ikäänty|seniorikeskus|palvelukeskus|palvelutalo|muistisair|digituki|digituen|digineuvo'

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
  'kaupunkikierros|kävelykierros|museokierros|kulissikierros|kiertokävely|kaupunkikävely|arkkitehtuurikävely|' +
  'sightseeing|guided\\s+(?:tour|walk)|walking\\s+tour|city\\s+tour|turistikierros',
  'i',
)

// ── LAPSILLE TEHTY vs. SOPII MYÖS LAPSILLE (omistaja 29.9.2026) ─────────────
// Mitattu 29.9.2026 (30 pv, 4 550 tapahtumaa): 1 283 tapahtumaa oli poissa
// suosituksista lapsisyystä, ja niistä 60 riviä / 21 otsikkoa VAIN lähteen
// yleisötagin takia ("lapsiperheet", "perheet", "nuoret"): Creative Nerd
// 1996–2026 -näyttely (Kaapelitehdas, 28 riviä), Tutankhamun: The Immersive
// Exhibition, seitsemän yrittäjäneuvonnan verkkoinfoa, Lautapeli-illat
// Vuosaaren kirjastossa, Doc Helios -dokumentti, Will Funk For Food -tanssi-
// esitys, The Mystery Wires -tribuuttikonsertti. Ne ovat aikuisten kulttuuria,
// jota lähde vain suosittelee myös perheille. Omistaja: "sopii myös lapsille"
// ei ole sama kuin "lapsille tehty".
//
// Suosituksista putoaa vain tapahtuma, jolla on LAPSILLE TEHTY -signaali:
//   1. teksti (otsikko, lyhytkuvaus, paikan nimi): KIDS_TEENS + AGE_RANGE, sekä
//      luokittelijan 'lapset'-avainsanat otsikosta/lyhytkuvauksesta (lib/types
//      VIBES: ^perhe, ^kids, family, nuoret … — "Koko perheelle suunnattu
//      taikashow" on perhe-esitys, ei aikuisten näyttely)
//   2. lähteen kategorianimi, joka nimeää lapset tai nuoret YLEISÖKSI
//      (Lastentapahtumat, "lapset (ikäryhmät)", koululaiset, "nuorten
//      lomatekemistä", vauvat, Kids …)
//   3. yso-avainsana: lapset ikäryhmänä, vauvat, vauvaperheet, koululaiset,
//      leikkipuistot, leikkiminen, satutunnit
// HEIKKO signaali, joka EI pudota: yso lapsiperheet (p13050) / perheet
// (p4363), kategorianimi lapsiperheet/perheet/perhe/family/nuoret, tai
// luokittelijan 'lapset'-tunnelma ilman mitään yllä olevaa (se syntyy juuri
// näistä heikoista tageista). Kartan "Lapset & perhe" -kategoria
// (onPerheTapahtuma) pysyy laajana: sinne kuuluu myös perheille sopiva.
// Sirkus Finlandia pysyy ulkona (yso lapset ikäryhmänä), Skate SM näkyy
// (vain perheet-tagi + kisa). Mittaus toistettavissa: scripts/mittaa-kohderyhma.ts.
const KIDS_CLASSIFIER_TEXT = new RegExp(
  '\\blapsi|\\blapset|\\bperhe|\\blasten|nuoret|nuoriso|koululais|\\bkids|family|children|vauv|taaper|muskari|' +
  'satutun|satutuokio|leikkipuisto|loru|temppurata|leikkiminen|eskari|päiväkoti',
  'i',
)
const KIDS_CATEGORY_REGEX = new RegExp(
  'lastentapahtum|\\blapset\\b|\\blasten|lapsille|nuorille|\\bnuorten\\b(?!\\s+aikuis)|koululais|vauv|taaper|' +
  '\\bkids?\\b|children|junior|leikki|satutun|kuvakirj|lukukoir|lastenkulttuur|nuorisopalvelu|nuorisotalo|nuorisotila|\\bbarn',
  'i',
)
const WEAK_AUDIENCE_CATEGORY = /^(lapsiperheet|perheet|perhe|family|nuoret)$/i
const KIDS_YSO_STRONG = new Set(['yso:p4354', 'yso:p15937', 'yso:p20513', 'yso:p16485', 'yso:p8105', 'yso:p316', 'yso:p14710'])
const KIDS_YSO_WEAK = new Set(['yso:p13050', 'yso:p4363'])

export type LapsiSignaali = 'vahva' | 'heikko' | null

function turvallinenLuokittelu(e: AudienceCheckable): string[] {
  // Eristetty kuten getEventVibes: luokitteluvirhe ei saa kaataa listaa.
  try {
    return classifyEvent({ title: e.title, shortDescription: e.shortDescription ?? undefined, categories: e.categories })
  } catch {
    return []
  }
}

/** Tuleeko lapsille tehty -signaali TEKSTISTÄ (otsikko, lyhytkuvaus, paikka)? */
function lapsiTekstista(e: AudienceCheckable): boolean {
  const teksti = `${e.title} ${e.shortDescription ?? ''}`
  return KIDS_TEXT_REGEX.test(`${teksti} ${e.location?.name ?? ''}`) || KIDS_CLASSIFIER_TEXT.test(teksti)
}

/** 'vahva' = lapsille tai nuorille tehty, 'heikko' = sopii myös perheille
 *  (vain yleisötagi tai luokittelu), null = ei lapsisignaalia. */
export function lapsiSignaali(e: AudienceCheckable): LapsiSignaali {
  if (lapsiTekstista(e)) return 'vahva'
  if (e.categories.some((c) => KIDS_CATEGORY_REGEX.test(c))) return 'vahva'
  const yso = e.ysoIds ?? []
  if (yso.some((y) => KIDS_YSO_STRONG.has(y))) return 'vahva'
  if (yso.some((y) => KIDS_YSO_WEAK.has(y))) return 'heikko'
  if (e.categories.some((c) => WEAK_AUDIENCE_CATEGORY.test(c.trim()))) return 'heikko'
  if ((e.vibes ?? turvallinenLuokittelu(e)).includes('lapset')) return 'heikko'
  return null
}

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

/** Lapsille/nuorille tehty -tekstisääntö: otsikko + lyhytkuvaus + paikan nimi. */
const KIDS_TEXT_REGEX = new RegExp(`${KIDS_TEENS}|${AGE_RANGE}`, 'i')
/** Seniorit, käsityökerhot ja yhteisötalot: otsikko, lyhytkuvaus, paikka JA kategoriat. */
const OTHER_OUT_OF_TARGET_REGEX = new RegExp(`${SENIORS}|${HOBBY_CIRCLES}|${COMMUNITY_VENUES}`, 'i')

/** Onko tapahtuma suunnattu kohderyhmän (18–40) ULKOPUOLELLE?
 *  Skannaa otsikon, lyhytkuvauksen, kategoriat ja tapahtumapaikan nimen
 *  (Perhetalo/Leikkipuisto/Seniorikeskus ovat vahvoja signaaleja) — EI koko
 *  kuvausta, koska festivaalimarkkinointi ("ohjelmaa koko perheelle") ei saa
 *  pudottaa aitoa festaria. Lapsisignaalin vahvuus: ks. lapsiSignaali. */
export function isOutsideTargetAudience(e: AudienceCheckable): boolean {
  // 1) Opastetut kierrokset: VAIN otsikosta, ks. TOUR_TITLE_REGEX.
  if (TOUR_TITLE_REGEX.test(e.title)) return true

  // 2) Seniorit, käsityökerhot, yhteisötalot: otsikko, lyhytkuvaus, paikka, kategoriat.
  if (OTHER_OUT_OF_TARGET_REGEX.test(audienceHay(e))) return true

  // 3) Lapset ja nuoret: vain LAPSILLE TEHTY -signaali pudottaa (29.9.2026).
  if (lapsiSignaali(e) !== 'vahva') return false
  // Mestaruuskilpailu ei ole lastentapahtuma, vaikka lähde merkitsisi sen
  // lapsille tai perheille (omistaja 27.8.2026, Skate SM). Poikkeus koskee
  // vain rakenteista signaalia: "Lasten SM-kisat" putoaa yhä tekstisäännöllä.
  if (!lapsiTekstista(e) && CHAMPIONSHIP_REGEX.test(`${e.title} ${e.shortDescription ?? ''}`)) return false
  return true
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

// ── Osallistumis- ja puheformaatti (VAIN suosituspintojen portti) ───────────
//
// Kurssi, opastus, luento, lukupiiri, kielikahvila. TÄSMÄNIMI kategoriassa tai
// LinkedEventsin avainsanatunnus — ei osamerkkijonoja, joten yhdyssana-ansa
// on rakenteellisesti mahdoton.
//
// TÄTÄ EI KUTSUTA isOutsideTargetAudiencen sisältä: nämä tapahtumat kuuluvat
// kategorioihin, hakuun, kartalle ja Parhaisiin poimintoihin aivan kuten
// ennenkin. Rajaus koskee vain heroa ja iltapushia (lib/picks).
//
// Mitattu 9.9.2026, 4208 tuotantotapahtumaa. Rakenneportin (lib/picks kaista
// A/B) jälkeen hero-allas on 577 riviä, ja tästä vedosta leikkaa altaasta
// enää:
//   'luennot' + yso:p15875 → 10 riviä / 4 otsikkoa, kaikki aitoja luentoja
//   ('Antiikin Kreikan klassikot VI' nousi HEROON, koska sana 'komedian'
//   antoi sille 4 pistettä; 'Oopperan historia 3', kaksi työväenopiston
//   luentoa). Nämä pääsevät kaista B:ltä, koska luennon aihe tuottaa
//   taide-/teatterivibejä.
// Loput nimet ja tunnukset leikkaavat NYT nolla riviä — rakenneportti hoitaa
// ne jo. Ne ovat silti tässä yhdistelmätapausten varalta (tapahtuma jolla on
// SEKÄ ohjelmatyyppi ETTÄ kurssiformaatti), ja täsmänimen ylläpitokustannus
// on nolla.
//
// MITATUSTI POIS JÄTETYT:
//   'keskustelu' (447 riviä) — leikkaisi altaasta 3 riviä joista kaksi on
//     aitoja: 'MMK - GMC Sessions: Widenius, Murtola & Mugu' @Itäkeskuksen
//     kirjasto (kategoria 'konsertit', oikea jazzkonsertti) ja 'Kirjailijat
//     lavalla' @Suomen Kansallisteatteri.
//   yso:p14004 (301 riviä) — leikkaisi saman GMC Sessions -konsertin.
//   kulke:732 'Työpajat' (109 riviä) — leikkaisi 'Salsaa Vuotalon aulassa'
//     ja 'WelcomeDay – Naapurustotapahtuma Kanneltalolla'. Sama asia
//     kategorianimenä ('työpajat') on tarkempi: se leikkaa nolla aitoa.
//   'osallistuminen' / yso:p10727 — osallistavuusleima, ei formaatti
//     (664 riviä, mm. livekeikkoja ja Midnight Run).
const FORMAT_CATS = new Set([
  'luennot', 'luento', 'opastus', 'kurssit', 'työpajat', 'lukupiirit',
  'kielikahvilat', 'kädentaidot', 'käsityöt', 'digitaidot', 'digineuvonta',
  'askartelu', 'ompelu',
])
const FORMAT_IDS = new Set([
  'yso:p15875',          // esitelmät/luennot
  'yso:p2149',           // opastus, neuvonta
  'yso:p9270',           // ryhmätoiminta
  'yso:p4923',           // käsityöt
  'yso:p8630',           // ompelu
  'yso:p37943',          // digiopastus
  'helsinki:agjffvmzeu', // lukupiirit
  'helsinki:aflfbatker', // digituki
])

/** Kurssi-, opastus- tai puheformaatti lähteen RAKENTEISEN datan mukaan. */
export function onOsallistumisformaatti(e: AudienceCheckable): boolean {
  if (e.categories.some((c) => FORMAT_CATS.has(String(c).toLowerCase().trim()))) return true
  return (e.ysoIds ?? []).some((id) => FORMAT_IDS.has(id))
}
