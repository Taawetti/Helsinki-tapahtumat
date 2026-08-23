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

export function nightlifeScore(e: Event): number {
  const text = [e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase()
  // POISSULUT ENSIN. Aiemmin baari-osuma voitti työpaja-sakon, koska
  // järjestys palkitsi ensin — ja "Stadin yhteisötalo SaunaBAARI" antoi
  // askarteluryhmälle yöelämäpisteet (mitattu).
  if (COMMUNITY_DAYTIME_REGEX.test(text)) return -2
  if (/näyttely|museo|luento|seminaari|workshop|työpaja/.test(text)) return -1
  if (/festivaali|festival|festarit/.test(text)) return 8
  if (/keikka|konsertti|live[\s-]?musiikki|bändi|gig/.test(text)) return 7
  if (/klubi|dj[\s-]?set|yökerho|disco|rave|after[\s-]?party/.test(text)) return 6
  if (/jääkiekko|jalkapallo|ottelu|urheilu|koripallo/.test(text)) return 5
  if (/stand[\s-]?up|komedia|comedy/.test(text)) return 4
  // (?<!sauna): "Saunabaari" on yhteisötalon nimi, ei baari — mutta
  // viinibaari/olutbaari OVAT baareja, joten sanaraja ei käy.
  if (/(?<!sauna)baari|\bpubi?\b|cocktail|terassi/.test(text)) return 3
  if (/ravintola|illallinen|pop[\s-]?up|ruoka/.test(text)) return 2
  return e.image ? 1 : 0
}
