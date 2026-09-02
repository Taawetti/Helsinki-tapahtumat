import { Event } from './types'

// Terrace/outdoor keyword match — shared by the home feed's summer carousel
// and the /terassit SEO page.
export const TERRACE_REGEX = /terassi|ulkoilma|outdoor|puisto|esplanadi|kasarmitori|allas|ranta|ulkoilta|kesäohjelma/

// Keyword-tiered nightlife relevance score. Shared by the home feed
// (hero + "Illan parhaat" carousel) and the evening push digest.
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
  { pisteet: -1, kuvio: /näyttely|museo|luento|seminaari|workshop|työpaja/ },
  { pisteet: 8,  kuvio: /festivaali|festival|festarit/ },
  { pisteet: 7,  kuvio: /keikka|konsertti|live[\s-]?musiikki|bändi|gig/ },
  // (?<!käsit)yökerho: "käsitYÖKERHO" sai 6 pistettä yökerhona (löytyi
  // yhdyssana-auditoinnissa 2.9.2026) — sama ansa oli jo korjattu yoelama-
  // VIBEN avainsanoista ('^yökerho'), mutta tämä regex jäi silloin väliin.
  { pisteet: 6,  kuvio: /klubi|dj[\s-]?set|(?<!käsit)yökerho|disco|rave|after[\s-]?party/ },
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
