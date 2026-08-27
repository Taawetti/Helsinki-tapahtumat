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

export type TrackKind =
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
    }).catch(() => {})
  } catch { /* mittaus ei saa näkyä käyttäjälle */ }
}

/** Kirjaa tapahtuman. Palaa heti — verkkoa ei odoteta. */
export function track(kind: TrackKind, data: TrackData = {}): void {
  if (typeof window === 'undefined') return
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
