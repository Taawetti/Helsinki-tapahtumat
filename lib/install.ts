// Sovelluksen asennus (PWA) — jaettu logiikka.
//
// MIKSI JAETTU. Sama beforeinstallprompt-tapahtuma tarvitaan kahdessa
// paikassa: kelluvassa asennusbannerissa ja latausivulla. Tapahtuma laukeaa
// VAIN KERRAN sivulatausta kohden, joten jos molemmat kuuntelisivat sitä
// erikseen, vain toinen saisi sen kiinni ja toisen painike jäisi kuolleeksi.
// Siksi tapahtuma otetaan talteen moduulitasolla heti kun tämä tiedosto
// ladataan, ja molemmat lukevat samaa talletettua arvoa.

import { track } from './track'

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let saved: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // preventDefault estää selaimen oman kehotteen, jotta se voidaan näyttää
    // vasta kun käyttäjä painaa meidän painikettamme.
    e.preventDefault()
    saved = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    saved = null
    listeners.forEach((l) => l())
  })
}

export function subscribeInstall(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => { listeners.delete(onChange) }
}

/** null = selain ei tarjoa ohjelmallista asennusta (esim. iOS Safari, jossa
 *  asennus tehdään aina jakovalikon kautta). */
export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return saved
}

export function getInstallPromptServer(): BeforeInstallPromptEvent | null {
  return null
}

/** Näyttää selaimen asennuskehotteen ja kirjaa tuloksen — YKSI paikka
 *  bannerille, yläpalkin napille, ⋯-valikon levylle ja latausivulle.
 *
 *  Tapahtuman prompt() saa kutsua vain KERRAN: toinen kutsu samalle
 *  tapahtumalle hylätään. Aiemmin käytetty tapahtuma jäi talteen, joten kun
 *  käyttäjä oli hylännyt bannerin kehotteen ja painoi sitten ⋯-valikon
 *  "Lataa sovellus", kutsu hylättiin hiljaa eikä mitään tapahtunut (todettu
 *  koodista 4.10.2026). Nyt tapahtuma tyhjennetään heti käytön jälkeen ja
 *  kuuntelijoille ilmoitetaan → napit putoavat ohjeisiin, kunnes selain
 *  antaa uuden tapahtuman. null = kehotetta ei ollut (tai se oli jo käytetty). */
export async function naytaAsennuskehote(surface: string): Promise<'accepted' | 'dismissed' | null> {
  const e = saved
  if (!e) return null
  // Tyhjennys ENNEN odotusta: kaksi nopeaa painallusta ei kutsu samaa
  // tapahtumaa kahdesti.
  saved = null
  listeners.forEach((l) => l())
  try {
    await e.prompt()
    const { outcome } = await e.userChoice
    if (outcome === 'accepted') {
      // Merkintä estää saman asennuksen kirjautumisen toiseen kertaan
      // kun sovellus käynnistetään ensimmäisen kerran kotivalikosta.
      merkitseAsennusKirjatuksi()
      track('install', { surface })
    }
    return outcome
  } catch {
    // Jo käytetty tai selaimen estämä kehote: kutsuja näyttää ohjeet.
    return null
  }
}

export type AsennusMuoto = 'native' | 'ios' | 'android' | 'inapp' | 'desktop'

/** Mikä sisältö asennuslevylle/bannerille: selaimen kehote jos sellainen on,
 *  muuten laitteen ohjeet; sovelluksen sisäisessä selaimessa asennus ei ole
 *  mahdollista lainkaan. Puhdas funktio testejä varten. */
export function asennusMuoto(kehote: boolean, sisainenSelain: boolean, alusta: Platform): AsennusMuoto {
  if (kehote) return 'native'
  if (sisainenSelain) return 'inapp'
  return alusta
}

/** Onko sovellus jo asennettu ja avattu omana sovelluksenaan.
 *  standalone-tarkistus kattaa Androidin ja työpöydän; navigator.standalone on
 *  iOS Safarin oma, vanhempi tapa kertoa sama asia. */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export type Platform = 'ios' | 'android' | 'desktop'

/** Karkea laitetunnistus vain OHJEIDEN valintaan — ei mitään toiminnallista
 *  riipu tästä, joten väärä arvaus ei riko mitään. Käyttäjä näkee silti
 *  kaikkien laitteiden ohjeet, tämä vain avaa oikean ensin. */
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  // iPadOS esiintyy Macintoshina; kosketuspisteet erottavat sen.
  const iPadOS = /Macintosh/.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/** Sovelluksen sisäinen selain (WhatsApp, Instagram, Facebook, Telegram…).
 *  Näissä PWA-asennus EI ole mahdollista lainkaan — ainoa toimiva neuvo on
 *  avata sivu oikeassa selaimessa. Tunnistus on tarkoituksella suppea:
 *  tunnistamatta jäänyt sisäinen selain saa iOS-/latausohjeet, mikä on
 *  vaaraton lopputulos. ('wv' on Androidin WebView-merkintä.) */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|TikTok|; wv\)/i.test(ua)
}

// ── Asennuksen kirjaus ────────────────────────────────────────────────────
// Apple EI tarjoa asennus-APIa: iPhonella ei tule beforeinstallprompt- eikä
// appinstalled-tapahtumaa, joten sitä HETKEÄ jolloin sivu lisätään
// kotivalikkoon ei voi havaita millään tavalla. Mitattu 13.9.2026 (omistajan
// kaveri asensi sovelluksen iPhonelle eikä luku noussut): kannan 9
// asennusrivistä KAIKKI olivat Chromiumin kehotteesta (banner 8, header 1)
// eikä yhtäkään iPhonelta — mittari ei ollut rikki, se oli sokea.
//
// Ainoa havaittava jälki iOS-asennuksesta on KÄYNNISTYS: standalone-tilassa
// avattu sivu on avattu kotivalikon kuvakkeesta (isInstalled tunnisti tämän
// jo, mutta tietoa käytettiin vain bannerin piilottamiseen). Kirjataan kerran
// laitetta kohden, jotta luku pysyy asennusten lukuna eikä muutu avausten
// luvuksi.
//
// HUOM kaksi tietoista rajoitusta:
//  - iPhone-asennus näkyy vasta kun sovellus AVATAAN kotivalikosta
//  - selainmuistin tyhjennys tai uudelleenasennus voi tuottaa saman laitteen
//    uudestaan; luku on "asennuksia" eikä "asentaneita laitteita"
const KIRJATTU_AVAIN = 'install-counted-v1'

export function asennusJoKirjattu(): boolean {
  try { return localStorage.getItem(KIRJATTU_AVAIN) === '1' } catch { return false }
}

/** Merkitään kirjatuksi MYÖS kehotteen hyväksyessä, jottei Android laskisi
 *  samaa asennusta kahdesti (kehote + ensimmäinen käynnistys). Selaimen ja
 *  asennetun sovelluksen muisti on siellä sama origin. */
export function merkitseAsennusKirjatuksi(): void {
  try { localStorage.setItem(KIRJATTU_AVAIN, '1') } catch { /* privaattitila */ }
}

/** Päätöslogiikka puhtaana: mikä pinta kirjataan, vai ei mitään. Erillään
 *  selaimen APIsta, jotta kaikki kolme haaraa saa testin. */
export function kirjattavaAsennusPinta(
  standalone: boolean, joKirjattu: boolean, alusta: Platform,
): string | null {
  if (!standalone || joKirjattu) return null
  return `standalone_${alusta}`
}

/** Selainkääre: kirjattava pinta tälle laitteelle, tai null. */
export function kirjattavaAsennus(): string | null {
  if (typeof window === 'undefined') return null
  return kirjattavaAsennusPinta(isInstalled(), asennusJoKirjattu(), detectPlatform())
}

// ── Bannerin hiljennys ────────────────────────────────────────────────────
// ✕ hiljentää saapumisbannerin 14 päiväksi. Aiemmin sessionStorage → banneri
// palasi JOKA istunnossa, mikä ärsyttää vakiokävijää joka on jo päättänyt
// olla asentamatta. Pysyvä 📲-nappi yläpalkissa säilyy silti aina.
const DISMISS_KEY = 'install-dismissed-until'
const DISMISS_DAYS = 14

export function isBannerDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY)
    return !!v && Date.now() < Number(v)
  } catch { return false }
}

export function dismissBanner(): void {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 864e5)) } catch { /* privaattitila */ }
}
