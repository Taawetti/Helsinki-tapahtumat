// Kävijätapahtumien lähetys selaimesta.
//
// KOLME SÄÄNTÖÄ joita tämä tiedosto noudattaa:
//
// 1. MITTAUS EI SAA RIKKOA SOVELLUSTA. Jokainen kutsu on try/catchin sisällä ja
//    virheet niellään. Jos mittaus kaatuu, käyttäjä ei saa huomata mitään.
//
// 2. MITTAUS EI SAA HIDASTAA. Tapahtumat kerätään jonoon ja lähetetään erissä.
//    Yksittäinen klikkaus ei odota verkkoa, joten napin painallus tuntuu
//    samalta kuin ennen.
//
// 3. TAPAHTUMAT EIVÄT SAA KADOTA SIVULTA POISTUTTAESSA. Juuri lippuklikki —
//    tärkein mitattava — vie käyttäjän pois sivulta, jolloin tavallinen fetch
//    ehditään perua. Siksi poistuttaessa käytetään sendBeaconia, joka jää
//    selaimen hoidettavaksi vaikka sivu suljetaan.
//
// EI TUNNISTETTA. Täältä ei lähde laite-, istunto- eikä käyttäjätunnistetta.
// Ks. sql/create-click-events.sql: ilman tunnistetta data ei ole henkilötietoa.

import { fireAdsConversion } from './ads-conversions'
import { kirjaaToiminto } from './engagement'

export type TrackKind =
  | 'pageview' | 'engaged' | 'returning'
  | 'event_open' | 'ticket_click' | 'external_click' | 'favorite_add'
  | 'section' | 'guide_open' | 'category' | 'search'
  | 'map_open' | 'install' | 'newsletter'

interface TrackData {
  /** Mistä pinnasta tapahtuma tuli: grid, picks, search, hero, map, idea, venue. */
  surface?: string
  eventId?: string
  /** Ihmisluettava nimi: tapahtuman otsikko, osion nimi tai domain. */
  label?: string
  meta?: string
}

interface Jono extends TrackData { kind: TrackKind }

// ── KUKA JÄTETÄÄN MITTAAMATTA ───────────────────────────────────────────────
// Omistaja 27.8.2026: omat käynnit ja kehitystyö eivät saa näkyä luvuissa.
// Karsinta tehdään KOLMELLA tasolla, koska yksikään yksinään ei riitä:
//   1. tämä tiedosto: kehitysympäristö ja esikatselujulkaisut (alla)
//   2. tämä tiedosto: laitekohtainen poissulku osoitteella ?notrack=1 (alla)
//   3. palvelin: admin-istunnon evästeen omistaja (app/api/track)
// Palvelinpuoli on tärkein, koska se toimii vaikka selaimen muisti tyhjenisi.

const POISSULKU_AVAIN = 'mt-notrack'

/** Onko tämä oikea tuotantosivusto. Kehityspalvelin ja Vercelin
 *  esikatselujulkaisut kirjoittaisivat samaan tietokantaan kuin tuotanto —
 *  yksi koodauspäivä täyttäisi luvut valheellisilla käynneillä. */
function tuotannossa(): boolean {
  const h = window.location.hostname
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')) return false
  // Esikatselujulkaisut ovat muotoa <jotain>-<hash>.vercel.app.
  if (h.endsWith('.vercel.app')) return false
  return true
}

/** Laitekohtainen poissulku. Käy kerran osoitteessa ?notrack=1, niin tämä laite
 *  ei enää kirjaudu mihinkään. ?notrack=0 kytkee mittauksen takaisin. */
function poissuljettu(): boolean {
  try {
    const p = new URLSearchParams(window.location.search).get('notrack')
    if (p === '1') localStorage.setItem(POISSULKU_AVAIN, '1')
    else if (p === '0') localStorage.removeItem(POISSULKU_AVAIN)
    return localStorage.getItem(POISSULKU_AVAIN) === '1'
  } catch {
    // Privaattitila: ei muistia, joten ei poissulkuakaan. Mitataan normaalisti.
    return false
  }
}

const jono: Jono[] = []
let ajastin: ReturnType<typeof setTimeout> | null = null

const VIIVE_MS = 1500
const ERA_TAYSI = 10
const OSOITE = '/api/track'

function laheta(beaconilla = false) {
  if (jono.length === 0) return
  const era = jono.splice(0, jono.length)
  const runko = JSON.stringify({ events: era })
  try {
    // sendBeacon jää selaimen hoidettavaksi vaikka sivu suljetaan samalla
    // hetkellä. Sillä on kokoraja (~64 kt), mutta 20 rivin erä on kilotavuja.
    if (beaconilla && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(OSOITE, new Blob([runko], { type: 'application/json' }))
      return
    }
    void fetch(OSOITE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: runko,
      keepalive: true,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        // Palvelin tunnisti paluukävijän (ks. app/api/track): kirjataan
        // kerran. Tämä erä ei sisällä pageview'ta, joten vastaus ei voi
        // ehdottaa paluuta uudestaan — ei silmukkaa.
        if (d && (d as { returning?: boolean }).returning) track('returning')
      })
      .catch(() => {})
  } catch { /* mittaus ei saa näkyä käyttäjälle */ }
}

/** Kirjaa tapahtuman. Palaa heti — verkkoa ei odoteta. */
export function track(kind: TrackKind, data: TrackData = {}): void {
  if (typeof window === 'undefined') return
  if (!tuotannossa() || poissuljettu()) return
  // Google Ads -konversio samasta putkesta (lib/ads-conversions): sama
  // poissulkuketju pätee, eikä kutsujiin tarvita toista mittauskutsua.
  // No-op kunnes konversiotunnisteet on asetettu Verceliin.
  fireAdsConversion(kind)
  // Sitoutumisilmaisin (lib/engagement): kun käynti ylittää kynnyksen
  // (2. tapahtuma-avaus tai arvoteko), kirjataan KERRAN 'engaged' — sekä
  // omaan mittaukseen että Ads-konversiona. Rekursio pysähtyy heti:
  // 'engaged' itse ei ruoki ilmaisinta.
  if (kind !== 'engaged' && kirjaaToiminto(kind)) {
    track('engaged', { meta: kind })
  }
  try {
    jono.push({ kind, ...data })
    if (jono.length >= ERA_TAYSI) {
      if (ajastin) { clearTimeout(ajastin); ajastin = null }
      laheta()
      return
    }
    if (!ajastin) {
      ajastin = setTimeout(() => { ajastin = null; laheta() }, VIIVE_MS)
    }
  } catch { /* niellään */ }
}

/** Lähetä jono heti. Kutsutaan ennen kuin käyttäjä siirtyy pois sivulta. */
/** Onko TÄMÄ laite suljettu pois mittauksesta. Admin-näkymä käyttää tätä. */
export function onkoPoissuljettu(): boolean {
  if (typeof window === 'undefined') return false
  try { return localStorage.getItem(POISSULKU_AVAIN) === '1' } catch { return false }
}

/** Kytkee tämän laitteen mittauksen päälle tai pois. */
export function asetaPoissulku(paalle: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (paalle) localStorage.setItem(POISSULKU_AVAIN, '1')
    else localStorage.removeItem(POISSULKU_AVAIN)
  } catch { /* privaattitila */ }
}

export function flushTrack(): void {
  if (ajastin) { clearTimeout(ajastin); ajastin = null }
  laheta(true)
}

if (typeof window !== 'undefined') {
  // pagehide kattaa myös Safarin takaisin-välimuistin, jossa unload ei laukea.
  window.addEventListener('pagehide', () => flushTrack())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTrack()
  })
}
