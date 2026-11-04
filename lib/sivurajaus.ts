// Koosteen sivurajaus: jokainen rivi tasan yhdellä sivulla.
//
// Yli 10 päivän ikkuna (90 pv haku, päiväväli) palvellaan 10 päivän sivuina
// (app/api/events DAYS_PER_PAGE), ja selain liimaa sivut yhteen karsien vain
// saman id:n (hooks/useEvents applySort). Dedup — sama otsikko + Helsinki-
// päivä ja sama esitys eri otsikolla (lib/sama-esitys) — ajetaan sivun
// sisällä, joten kahden lähteen sama tapahtuma yhdistyy vain, jos molemmat
// rivit ovat SAMALLA sivulla.
//
// Ennen 4.11.2026 ulkoiset lähteet (lähdevarasto) liitettiin koko väliltä
// sivulle 1 ja LinkedEvents päivä kerrallaan omalle sivulleen → sama keikka
// kahtena korttina heti, kun LinkedEvents-rivi oli sivulla ≥ 2 (Cory Henry
// Kulttuuritalolla 29.11.: MyHelsinki-kopio klo 18.00 sivulla 1, oikea
// LinkedEvents-rivi klo 20.00 sivulla 3). Mitattu tuotannosta 4.11.2026,
// 90 pv hakuikkuna: 7 518 korttia, joista 746 (10 %) tällaisia tuplia
// (Kaupunginteatteri 110, Stoa 61, Malmitalo 59, Musiikkitalo 39). Lisäksi
// LinkedEventsin monipäiväiset rivit toistuivat seuraavilla sivuilla
// (1 201 saman id:n toistoa, ja eri id samasta esityksestä 66 kertaa), koska
// sivun ainoa raja oli "alku ≥ sivun 1. päivä − 24 h".
//
// SÄÄNTÖ: sivu sisältää täsmälleen ne rivit, joiden Helsinki-alkupäivä osuu
// sivun päiviin — kaikista lähteistä. Ensimmäinen sivu ottaa myös aiemmin
// alkaneet (käynnissä oleva lyhyt tapahtuma; reitin päivärajaus päättää
// näytetäänkö se), viimeinen myös myöhemmin alkavat (lähteet rajataan väliin,
// joten niitä ei synny, mutta rivi ei saa kadota). Ulkoiset lähteet luetaan
// kullekin sivulle vain sen omalta väliltä.
//
// KARTAN KUUKAUSI-IKKUNA (kentat=kartta) EI käytä tätä: kartta lukee vain
// sivun 1 eikä selaa, joten sille ulkoiset liitetään edelleen koko väliltä
// sivulle 1 (ks. app/api/events). Puhtaita funktioita — testit
// scripts/test-categories.ts.

export interface SivunRajat {
  /** Sivun ensimmäinen ja viimeinen päivä (YYYY-MM-DD, Helsinki). */
  ensimmainen: string
  viimeinen: string
  ensimmainenSivu: boolean
  viimeinenSivu: boolean
}

/** Sivun rajat sen päivälistasta; null kun sivulla ei ole päiviä
 *  (pyydetty sivu on välin ulkopuolella). */
export function sivunRajat(paivat: readonly string[], ensimmainenSivu: boolean, viimeinenSivu: boolean): SivunRajat | null {
  if (paivat.length === 0) return null
  return { ensimmainen: paivat[0], viimeinen: paivat[paivat.length - 1], ensimmainenSivu, viimeinenSivu }
}

/** Kuuluuko tänä Helsinki-päivänä alkava rivi tälle sivulle. Päivät ovat
 *  YYYY-MM-DD-merkkijonoja, joten vertailu on leksikografinen. */
export function kuuluuSivulle(paiva: string, r: SivunRajat): boolean {
  if (paiva < r.ensimmainen) return r.ensimmainenSivu
  if (paiva > r.viimeinen) return r.viimeinenSivu
  return true
}

/** Väli, jolta ulkoiset lähteet luetaan tälle sivulle: ensimmäinen sivu
 *  pyynnön alusta (varasto ottaa mukaan myös käynnissä olevat), viimeinen
 *  pyynnön loppuun asti; muuten sivun omat päivät. */
export function ulkoistenVali(r: SivunRajat, start: string, end: string): { start: string; end: string } {
  return { start: r.ensimmainenSivu ? start : r.ensimmainen, end: r.viimeinenSivu ? end : r.viimeinen }
}
