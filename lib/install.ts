// Sovelluksen asennus (PWA) — jaettu logiikka.
//
// MIKSI JAETTU. Sama beforeinstallprompt-tapahtuma tarvitaan kahdessa
// paikassa: kelluvassa asennusbannerissa ja latausivulla. Tapahtuma laukeaa
// VAIN KERRAN sivulatausta kohden, joten jos molemmat kuuntelisivat sitä
// erikseen, vain toinen saisi sen kiinni ja toisen painike jäisi kuolleeksi.
// Siksi tapahtuma otetaan talteen moduulitasolla heti kun tämä tiedosto
// ladataan, ja molemmat lukevat samaa talletettua arvoa.

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
