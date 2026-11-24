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
import { nightlifeScore, COMMUNITY_DAYTIME_REGEX } from './nightlife'
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

/** Musiikkiopistojen oppilasesitykset (omistaja 24.11.2026: "Pohjois-Helsingin
 *  musiikkiopiston oppilaskonsertti" Malmin kirjastossa oli illan nostojen
 *  ensimmäinen). Ne kantavat LinkedEventsissä luokkaa 'konsertit' ja sanaa
 *  "konsertti", joten ne saivat saman portin ja samat pisteet kuin oikea
 *  keikka. Kategorialistoissa ne näkyvät yhä — vain nostoista pois.
 *  Konservatorion opiskelijabändit klubilla (PJK Klubi @ Bar Loose) eivät osu:
 *  ne ovat aikuisten keikkoja. */
export const OPPILASESITYS_REGEX = /oppilaskonsert|oppilasilta|oppilasesity|oppilaiden (?:konsert|esity|joulu|kevät)|musiikkiopisto|lauluopiskelij|soitto-oppila|tutkintokonsert/i
export const onOppilasesitys = (e: Event): boolean => OPPILASESITYS_REGEX.test(`${e.title} ${e.shortDescription ?? ''}`)

/** Kaikille kaistoille yhteiset vetot. */
function lapaiseePohjan(e: Event, vaadiKuva: boolean): boolean {
  if (isOutsideTargetAudience(e)) return false
  if (vaadiKuva && !e.image) return false
  if (!iltakello(e)) return false
  if (onPeruttu(e)) return false
  if (onOppilasesitys(e)) return false
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
/** Kaupungin isot keikkapaikat (omistaja 23.9.2026: "tällaiset isot keikat
 *  pitäisi näkyä ensimmäisinä"). Sovelluksella ei ole muuta signaalia siitä,
 *  että Karri Koira Altaalla on isompi juttu kuin tuntematon bändi klubilla —
 *  keikkapisteet ovat samat. Tämä on TOIMITUKSELLINEN lista, ei data: pidä
 *  se lyhyenä ja vain paikkoina joissa ei järjestetä pieniä iltoja. */
export const SUURET_PAIKAT = [
  'allas sea pool', 'allas live', 'allas pool',
  'veikkaus arena', 'helsingin jäähalli', 'jäähalli', 'olympiastadion', 'bolt arena',
  'suvilahti', 'kaisaniemen puisto', 'kulttuuritalo',
]
export function onSuuriPaikka(e: Event): boolean {
  const n = (e.location?.name ?? '').toLowerCase()
  return !!n && SUURET_PAIKAT.some((p) => n.includes(p))
}

// ── Vaihtelu nostoissa (omistaja 18.11.2026) ─────────────────────────────────
// "urheilu ja standup voisi nousta discon ohi. mutta niiden pitää olla iso
// urheilutapahtuma tai isohko standup" + "älä poista keikkoja ja korvaa niitä,
// discot voi korvata ennemmin. keikat ovat tärkeitä".
//
// Mitattu 30 vrk (19.11.–18.12.2026, tuotantodata) ennen muutosta: 15 klubi-
// iltaa 150 nostosta, sama paikka kahdesti samana iltana 4 kertaa (Bar Loosen
// keikka + Loosen disco), iso stand up vain 1 kerran. Syy: paikkojen omat
// lähteet merkitsevät klubi-illankin "Keikka"-kategorialla, joten Loosen
// Jytädisko saa saman 7 pisteen kuin Juha Tapio, ja tasapisteissä myöhempi
// alkuaika voittaa. Muutoksen jälkeen samalla datalla (paikkaporras, klubit
// hätävarana, tarkka aika ennen arvioitua, iso stand up korvaa vain muun kuin
// keikan, käsin nostot): keikkoja 92 → 112, klubeja 15 → 0, sama paikka
// kahdesti 0. Muuttui 21 päivää 30:stä. Pudonneet keikat olivat portaan 4
// kirkko- ja kirjastokonsertteja ja pubijameja sekä portaan 3 keikkoja isojen
// salien tieltä (Miika Leivo Semifinalissa → Vesta x UMO Finlandia-talossa).

/** Isot salit stand upille ja urheilulle. TOIMITUKSELLINEN lista kuten
 *  SUURET_PAIKAT: vain salit, joihin pieni ilta ei mahdu. Iso nimi isossa
 *  salissa (Hedberg Finlandia-talossa, Iikka Kivi Arena-näyttämöllä) on
 *  "isohko stand up"; baarin stand up -klubi-ilta ei ole. */
export const ISOT_SALIT = [
  'savoy-teatteri', 'aleksanterin teatteri', 'peacock', 'kaupunginteatteri', 'kansallisteatteri',
  'finlandia-talo', 'kulttuuritalo', 'musiikkitalo', 'tavastia', 'circus', 'veturitallit',
]
export function onIsoSali(e: Event): boolean {
  const n = (e.location?.name ?? '').toLowerCase()
  return !!n && ISOT_SALIT.some((p) => n.includes(p))
}

/** Stand up = sana stand up / comedy otsikossa tai kategoriassa. EI vibes-
 *  luokan 'standup', koska se syntyy myös näytelmäluokasta "komediat":
 *  Lahtisen ja Nordmanin näytelmä Kotijoukot olisi noussut 8 iltana. */
export const STANDUP_REGEX = /stand[\s-]?up|standup|comedy/i
export const onStandup = (e: Event): boolean => STANDUP_REGEX.test(`${e.title} ${e.categories.join(' ')}`)

export const onIsoStandupTaiUrheilu = (e: Event): boolean =>
  onIsoSali(e) && (onStandup(e) || getEventVibes(e).includes('urheilu'))

/** Klubi-ilta: lähteen oma Klubi/DJ-kategoria tai otsikon klubisana. Pelkkä
 *  "club"/"klubi" otsikossa EI riitä: Club For Five on lauluyhtye, HKO:n
 *  Kohtaamisia-klubi UMO:n konsertti, Tired Uncle's Comedy Club stand up.
 *  Iso paikka ei ole klubi-ilta: "Disco Night: Baccara & Afric Simone"
 *  Kulttuuritalossa on konsertti, eikä se saa viedä klubikiintiötä. */
export const KLUBI_OTSIKKO = /disko|disco(?!rd|very)|(?<![a-zåäö])djs?(?![a-zåäö])|party|bileet|fiesta|(?<![a-zåäö])rave(?![a-zåäö])|club night|clubbing/i
/** Pelkät yökerhot: kaikki niiden tapahtumat ovat klubi-iltoja, vaikka lähde
 *  merkitsisi ne keikoiksi ("K40-CLUB X-MAS FEST@ Maxine" tuli [Musiikki,
 *  Keikka] ja nousi 12.12.2026 nostoihin). */
export const KLUBIPAIKAT = ['maxine']
/** Lähteen Klubi/DJ-luokka ei tee keikasta klubi-iltaa, jos sama lähde kertoo
 *  myös keikan (omistaja 24.11.2026: "PJK Klubi: Backrooms, Soft Guys, Visio"
 *  @ Bar Loose, kolme bändiä, tuli luokilla [Keikka, DJ, Klubi] ja putosi
 *  nostoista klubina). Otsikon klubisana ja yökerhopaikka ratkaisevat yhä. */
const KEIKKALUOKKA = /^(keikka|keikat|keikat ja konsertit|konsertti|konsertit)$/i
export const onKlubi = (e: Event): boolean => !onSuuriPaikka(e) &&
  (KLUBI_OTSIKKO.test(e.title) ||
    (e.categories.some((c) => /^(klubi|dj)$/i.test(c.trim())) && !e.categories.some((c) => KEIKKALUOKKA.test(c.trim()))) ||
    KLUBIPAIKAT.some((p) => (e.location?.name ?? '').toLowerCase().includes(p)))

/** Keikka, jota vaihtelusäännöt eivät koskaan pudota.
 *  Ääniwalli on luokittelussa (lib/event-classify VENUE_RULES) yöelämää, joten
 *  sen keikat ("Olga – #Yolo Club Tour" 19.11.2026) eivät saaneet keikka-
 *  luokkaa eivätkä paikkaporrasta. Sen muut kuin klubi-illat ovat keikkoja. */
const KEIKKAPAIKAT_YOELAMALUOKALLA = ['ääniwalli']
export const onKeikka = (e: Event): boolean => !onKlubi(e) &&
  (getEventVibes(e).includes('keikka') || KEIKKAPAIKAT_YOELAMALUOKALLA.some((p) => (e.location?.name ?? '').toLowerCase().includes(p)))

/** Klubi-iltoja enintään näin monta viidestä nostosta. */
export const MAX_KLUBIT = 2

/** Isot näyttämöt "vähintään yksi muu" -paikalle, kun isoa stand upia tai
 *  urheilua ei ole (omistaja 18.11.2026: Kotijoukot Arena-näyttämöllä). */
export const ISOT_ESITYSSALIT = ['aleksanterin teatteri', 'kaupunginteatteri', 'kansallisteatteri', 'peacock']

// ── Poimintajärjestys — sama ideologia joka listalle ─────────────────────────
// Etusivun "Parhaat poiminnat" järjesti korttinsa näin jo 25.8. alkaen, mutta
// kategoria- ja kaupunginosalistat olivat aikajärjestyksessä (kori ensin).
// Omistaja 24.9.2026 Kallion listasta, jonka kärjessä oli klo 12.30
// ompelupaja, tuolijumppa ja nuorten työnhakupaja: "nostetaan jokaiseen
// kategoriaan samalla ideologialla kuin etusivun parhaat poiminnat". Yksi
// pistefunktio + yksi vertailija, jotta pinnat eivät ajaudu erilleen.
//
// Pisteet ovat JÄRJESTYSAVAIN, eivät portti: kategoria näyttää yhä kaikki
// tapahtumansa (lib/audience pudottaa kohderyhmän ulkopuoliset vain
// suosituksista). Kohderyhmän kakkoskori (isPrimaryPick=false) tulee aina
// ykköskorin jälkeen; korien sisällä pisteet; tasapisteillä aikajärjestys.
export function poimintaPisteet(e: Event): number {
  const vibes = getEventVibes(e)
  let s = 0
  if (e.image) s += 6                                                     // kuvalliset kärkeen
  if (e.source === 'festivals' || vibes.includes('festivaali')) s += 5    // festarit
  if (vibes.includes('keikka')) s += 4                                    // keikat
  if (onSuuriPaikka(e)) s += 3                                            // isot keikkapaikat
  if (vibes.includes('yoelama') || vibes.includes('underground')) s += 3  // klubit / underground
  if (vibes.includes('teatteri') || vibes.includes('taide') || vibes.includes('standup')) s += 2
  if (vibes.includes('urheilu')) s += 2
  if (e.isFree) s += 1
  if ((e.shortDescription || e.description || '').length > 60) s += 1
  if (onVisa(e)) s -= 8                                                   // pubivisat alas
  // Yhteisötalojen/leikkipuistojen päiväohjelma: kuvapankkikuva antoi +6 ja
  // ne valtasivat poiminnat (mitattu 24.8.) — sakko syö kuvaedun.
  if (COMMUNITY_DAYTIME_REGEX.test(`${e.title} ${e.shortDescription ?? ''} ${e.categories.join(' ')}`)) s -= 6
  // Helsinki-tunti, EI katsojan laitteen vyöhyke (/en-yleisö on matkailijoita).
  if (helsinkiHourOf(e.startTime) >= 17) s += 2
  return s
}

/** Kolme koria: ykköskori (kulttuuri, keikat, festarit) → kakkoskori
 *  (kierrokset, kirjastoillat) → kohderyhmän ulkopuoliset (leikkipuistot,
 *  seniorikeskukset). Kolmas kori on se, jonka etusivun poiminnat PUDOTTAVAT
 *  kokonaan (isOutsideTargetAudience); kategoria näyttää sen, mutta viimeisenä
 *  (mitattu 24.9.2026: ilman koria "Musiikkituokio @ Leikkipuisto Brahe" oli
 *  Kallion listan 5. rivi, koska ohuena päivänä sakko ei riittänyt). */
function kori(e: Event): number {
  if (isOutsideTargetAudience(e)) return 2
  return isPrimaryPick(e) ? 0 : 1
}

export function poimintaJarjestys(a: Event, b: Event): number {
  return kori(a) - kori(b) ||
    poimintaPisteet(b) - poimintaPisteet(a) ||
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
}

// ── Paikkaporras (omistaja 18.11.2026) ───────────────────────────────────────
// Pisteet eivät erota keikkoja toisistaan: kaikki keikat saavat 7, ja ennen
// tätä tasapelin ratkaisi myöhempi alkuaika ja lopulta datan järjestys —
// 19.11.2026 Semifinalin Miika Leivo voitti Finlandia-talon Vesta x UMO:n,
// koska oli datassa kaksi riviä aiemmin. Sovelluksella ei ole kapasiteetti-,
// myynti- eikä suosiotietoa, joten keikan kokoa arvioidaan paikan koosta.
// Omistajan jako: "Tavastia, On the Rocks, G Livelab, Ääniwalli nämä isojen
// paikkojen jälkeen", "Semifinal, Bar Loose, Mummotunneli, Lepakkomies, Post
// Bar, Storyville ... hieman alempana", Musiikkitalo porras 3 (kevyen musiikin
// vierailijat nostetaan käsin, data/tapahtumakorjaukset.json illanNosto).
// TOIMITUKSELLINEN lista kuten SUURET_PAIKAT. Nimet tarkistettu tuotantodatan
// kirjoitusasuista 18.11.2026 ("Finlandia-talo" eikä pelkkä "finlandia", joka
// osuisi Eckerö Linen M/S Finlandiaan).
// Porras 2 on jaettu (omistaja 18.11.2026, lauantain Iikka Kivi On the Rocksin
// keikan tilalle): 2a isot salit ennen 2b isoja klubeja. Ilman jakoa saman
// portaan sisällä ratkaisi myöhempi alkuaika, ja vähintään yksi muu -sääntö
// olisi pudottanut Savoyn konsertin klubikeikan sijaan.
export const PORRAS_2A = ['tavastia', 'finlandia-talo', 'finlandia hall', 'savoy', 'aleksanterin teatteri', 'circus']
export const PORRAS_2B = ['on the rocks', 'g livelab', 'ääniwalli', 'korjaamo', 'tiivistämö']
export const PORRAS_3 = [
  'semifinal', 'bar loose', 'mummotunneli', 'lepakkomies', 'post bar', 'storyville',
  'musiikkitalo', 'kuudes linja', 'juttutupa', 'apollo live', 'dubrovnik',
]
const nimiSisaltaa = (e: Event, lista: readonly string[]) => {
  const n = (e.location?.name ?? '').toLowerCase()
  return !!n && lista.some((p) => n.includes(p))
}

/** 1 = iso paikka, 2 = iso sali (2a), 2.5 = iso klubi (2b), 3 = pienempi
 *  keikkapaikka, 4 = muu.
 *
 *  Porras 2–3 koskee VAIN keikkoja (ei klubi-iltoja): muuten Kansallisteatterin ja Kaupunginteatterin näytelmät
 *  nousisivat joka ilta, ja isossa salissa oleva stand up ohittaisi pienemmän
 *  paikan keikan ("älä poista keikkoja"). Stand up nousee isossa salissa
 *  omalla säännöllään (onIsoStandupTaiUrheilu), joka korvaa vain muun kuin
 *  keikan. Nimetyt keikkapaikat tarkistetaan ENNEN isoja paikkoja:
 *  "Tiivistämö, Suvilahti" osuisi muuten SUURET_PAIKAT-listan Suvilahteen. */
export function paikkaporras(e: Event): 1 | 2 | 2.5 | 3 | 4 {
  const keikka = onKeikka(e)
  if (keikka && nimiSisaltaa(e, PORRAS_2A)) return 2
  if (keikka && nimiSisaltaa(e, PORRAS_2B)) return 2.5
  if (keikka && nimiSisaltaa(e, PORRAS_3)) return 3
  if (onSuuriPaikka(e)) return 1
  // Kuratoidun festivals-taulun MUSIIKKIfestivaali ("Väreet", paikka "Useita
  // paikkoja") on iso keikkatapahtuma. Muut taulun rivit (Tuomaan Markkinat
  // klo 11, Slush) EIVÄT saa porrasta: ne nousivat simulaatiossa joka päivälle.
  if (e.source === 'festivals' && keikka) return 2
  return 4
}

export function heroJarjestys(a: Event, b: Event): number {
  return paikkaporras(a) - paikkaporras(b) ||
    nightlifeScore(b) - nightlifeScore(a) ||
    // Tasapisteissä tarkka kellonaika ennen arvioitua (omistaja 18.11.2026:
    // Semifinalin "Miika Leivo & Band" ilman tiedettyä alkamisaikaa nousi
    // nostoksi). Arvioitu aika = paikan sivu ei kertonut kelloa; kortti ja
    // somevideo näyttävät silloin vähemmän tietoa.
    Number(!!a.startTimeApprox) - Number(!!b.startTimeApprox) ||
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
}

/** Hero-/pushinostot: kaista A ensin, sitten B, ja vasta viimeisenä keinona
 *  kuvattomat. Palautus vahvin ensin (ks. funktion loppu).
 *
 *  KUVATON VIIMEINEN KEINO: HeroSwiper piirtää kuvattomalle nostolle
 *  gradienttitaustan, joten se on visuaalisesti tuettu. Ilman tätä hero jäisi
 *  mitatusti TYHJÄKSI kahtena päivänä 31:stä — etusivun ylin kortti ei saa
 *  kadota. */
export function valitseHero(events: Event[], n = 5, vaadiKuva = true): Event[] {
  // Omistajan käsin poistamat (tapahtumakorjaukset eiIllanNostoihin) eivät
  // ole ehdokkaita millään säännöllä.
  events = events.filter((e) => !e.eiIllanNostoihin)
  // `out` on valintajärjestyksessä (vahvin ensin); lopuksi järjestetään vielä
  // heroJarjestyksellä, koska korvaukset sijoittuvat korvatun paikalle.
  const out: Event[] = []
  const paikka = (e: Event) => (e.location?.name ?? '').toLowerCase().trim()
  const samaPaikka = (e: Event) => { const p = paikka(e); return p ? out.findIndex((o) => paikka(o) === p) : -1 }

  // KÄSIN NOSTETUT ENSIN (data/tapahtumakorjaukset.json illanNosto: true).
  // Omistajan valinta ohittaa kaistat, pisteet ja klubisäännön; peruttu ei
  // nouse silti. Saman paikan raja pätee näihinkin.
  for (const e of events.filter((x) => x.illanNosto && !onPeruttu(x)).sort(heroJarjestys)) {
    if (out.length >= n) break
    if (out.some((p) => p.id === e.id) || samaPaikka(e) >= 0) continue
    out.push(e)
  }

  // VAIHTELURAJAT: sama paikka kerran (aina), klubeja enintään MAX_KLUBIT
  // (klubiraja = true). Saman paikan keikka voittaa saman paikan klubin myös
  // silloin, kun klubi ehti valituksi ensin (klo 23.30 disco on myöhempi,
  // joten se tulee järjestyksessä ennen klo 20.30 keikkaa).
  const lisaa = (ehdokkaat: Event[], klubiraja: boolean) => {
    for (const e of karsiTapahtumaSarjat([...ehdokkaat].sort(heroJarjestys))) {
      if (out.some((p) => p.id === e.id)) continue
      const j = samaPaikka(e)
      if (j >= 0) {
        if (onKeikka(e) && onKlubi(out[j])) out[j] = e
        continue
      }
      if (out.length >= n) continue
      if (klubiraja && onKlubi(e) && out.filter(onKlubi).length >= MAX_KLUBIT) continue
      out.push(e)
    }
  }
  const A = events.filter((e) => kaistaA(e, vaadiKuva))
  const B = events.filter((e) => kaistaB(e, vaadiKuva))
  const C = vaadiKuva ? events.filter((e) => !e.image && (kaistaA(e, false) || kaistaB(e, false))) : []
  // KLUBI-ILLAT VAIN HÄTÄVARAKSI (omistaja 18.11.2026: "ehkä näitä myöhäis
  // illan klubeja ei tarvitse olla näissä. tuo maxine on turha"): ensin kaikki
  // muut kaistoittain, klubit vasta jos kortti jäisi muuten vajaaksi.
  const eiKlubi = (l: Event[]) => l.filter((e) => !onKlubi(e))
  lisaa(eiKlubi(A), true)
  if (out.length < n) lisaa(eiKlubi(B), true)
  if (out.length < n) lisaa(eiKlubi(C), true)
  if (out.length < n) lisaa([...A, ...B, ...C], true)
  // Ohut ilta: klubiraja ei saa jättää korttia vajaaksi. Saman paikan raja
  // pysyy, jottei keikan korvaama saman paikan disco palaa takaisin.
  if (out.length < n) lisaa([...A, ...B, ...C], false)

  // ISO STAND UP / URHEILU ISOSSA SALISSA tulee nostoihin VAIN korvaamalla
  // klubin, tai jos klubia ei ole, muun kuin keikan. Keikkaa, festivaalia,
  // isoa paikkaa tai toista isoa salia se ei korvaa koskaan.
  const suojattu = (e: Event) => onKeikka(e) || onSuuriPaikka(e) || onIsoStandupTaiUrheilu(e) || nightlifeScore(e) >= 8
  const korvattava = () => {
    for (let i = out.length - 1; i >= 0; i--) if (onKlubi(out[i]) && !suojattu(out[i])) return i
    for (let i = out.length - 1; i >= 0; i--) if (!suojattu(out[i])) return i
    return -1
  }
  const isot = karsiTapahtumaSarjat([...A, ...B].filter(onIsoStandupTaiUrheilu).sort(heroJarjestys))
  for (const e of isot) {
    if (out.some((p) => p.id === e.id) || samaPaikka(e) >= 0) continue
    if (out.length < n) { out.push(e); continue }
    const i = korvattava()
    if (i < 0) break
    out[i] = e
  }

  // VÄHINTÄÄN YKSI MUU KUIN KEIKKA (omistaja 18.11.2026: "5 herokortissa ei
  // saa olla 5 keikkaa. yksi pitää vähintään olla jotain muuta"). Muuksi
  // kelpaa vain iso: stand up tai urheilu isossa salissa tai isolla paikalla,
  // ja vasta niiden puuttuessa esitys isolla näyttämöllä. Heikompi muu ei saa
  // pudottaa hyvää keikkaa — jos iso muu puuttuu, kortti saa olla 5 keikkaa.
  // Korvattava on heikoin keikka (viimeinen valintajärjestyksessä), ei käsin
  // nostettu, ei iso paikka eikä festivaali.
  if (out.length >= n && out.every(onKeikka)) {
    const taso = (e: Event) =>
      onIsoStandupTaiUrheilu(e) || (onSuuriPaikka(e) && getEventVibes(e).includes('urheilu')) ? 2
        : getEventVibes(e).includes('teatteri') && nimiSisaltaa(e, ISOT_ESITYSSALIT) ? 1 : 0
    const muu = karsiTapahtumaSarjat([...A, ...B].filter((e) => !onKeikka(e) && !onKlubi(e) && !onPeruttu(e) && taso(e) > 0)
      .sort((a, b) => taso(b) - taso(a) || heroJarjestys(a, b)))
      .find((e) => !out.some((p) => p.id === e.id) && samaPaikka(e) < 0)
    if (muu) {
      for (let i = out.length - 1; i >= 0; i--) {
        const p = out[i]
        if (p.illanNosto || onSuuriPaikka(p) || nightlifeScore(p) >= 8) continue
        out[i] = muu
        break
      }
    }
  }
  // VAHVIN ENSIN (omistaja 24.11.2026: "vahvin nosto ensimmäiseksi
  // herokorttiin, sen ei tarvi mennä aikajärjestyksessä"). Aiemmin palautus
  // oli aikajärjestyksessä, jolloin ohuena iltana heikoin valittu (klo 18
  // kirjastokonsertti) oli ensimmäinen kortti ja Savoyn konsertti kolmas.
  // Käsin nostetut ensin, sitten sama järjestys kuin valinnassa. Tämä on myös
  // iltapushin oletusnosto (ranked[0]) ja somevideon korttijärjestys.
  return out.sort((a, b) => Number(!!b.illanNosto) - Number(!!a.illanNosto) || heroJarjestys(a, b))
}
