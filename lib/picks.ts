// Suosituspintojen YKSI portti: etusivun hero ("✦ ILLAN NOSTOT") ja iltapushi.
//
// MIKSI TÄMÄ TIEDOSTO ON OLEMASSA (omistaja 9.9.2026: "tällainen harraste
// bänditapahtuma/äänitysperusteet tapahtuma kirjastossa ei saa nousta hero
// kortiksi. tämä on paha virhe"):
//
// Hero päästi tapahtuman sisään AVAINSANAPISTEELLÄ — nightlifeScore >= 3 —
// ja toisti porttinsa käsin komponentissa. Keskustakirjasto Oodin ilmainen
// äänitysopastus "Äänityksen perusteet Bändi- ja laulustudiossa"
// (helsinki:agqd2johpi) sai 7 pistettä, koska keikkaporras /…|bändi|…/ osui
// STUDION nimeen. Niin kauan kuin sisäänpääsy on avainsanan varassa, jokainen
// uusi yhdyssana-ansa on hero-bugi — ja niitä on löytynyt jo neljä kertaa
// (bluesperheenä, käsityökerho, barbaarirannikon, nyt bändi- ja laulustudio).
//
// Mitattu 9.9.2026, 4208 tuotantotapahtumaa / 31 Helsinki-vrk:
//   ENNEN: 126/155 nostoa, 13 (10,3 %) niistä kohderyhmän kakkoskoria
//          (kirjaston äänitysopastus, Raamatuklubi-lukupiiri, BabyKino klo 13,
//          Pöytälaatikko-klubi), hero TYHJÄ 2 päivänä (14.9. ja 5.10.).
//   JÄLKEEN: nostot ylös, kakkoskorivuodot pois, ei tyhjiä päiviä.
// Luvut ja niiden mittauskomento: ks. scripts/test-categories.ts osio 17c.
//
// Sama portti myös iltapushille (app/api/cron/evening-push): pushi sovelsi
// ENNEN tätä VÄHEMMÄN portteja kuin hero — pelkän nightlifeScore >= 3:n, eli
// ei kohderyhmärajausta, ei sarjakarsintaa, ei visa- eikä peruutusvetoa.
import { Event } from './types'
import { isOutsideTargetAudience, isPrimaryPick, onOsallistumisformaatti } from './audience'
import { getEventVibes, ohjelmatyyppi } from './event-classify'
import { nightlifeScore } from './nightlife'
import { karsiTapahtumaSarjat } from './tapahtumaperhe'
import { helsinkiHourOf } from './helsinki-time'

/** Tietovisat. 438 riviä korpuksessa ja niistä kuvallisia vain 10 — vanhaa
 *  heroa suojasi siis PELKKÄ kuvattomuus. Jos lähde alkaa antaa visoille
 *  kuvat, ne täyttäisivät nostot samalla formaatilla. */
export const QUIZ_REGEX = /tietovisa|pubivisa|musavisa|\bvisa\b|tietokilpailu|quiz/i
export const onVisa = (e: Event): boolean => QUIZ_REGEX.test(`${e.title} ${e.categories.join(' ')}`)

/** Peruttu tapahtuma. Repossa ei ollut yhtään peruutustarkistusta suositus-
 *  poluilla. Mitattu korpuksesta: 5 riviä, kaikki aitoja peruutuksia, ja
 *  löysempi kuvio (/perut|cancel|inhiber/) ei löydä yhtään lisää. Mukana
 *  mm. "Peruttu: Glen Hansard" ja "Kvadrat / Neliö – EVENT CANCELLED", jotka
 *  läpäisivät vanhan hero-portin (kuva + ilta + keikkapisteet). */
export const PERUTTU_REGEX = /\bperuttu\b|\bperuutettu\b|\bcancelled\b|\bcanceled\b|\binhiberad\b/i
export const onPeruttu = (e: Event): boolean => PERUTTU_REGEX.test(`${e.title} ${e.shortDescription ?? ''}`)

/** Iltamenon tunnelmat. Kakkoskaistan (ykköskori) lisäehto. */
export const HERO_VIBES: readonly string[] = [
  'keikka', 'yoelama', 'underground', 'standup', 'teatteri', 'urheilu', 'festivaali',
]

/** Ilta alkaa klo 15 HELSINKI-aikaa. Kuratoidun festivals-taulun päivärivit
 *  ovat kokopäiväisiä (Design Week klo 10, Circus Festival klo 12) ja saavat
 *  olla päivälläkin.
 *
 *  Vanha portti antoi saman vapautuksen KAIKILLE 8 pisteen tapahtumille, ja
 *  koska /festival/ osuu myös yksittäisen näytöksen otsikkoon, "ILLAN
 *  NOSTOIHIN" nousi mm. "Karhupuisto Film Festival presents - BabyKino"
 *  klo 13 ja "Lakritsi- & Salmiakkifestivaali" klo 7. */
export function iltakello(e: Event): boolean {
  return e.source === 'festivals' || helsinkiHourOf(e.startTime) >= 15
}

/** Kaikille kaistoille yhteiset vetot. */
function lapaiseePohjan(e: Event, vaadiKuva: boolean): boolean {
  if (isOutsideTargetAudience(e)) return false
  if (vaadiKuva && !e.image) return false
  if (!iltakello(e)) return false
  if (onPeruttu(e)) return false
  if (onOsallistumisformaatti(e)) return false
  if (onVisa(e)) return false
  return true
}

/** KAISTA A: lähde kertoo ohjelmatyypin (yso-koodi, yksikäyttöinen paikka tai
 *  täsmällinen kategorianimi). Tämä on portin ydin: rakenteinen signaali ei
 *  voi osua yhdyssanan sisään.
 *
 *  Kaista pitää kirjaston AIDOT konsertit mukana — "TANGO, TAIPUISA TANGO!
 *  -konsertti" ja "Rautakoura & Paula Wolski" Paloheinän kirjastossa
 *  kantavat kategoriaa 'konsertit'. Ne katoaisivat, jos hero vaatisi pelkän
 *  isPrimaryPickin (jonka kirjastosääntö pudottaa koko paikkatyypin). */
export const kaistaA = (e: Event, vaadiKuva = true): boolean =>
  lapaiseePohjan(e, vaadiKuva) && ohjelmatyyppi(e).length > 0

/** KAISTA B: lähde ei kerro tyyppiä, mutta tapahtuma on poimintojen
 *  ykköskoria (lib/audience isPrimaryPick) ja sillä on iltamenon tunnelma.
 *  Tällä kaistalla isPrimaryPickin kirjastosääntö estää harrasteohjelman
 *  (omistajan linjaus 4.9.2026: "Ukulelejamit ei ole niin hyvä tapahtuma
 *  että se nousee oikeiden keikkojen edelle"). */
export const kaistaB = (e: Event, vaadiKuva = true): boolean =>
  lapaiseePohjan(e, vaadiKuva) && ohjelmatyyppi(e).length === 0 &&
  isPrimaryPick(e) && getEventVibes(e).some((v) => HERO_VIBES.includes(v))

/** Järjestys nostojen SISÄLLÄ: paras iltasignaali ensin, tasapelissä
 *  myöhempi alkuaika (klo 21 keikka on illan nosto ennen klo 15 esitystä).
 *  Tässä nightlifeScore on oikeassa roolissaan — lajitteluavaimena. */
export function heroJarjestys(a: Event, b: Event): number {
  return nightlifeScore(b) - nightlifeScore(a) ||
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
}

/** Hero-/pushinostot: kaista A ensin, sitten B, ja vasta viimeisenä keinona
 *  kuvattomat. Palautus aikajärjestyksessä (näytöllä ilta kulkee eteenpäin).
 *
 *  KUVATON VIIMEINEN KEINO: HeroSwiper piirtää kuvattomalle nostolle
 *  gradienttitaustan, joten se on visuaalisesti tuettu. Ilman tätä hero jäisi
 *  mitatusti TYHJÄKSI kahtena päivänä 31:stä — etusivun ylin kortti ei saa
 *  kadota. */
export function valitseHero(events: Event[], n = 5, vaadiKuva = true): Event[] {
  const out: Event[] = []
  const lisaa = (ehdokkaat: Event[]) => {
    for (const e of karsiTapahtumaSarjat([...ehdokkaat].sort(heroJarjestys))) {
      if (out.length >= n) break
      if (!out.some((p) => p.id === e.id)) out.push(e)
    }
  }
  lisaa(events.filter((e) => kaistaA(e, vaadiKuva)))
  if (out.length < n) lisaa(events.filter((e) => kaistaB(e, vaadiKuva)))
  if (out.length < n && vaadiKuva) {
    lisaa(events.filter((e) => !e.image && (kaistaA(e, false) || kaistaB(e, false))))
  }
  return out.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
}
