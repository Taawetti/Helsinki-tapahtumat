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

interface AudienceCheckable {
  title: string
  shortDescription?: string | null
  categories: string[]
  location?: { name?: string | null } | null
}

const KIDS_TEENS =
  'vauva|taapero|muskari|satutunti|satutuokio|satuhetki|\\bloru|leikkipuisto|leikkituokio|leikki-ikäis|' +
  'perhekahvila|perheaamu|perhetalo|lapsiperhe|päiväkoti|eskari|koululais|kouluikäis|alakouluikäis|yläkouluikäis|' +
  '\\blapsi\\b|lapsille|lapsil|lapsen kanssa|\\blasten\\b|\\blapset\\b|' +
  'nuorisotalo|nuorisotila|\\bnuorten\\b(?!\\s+aikuis)|nuorille(?!\\s+aikuis)|' +
  'vanhemman kanssa|huoltajan kanssa|aikuisen kanssa'

// Ikähaitarit: alkupää 0–17 ("13-17-vuotiaille", "0-6 vuotiaille",
// "8-vuotiaille"). Kaksinumeroinen vaihtoehto (1[0-7]) ENNEN yksinumeroista,
// muuten "13" osuisi pelkkänä "1":nä ja jatko pettäisi. "18-vuotiaille" /
// "yli 18-vuotiailta" EIVÄT osu (18 ei läpäise numero-osaa, eikä 1|8 välissä
// ole sanarajaa).
const AGE_RANGE =
  '\\b(?:1[0-7]|[0-9])(?:\\s*[–—-]\\s*(?:1[0-7]|[0-9]))?\\s*[–—-]?\\s*vuotiail|' +
  '\\balle\\s*(?:1[0-2]|[2-9])\\s*[- ]?v\\b|alle kouluikäis'

const SENIORS =
  '\\bseniori|eläkeläis|ikäihmis|ikäänty|seniorikeskus|palvelukeskus|palvelutalo|muistisair|digituki|digituen|digineuvo'

const HOBBY_CIRCLES =
  '\\bneule|neulon|neulomaan|virkkau|virkkaa|ompelukerho|ompeluseura|käsityökerho|käsityöryhmä|kädentaito|askartelu|tilkku'

export const OUT_OF_TARGET_REGEX = new RegExp(
  `${KIDS_TEENS}|${AGE_RANGE}|${SENIORS}|${HOBBY_CIRCLES}`,
  'i',
)

/** Onko tapahtuma suunnattu kohderyhmän (18–40) ULKOPUOLELLE?
 *  Skannaa otsikon, lyhytkuvauksen, kategoriat ja tapahtumapaikan nimen
 *  (Perhetalo/Leikkipuisto/Seniorikeskus ovat vahvoja signaaleja) — EI koko
 *  kuvausta, koska festivaalimarkkinointi ("ohjelmaa koko perheelle") ei saa
 *  pudottaa aitoa festaria. */
export function isOutsideTargetAudience(e: AudienceCheckable): boolean {
  const hay = [e.title, e.shortDescription ?? '', e.location?.name ?? '', ...e.categories].join(' ')
  return OUT_OF_TARGET_REGEX.test(hay)
}
