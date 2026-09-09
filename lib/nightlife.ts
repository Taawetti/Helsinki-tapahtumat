import { Event } from './types'

// Terrace/outdoor keyword match — shared by the home feed's summer carousel
// and the /terassit SEO page.
export const TERRACE_REGEX = /terassi|ulkoilma|outdoor|puisto|esplanadi|kasarmitori|allas|ranta|ulkoilta|kesäohjelma/

// Keyword-tiered nightlife relevance score.
//
// TÄRKEÄ ROOLIMUUTOS 9.9.2026: tämä EI OLE ENÄÄ PORTTI vaan LAJITTELUAVAIN.
// Hero ja iltapushi päästivät tapahtuman sisään pelkällä avainsanapisteellä
// (nightlifeScore >= 3), joten jokainen osamerkkijono-ansa oli suoraan
// hero-bugi: kirjaston äänitysopastus "Äänityksen perusteet Bändi- ja
// laulustudiossa" sai 7 pistettä studion nimestä ja nousi etusivun ylimmäksi
// kortiksi. Sisäänpääsy ratkaistaan nyt rakenteisesti (lib/picks +
// lib/event-classify ohjelmatyyppi); nämä pisteet päättävät enää
// JÄRJESTYKSEN. Alla olevat kuviokorjaukset eivät siis estä nostoja, ne
// estävät väärän järjestyksen.
/**
 * Päiväsaikainen yhteisöohjelma: leikkipuistot, yhteisö-/asukastalot,
 * palvelukeskukset, omatoimi- ja askarteluryhmät. Laadukkaita kuvia,
 * mutta EI koskaan "illan parhaita", heroa tai iltapushia — ja Idea-pakassa
 * alaskuopaus. Mitattu 24.8.2026: maanantain kaupunkiohjelma
 * kuvapankkikuvineen valtasi kärjen (Käsityöryhmä "Illan keikat" -herossa,
 * leikkipuistot poiminnoissa).
 */
export const COMMUNITY_DAYTIME_REGEX =
  /perheaamu|perhekahvila|leikkipuisto|leikkituokio|pihapuuhat|muskari|satutunti|satutuokio|vauva|taapero|nuorisotalo|nuorisotila|\bnuta\b|tyttönuta|seniorikeskus|palvelukeskus|palvelutalo|asukastalo|yhteisötalo|eläkeläis|ikäihmis|kerhohuone|askartelu|käsityöryhmä|ompelu|omatoimi/i

// Pisteytysportaat DATANA, jotta yhdyssana-auditointi (scripts/audit-compounds
// --nightlife-osio) voi ajaa samat kuviot oikeaa sanastoa vasten. Barbaari-
// tapaus 2.9.2026 oli TOINEN kerta kun osamerkkijono osui yhdyssanan sisään
// ("bluesperheenä" oli ensimmäinen) — VIBES-avainsanoilla vartija oli jo,
// näillä ei. Järjestys on merkitsevä: poissulut ensin, sitten laskevat pisteet.
//
// baari: (?<!sauna) = "Saunabaari" on yhteisötalon nimi; (?<!bar) =
// "barbaari(rannikon)" EI ole baari — merirosvokirjan julkistus nousi heroon
// 3 pisteellä (mitattu 1.9.2026: "Kirjailijavieraana Ari Saastamoinen",
// kuvauksessa "Barbaarirannikon merirosvot"). Sanarajaa ei voi käyttää,
// koska viinibaari/olutbaari/kellaribaari OVAT baareja.
export const NIGHTLIFE_TIERS: { pisteet: number; kuvio: RegExp }[] = [
  { pisteet: -2, kuvio: COMMUNITY_DAYTIME_REGEX },
  { pisteet: -1, kuvio: /näyttely|museo|luenno|luento|seminaari|workshop|työpaja/ },
  { pisteet: 8,  kuvio: /festivaali|festival|festarit/ },
  // bändi[a-zåäö]{0,4}(?![a-zåäö0-9-]): PERIAATE, EI SANALISTA. Suomen
  // taivutuspääte on enintään 4 merkkiä, yhdyssanan jatko-osa vähintään 5.
  // Tarkistin korpuksen KAIKKI bändi-tokenit (9.9.2026): osuu bändi/bändin/
  // bändiin/bändiä/bändiksi/klassikkobändit/katubändinä (kaikki oikeita),
  // EI osu 'bändisoittimia' (8 riviä) eikä 'bändi-' — juuri se
  // koordinaatioyhdyssana ("Bändi- ja laulustudiossa") nosti kirjaston
  // äänitysopastuksen heroon. Sanaraja \b EI olisi auttanut, koska
  // väliviivan takia 'bändi-' on oma tokeninsa.
  // gig: JavaScriptin \b on ASCII-pohjainen eikä kestä ä:tä ('gigejä'),
  // siksi lookaround. Mitattu: vanha /gig/ osui 16 riviin ja KAIKKI olivat
  // väärin (merilehmän lajinimi 'Hydrodamalis gigas' 14, 'digigurun' 2).
  { pisteet: 7,  kuvio: /keikka|konsertti|live[\s-]?musiikki|bändi[a-zåäö]{0,4}(?![a-zåäö0-9-])|(?<![a-zåäö0-9])gig(s|it|ejä|ille|in|inä)?(?![a-zåäö0-9])/ },
  // (?<!käsit)yökerho: "käsitYÖKERHO" sai 6 pistettä yökerhona (löytyi
  // yhdyssana-auditoinnissa 2.9.2026) — sama ansa oli jo korjattu yoelama-
  // VIBEN avainsanoista ('^yökerho'), mutta tämä regex jäi silloin väliin.
  // disco(?!rd|very): kirjaston mangapiirin discord.gg-liittymislinkki antoi
  // yöelämäpisteet; 'very' suojaa sanan 'discovery'. Mitattu: 12 → 11 riviä,
  // ja kaikki 11 ovat aitoja discoja (OSAKUNTADISCO, Discolauantai, HOT
  // DISCO, Avaruusdisco). rave: vanha kuvio osui 4 riviin joista kaikki
  // olivat travel/travels/travellers/disgrave.
  { pisteet: 6,  kuvio: /klubi|dj[\s-]?set|(?<!käsit)yökerho|disco(?!rd|very)|(?<![a-zåäö0-9])rave(t|ja|ssa|en|a)?(?![a-zåäö0-9])|after[\s-]?party/ },
  { pisteet: 5,  kuvio: /jääkiekko|jalkapallo|ottelu|urheilu|koripallo/ },
  // tragi-/draamakomedia on teatteria, ei stand-upia (sama rajaus kuin
  // standup-VIBEN '^komedia'-avainsanassa).
  { pisteet: 4,  kuvio: /stand[\s-]?up|(?<!tragi)(?<!draama)komedia|comedy/ },
  { pisteet: 3,  kuvio: /(?<!sauna)(?<!bar)baari|\bpubi?\b|cocktail|terassi/ },
  { pisteet: 2,  kuvio: /ravintola|illallinen|pop[\s-]?up|ruoka/ },
]

export function nightlifeScore(e: Event): number {
  const text = [e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase()
  // POISSULUT ENSIN (taulukon järjestys). Aiemmin baari-osuma voitti työpaja-
  // sakon, koska järjestys palkitsi ensin — ja "Stadin yhteisötalo SaunaBAARI"
  // antoi askarteluryhmälle yöelämäpisteet (mitattu).
  for (const { pisteet, kuvio } of NIGHTLIFE_TIERS) {
    if (kuvio.test(text)) return pisteet
  }
  return e.image ? 1 : 0
}
