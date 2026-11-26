// Mistä kävijä saapui. Kirjataan sivulatauksen ENSIMMÄISEEN pageview-riviin
// (components/PageView), meta-kenttään.
//
// MIKSI TÄMÄ ON OLEMASSA. 24.11.2026 kävijämäärä putosi kolmanneksen, eikä
// omasta mittauksesta voinut päätellä mistä kävijät katosivat: rivillä oli
// sivun polku mutta ei tulosuuntaa. Vercel Web Analytics näytti että pudotus
// oli "suorissa" käynneissä (ei viittaavaa sivustoa) puhelimilla — mutta se ei
// erota kotinäytölle asennettua sovellusta selaimella tulleesta. Tämä erottaa.
//
// MITÄ TALLENNETAAN: yksi lyhyt sana. Viittaavasta osoitteesta otetaan VAIN
// verkkotunnus (google.com), ei polkua eikä hakusanoja. Oman sivuston sisäinen
// siirtymä ei ole tulolähde → null, eikä mitään kirjata.

const TUNNETUT_SOVELLUKSET: Record<string, string> = {
  'fi.mitatanaan.app': 'sovellus',
  'com.google.android.googlequicksearchbox': 'google-sovellus',
  'com.google.android.gm': 'gmail',
  'com.facebook.katana': 'facebook',
  'com.facebook.orca': 'messenger',
  'com.instagram.android': 'instagram',
  'com.whatsapp': 'whatsapp',
  'org.telegram.messenger': 'telegram',
  'com.zhiliaoapp.musically': 'tiktok',
  'com.linkedin.android': 'linkedin',
}

const siistiSana = (s: string): string => s.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40)

export interface TulolahdeSyote {
  /** document.referrer */
  referrer: string
  /** window.location.hostname */
  oma: string
  /** window.location.search */
  haku: string
  /** Avattu kotinäytön kuvakkeesta (display-mode: standalone / iOS navigator.standalone). */
  standalone: boolean
}

/** Tulolähde yhtenä sanana, tai null kun kyse on sivuston sisäisestä siirtymästä. */
export function tulolahde({ referrer, oma, haku, standalone }: TulolahdeSyote): string | null {
  // Androidin sovelluksesta avattu linkki: android-app://<paketti>. Oma
  // Play-sovellus (TWA) tulee tätä kautta, samoin Googlen sovelluksen syöte.
  const sovellus = referrer.match(/^android-app:\/\/([a-z0-9._]+)/i)
  if (sovellus) {
    const paketti = sovellus[1].toLowerCase()
    return TUNNETUT_SOVELLUKSET[paketti] ?? `android:${siistiSana(paketti)}`
  }
  // Kotinäytön kuvake ennen kaikkea muuta: asennetulla sovelluksella ei ole
  // viittaajaa, ja ilman tätä se näyttäisi samalta kuin osoitteen kirjoittaminen.
  if (standalone) return 'sovellus'

  // Kampanjalinkki (uutiskirje, QR-kortti, some): ?utm_source=. Vain tämän
  // yhden parametrin arvo luetaan — muu hakuosa voi sisältää hakusanan.
  try {
    const utm = siistiSana(new URLSearchParams(haku).get('utm_source') ?? '')
    if (utm) return `utm:${utm}`
  } catch { /* viallinen hakuosa: jatketaan viittaajalla */ }

  if (!referrer) return 'suora'
  let host = ''
  try { host = new URL(referrer).hostname.toLowerCase() } catch { return 'suora' }
  if (!host) return 'suora'
  const riisu = (h: string) => h.replace(/^www\./, '')
  if (riisu(host) === riisu(oma.toLowerCase())) return null
  return siistiSana(riisu(host)) || 'suora'
}
