// Sama esitys eri lähteistä, kun otsikot eivät täsmää merkilleen.
//
// Kooste yhdistää lähteiden duplikaatit normalisoidulla otsikolla + Helsinki-
// päivällä (app/api/events dedupKey → normalisoiOtsikkoAvain). Paikan omat
// sivut kirjoittavat otsikon usein lyhyemmin kuin LinkedEvents tai lippu-
// kauppa: "Cory Henry" vs "Cory Henry: A Jam Good Time" (Kulttuuritalo
// 29.11.2026), "Gaala Liveshow" vs "Gaala Liveshow – Loppuunmyyty!", "NHL
// Global Series" vs "NHL Global Series: Seattle Kraken – Carolina
// Hurricanes". Mitattu tuotannosta 3.11.2026: 30 tällaista paria kuukaudessa.
//
// onSamaEsitys sanoo, ovatko kaksi tapahtumaa sama esitys, kun toinen
// normalisoitu otsikko on toisen SANA-ALKU. Omistajan ehto: kaksi eri
// esitysaikaa samana päivänä ei saa yhdistyä. Siksi:
//   - paikan nimen pitää olla sama (tai sama + kaupungin nimi: "G Livelab" /
//     "G Livelab Helsinki", suomeksi genetiivi edessä: "Helsingin
//     Kulttuuritalo" / "Kulttuuritalo" — lippu.fi, todettu 4.11.2026);
//     muulla sanalla jatkettu nimi on ERI TOIMIPISTE
//     ("Ravintola Skiffer" / "Ravintola Skiffer Postipuisto" — kaksi eri
//     tietovisaa samaan aikaan, koordinaatitkin samat) eikä yhdisty koskaan;
//   - eri-nimiset paikat yhdistyvät vain alle 150 m päässä ja käytännössä
//     samaan aikaan (Stoa / Itäkeskuksen kirjasto, 24 m);
//   - alkuaikojen ero saa olla enintään 90 min (ovet 19, esitys 20);
//     tasan sama aika on tavallisin. Jos toisen aika on skraperin oletus
//     (startTimeApprox) tai otsikkoon kirjoitettu kellonaika täsmää toisen
//     aikaan, aikaeroa ei lasketa;
//   - tuntemattomalla ajalla (pelkkä päivä) ei yhdistetä. Yli vuorokauden
//     kestävä rivi on joko teatterin ESITYSKAUSI ("No-No" 19.11.–29.12. vs
//     "No-No Ensi-Ilta" — sama ensi-ilta, yhdistetään) tai festivaalin
//     KATTOTAPAHTUMA, jonka ohjelmanumero on kirjoitettu erottimen perään
//     ("Flow Festival" vs "Flow Festival: Artisti") — ei yhdistetä;
//   - tarkkeet eivät erota: "Jan Uuspõld STAND-UP" ja "Jan Uuspold STAND-UP"
//     ovat sama (lippukauppa kirjoittaa ilman õ:ta);
//   - lyhyemmän otsikon pitää olla vähintään kaksi sanaa tai 8 merkkiä
//     ("Jazz" ei saa niellä "Jazz Night" -iltaa).
// Kaikki puhtaita funktioita — testit scripts/test-categories.ts.

import { decodeHtmlEntities, tuntematonAika } from './utils'
import { helsinkiDateOf } from './helsinki-time'
import { irrotaOtsikonAika } from './otsikon-aika'

/** Koosteen dedup-avaimen otsikko-osa: lippuluokat, vuodet, "Sold out" -
 *  etuliite ja välimerkkien vaihtelu pois. Siirretty app/api/events-reitistä
 *  sellaisenaan (3.11.2026), jotta sama normalisointi on käytössä täällä. */
export function normalisoiOtsikkoAvain(title: string): string {
  // Entiteettipurku ENNEN avainta: '& Julia' ja '&amp; Julia' ovat sama
  // tapahtuma (tuotannossa 5.9.2026 sama musikaali näkyi 2–3 korttina eri
  // lähteistä). Samoin 'SOLD OUT:' -etuliite ei saa erottaa avaimia.
  return decodeHtmlEntities(title)
    .replace(/^\s*(?:sold\s*out|loppuunmyyty|myyty\s*loppuun)\s*[:!]?\s*/i, '')
    .replace(/\s*\|.*$/, '')            // strip everything after | (ticket tier separators)
    .replace(/\s*[\|–\-]\s*(premium|legacy|standard|vip|gold|silver|early|late|general|suite|seat|ticket|standing|seated|presale|fan\s*club)[\w\s]*/gi, '')
    .replace(/\b20\d{2}\b/g, '')        // strip years
    .replace(/\s*\(päivä\s*\d+\/\d+\)/gi, '') // strip festival day suffix
    .replace(/[^\wäöåÄÖÅ\s]/g, ' ')    // punct → space
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export interface EsitysVertailtava {
  title: string
  startTime: string
  endTime?: string | null
  startTimeApprox?: boolean
  location?: { name?: string | null; lat?: number | null; lon?: number | null } | null
}

export const SAMA_ESITYS_RAJAT = {
  /** Sama paikka: alkuaikojen suurin ero minuutteina (ovet vs esitys). */
  samaPaikkaMin: 90,
  /** Eri-niminen paikka lähellä: suurin aikaero minuutteina. */
  lahellaMin: 15,
  /** Eri-niminen paikka: suurin etäisyys metreinä. */
  lahellaM: 150,
  /** Yli tämän kestävä on kattotapahtuma (festivaali), ei esitys. */
  kattoTuntia: 24,
} as const

// Myös genetiivit: suomi laittaa kaupungin nimen ETEEN ("Helsingin
// Kulttuuritalo"), englanti ja ruotsi perään. Ruotsin genetiivi on sama sana.
const KAUPUNKISANAT = new Set([
  'helsinki', 'helsingin', 'helsingfors', 'espoo', 'espoon', 'esbo', 'vantaa', 'vantaan', 'vanda',
  'kauniainen', 'kauniaisten', 'grankulla',
])

const sanat = (s: string): string[] => s.split(' ').filter(Boolean)
/** ä→a, õ→o jne. — vain sana-alkuvertailuun, ei koosteen avaimeen. */
const riisuTarkkeet = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
/** Erotin, jonka perään ohjelmanumero kirjoitetaan: "Festivaali: Artisti", "Festivaali – Artisti". */
const OHJELMANUMERON_EROTIN = /:\s|\s[–—-]\s|\s\|\s/
const onSanaAlku = (lyhyt: string, pitka: string): boolean => pitka.startsWith(`${lyhyt} `)

function normalisoiPaikka(nimi: string | null | undefined): string {
  return (nimi ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export type Paikkasuhde = 'sama' | 'eri-toimipiste' | 'eri-nimi' | 'tuntematon'

/** Paikan nimien suhde: sama; sama + kaupunki → sama; muulla sanalla
 *  jatkettu → eri toimipiste; muuten eri nimi; tyhjä → tuntematon. */
export function paikkasuhde(a: string | null | undefined, b: string | null | undefined): Paikkasuhde {
  const pa = normalisoiPaikka(a)
  const pb = normalisoiPaikka(b)
  if (!pa || !pb) return 'tuntematon'
  if (pa === pb) return 'sama'
  const [lyhyt, pitka] = pa.length <= pb.length ? [pa, pb] : [pb, pa]
  if (onSanaAlku(lyhyt, pitka)) {
    const lisa = sanat(pitka.slice(lyhyt.length))
    return lisa.every((s) => KAUPUNKISANAT.has(s)) ? 'sama' : 'eri-toimipiste'
  }
  // Kaupunkisana EDESSÄ: "Helsingin Kulttuuritalo" (lippu.fi) on sama talo
  // kuin "Kulttuuritalo". Muu etusana ("KULT, Kulttuuritalo", "Arena-näyttämö
  // - Helsingin kaupunginteatteri") jää eri nimeksi: sali tai lava samassa
  // talossa ratkeaa etäisyydellä ja ajalla kuten ennenkin.
  if (pitka.endsWith(` ${lyhyt}`)) {
    const etu = sanat(pitka.slice(0, pitka.length - lyhyt.length))
    if (etu.every((s) => KAUPUNKISANAT.has(s))) return 'sama'
  }
  return 'eri-nimi'
}

/** Likimääräinen etäisyys metreinä (tasoprojektio, riittää alle kilometrin). */
export function etaisyysM(a: EsitysVertailtava['location'], b: EsitysVertailtava['location']): number | null {
  if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) return null
  const dy = (a.lat - b.lat) * 111_320
  const dx = (a.lon - b.lon) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
  return Math.round(Math.hypot(dx, dy))
}

function helsinkiKlo(iso: string): string {
  const osat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const h = osat.find((p) => p.type === 'hour')?.value ?? '00'
  const m = osat.find((p) => p.type === 'minute')?.value ?? '00'
  return `${h}:${m}`
}

function onPitkakestoinen(e: EsitysVertailtava): boolean {
  if (!e.endTime) return false
  const kesto = new Date(e.endTime).getTime() - new Date(e.startTime).getTime()
  return Number.isFinite(kesto) && kesto > SAMA_ESITYS_RAJAT.kattoTuntia * 3_600_000
}

/** Kattotapahtuma + ohjelmanumero: pitkäkestoinen rivi on se, jolla on LYHYEMPI
 *  otsikko, ja pidempi otsikko jatkaa sitä erottimen perään. Teatterin
 *  esityskausi + "Ensi-Ilta"/"ennakko" ei osu tähän (ei erotinta). */
function onKattotapahtumaJaOhjelmanumero(lyhytOtsikko: EsitysVertailtava, pitkaOtsikko: EsitysVertailtava): boolean {
  if (!onPitkakestoinen(lyhytOtsikko)) return false
  const jatko = pitkaOtsikko.title.slice(Math.min(pitkaOtsikko.title.length, Math.max(0, lyhytOtsikko.title.trim().length - 2)))
  return OHJELMANUMERON_EROTIN.test(jatko)
}

/** Otsikkoon kirjoitettu kellonaika eroaa rivin omasta ajasta → aika on
 *  skraperin oletus ("… klo 16:00" mutta startTime 19:00). Yhdistäessä
 *  toisen lähteen oikea aika saa voittaa, kuten startTimeApprox-rivillä. */
export function otsikonKloEroaaAjasta(e: Pick<EsitysVertailtava, 'title' | 'startTime'>): boolean {
  const klo = irrotaOtsikonAika(e.title).klo
  if (klo === null || tuntematonAika(e.startTime)) return false
  try { return klo !== helsinkiKlo(e.startTime) } catch { return false }
}

/** Otsikko kantaa päivä-/kellonaikaliitettä ("Jarkko Tamminen Show 5.-7.11.2026"). */
export function otsikossaPaivaliite(title: string): boolean {
  return irrotaOtsikonAika(title).otsikko !== title.trim()
}

export function onSamaEsitys(a: EsitysVertailtava, b: EsitysVertailtava): boolean {
  const ta = normalisoiOtsikkoAvain(riisuTarkkeet(a.title))
  const tb = normalisoiOtsikkoAvain(riisuTarkkeet(b.title))
  if (!ta || !tb || ta === tb) return false // täsmälleen sama hoidetaan dedup-avaimella
  const [lyhyt, pitka] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  if (!onSanaAlku(lyhyt, pitka)) return false
  if (sanat(lyhyt).length < 2 && lyhyt.length < 8) return false
  const lyhyenTapahtuma = ta.length <= tb.length ? a : b
  const pitkanTapahtuma = lyhyenTapahtuma === a ? b : a

  let pa: string
  let pb: string
  try { pa = helsinkiDateOf(a.startTime); pb = helsinkiDateOf(b.startTime) } catch { return false }
  if (pa !== pb) return false
  if (tuntematonAika(a.startTime) || tuntematonAika(b.startTime)) return false
  if (onKattotapahtumaJaOhjelmanumero(lyhyenTapahtuma, pitkanTapahtuma)) return false

  const suhde = paikkasuhde(a.location?.name, b.location?.name)
  if (suhde === 'eri-toimipiste') return false

  let eroMin: number
  if (a.startTimeApprox || b.startTimeApprox) {
    eroMin = 0
  } else {
    eroMin = Math.abs(new Date(a.startTime).getTime() - new Date(b.startTime).getTime()) / 60_000
    if (!Number.isFinite(eroMin)) return false
    // Otsikkoon kirjoitettu kellonaika ("… 29.11.2026 klo 16:00") täsmää toisen
    // aikaan → skraperin oletusaika ei erota samaa esitystä.
    const pitempi = ta.length >= tb.length ? a : b
    const toinen = pitempi === a ? b : a
    const kloOtsikosta = irrotaOtsikonAika(pitempi.title).klo
    if (kloOtsikosta && kloOtsikosta === helsinkiKlo(toinen.startTime)) eroMin = 0
  }

  if (suhde === 'sama') return eroMin <= SAMA_ESITYS_RAJAT.samaPaikkaMin
  const m = etaisyysM(a.location, b.location)
  return m !== null && m <= SAMA_ESITYS_RAJAT.lahellaM && eroMin <= SAMA_ESITYS_RAJAT.lahellaMin
}
