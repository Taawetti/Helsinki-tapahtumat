// Evästesuostumus ja Google Consent Mode v2.
//
// MIKSI TÄMÄ ON OLEMASSA. Sivustolle lisättiin Google Ads -mittaus
// mainoskampanjaa varten (omistaja 26.8.2026). Mainosevästeet vaativat EU:ssa
// käyttäjän ENNAKKOsuostumuksen, eli tagi ei saa asettaa mitään ennen kuin
// käyttäjä on valinnut. Sen lisäksi Google itse on vaatinut maaliskuusta 2024
// lähtien Consent Mode v2:ta ETA-liikenteelle: ilman sitä uudelleenmarkkinointi
// ja konversiomittaus toimivat vajaasti. Suostumusratkaisu ei siis ole vain
// lakivelvoite vaan ehto sille että kampanjan tulokset ylipäätään näkyvät.
//
// Kävijämäärien mittaus (Vercel Web Analytics) on evästeetön eikä kuulu tähän —
// se toimii myös silloin kun käyttäjä kieltää mainosevästeet.

export const CONSENT_KEY = 'mt-consent-v1'

/** Tapahtuma jolla valinta välitetään saman välilehden muille komponenteille.
 *  localStorage ei laukaise storage-tapahtumaa omassa välilehdessään, joten
 *  banneri ja tietosuojasivu eivät muuten näkisi toistensa muutoksia. */
export const CONSENT_EVENT = 'mt-consent-change'

export type ConsentChoice = 'granted' | 'denied'

/** Google Ads -tili. Ympäristömuuttuja voittaa, jotta tunnisteen voi vaihtaa
 *  ilman koodimuutosta — oletus on se tunniste jonka mainostaja toimitti. */
export const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || 'AW-18228871339'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

// ── Ulkoinen tila useSyncExternalStorelle ───────────────────────────────────
// localStorage on nimenomaan ulkoinen tila, joten tämä on sille tarkoitettu
// rajapinta. Vaihtoehto (useEffect + setState) rikkoisi projektin lint-säännön
// eikä päivittyisi kun valinta muuttuu toisaalla samalla sivulla.

export function subscribeConsent(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CONSENT_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** null = käyttäjä ei ole vielä valinnut → banneri näytetään. */
export function readConsent(): ConsentChoice | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    // Privaattitila tai estetty tallennus: kohdellaan valitsemattomana.
    // Silloin mitään ei mitata, mikä on oikea oletus.
    return null
  }
}

/** Palvelin ei tiedä valintaa. null pitää palvelimen ja selaimen ensimmäisen
 *  maalauksen samana, joten hydraatiovirhettä ei synny. */
export function readConsentServer(): ConsentChoice | null {
  return null
}

/** Tallentaa valinnan, kertoo sen Googlelle ja herättää muut komponentit. */
export function setConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice)
  } catch { /* privaattitila — valinta on silti voimassa tämän sivulatauksen */ }

  // Consent Mode v2:n neljä kenttää. ad_user_data ja ad_personalization ovat
  // ne jotka maaliskuussa 2024 tulivat pakollisiksi — pelkkä ad_storage ei
  // enää riitä ETA-liikenteelle.
  window.gtag?.('consent', 'update', {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  })

  window.dispatchEvent(new Event(CONSENT_EVENT))
}
