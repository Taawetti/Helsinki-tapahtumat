// Hakusanojen synonyymit (omistaja 6.11.2026).
//
// MIKSI. Sovelluksen haku vertaa hakusanaa tapahtuman tekstiin sellaisenaan.
// "Helsingin joulunavaus" on marraskuun haetuimpia, mutta sama tapahtuma tulee
// lähteestä nimellä "Aleksin joulukadun avajaiset" — haku ei löytänyt sitä,
// ja kaupungin kalenterin poistettua oman ilmoituksensa kävijä luuli
// tapahtuman kadonneen. Samoin "joulu"-haku ohitti Tuomaan markkinat ja
// englanninkieliset joulukonsertit.
//
// MITEN. Ryhmä laukeaa, kun hakusana osuu sen laukaisimeen; silloin tapahtuma
// osuu, jos sen tekstissä on hakusana TAI mikä tahansa ryhmän termeistä.
// Termit ovat sananalkuja ("joulukadun avaj"), koska vertailu on osajonohaku.
// Laukaisimet ovat tarkkoja: väljä laukaisin toisi vieraita tapahtumia
// tavallisiin hakuihin, ja se on pahempaa kuin puuttuva synonyymi.
//
// Englanninkieliset termit ovat mukana, koska englanninkielisessä näkymässä
// näkyvien tapahtumien otsikot käännetään (hooks/useTranslatedEvents) ja suodatus
// lukee käännetyn otsikon: ilman niitä käännetty "Aleksi Christmas Street
// opening" putoaisi pois suomenkielisestä joulunavaus-hausta.

export interface SynonyymiRyhma {
  /** Testataan pienaakkosiksi muutettuun, trimmattuun hakusanaan. */
  laukaisin: RegExp
  /** Pienaakkosin; tapahtuma osuu, jos jokin näistä on sen tekstissä. */
  termit: readonly string[]
}

export const HAKUSYNONYYMIT: readonly SynonyymiRyhma[] = [
  {
    // Helsingin joulunavaus = Aleksanterinkadun joulukadun avajaiset, jolloin
    // jouluvalot sytytetään. Kirjoitusasut: joulunavaus, joulun avaus,
    // joulukadun avajaiset, jouluvalojen sytytys; englanniksi christmas
    // (street) opening, opening of christmas.
    laukaisin: /joulun ?avau|joulukadun avaj|jouluvalojen syty|christmas (street )?opening|opening of christmas/,
    termit: ['joulunavau', 'joulun avau', 'joulukadun avaj', 'jouluvalojen syty', 'christmas street', 'christmas opening', 'opening of christmas'],
  },
  {
    // Pelkkä "joulu" (tai englanniksi christmas): mukaan englanninkieliset
    // otsikot ja Tuomaan markkinat, Helsingin suurin joulumarkkina, jonka
    // nimessä ei ole sanaa joulu.
    laukaisin: /^(joulu|joulut|joulun|christmas|xmas)$/,
    termit: ['joulu', 'christmas', 'xmas', 'tuomaan markkinat'],
  },
]

/** Hakusanan termit, joista mikä tahansa riittää osumaan: hakusana itse ensin,
 *  sitten laukaistujen ryhmien termit ilman toistoja. */
export function hakutermit(hakusana: string): string[] {
  const kw = hakusana.toLowerCase().trim()
  if (!kw) return []
  const termit = [kw]
  for (const ryhma of HAKUSYNONYYMIT) {
    if (!ryhma.laukaisin.test(kw)) continue
    for (const t of ryhma.termit) if (!termit.includes(t)) termit.push(t)
  }
  return termit
}

/** Osuuko tapahtuma hakuun — sama sääntö kuin sovelluksen haussa
 *  (HomeClient filteredEvents): otsikko, lyhyt kuvaus, paikan nimi ja
 *  kategoriat, pienaakkosin, osajonona. Jaettu, jotta palvelimella koottu
 *  hakusiemen (esim. /joulu-helsingissa) näyttää täsmälleen samat tapahtumat
 *  kuin selaimen oma haku. */
export function osuuHakuun(
  e: { title: string; shortDescription?: string | null; location?: { name?: string | null } | null; categories?: readonly string[] | null },
  termit: readonly string[],
): boolean {
  if (termit.length === 0) return true
  const haystack = [e.title, e.shortDescription ?? '', e.location?.name ?? '', ...(e.categories ?? [])].join(' ').toLowerCase()
  return termit.some((t) => haystack.includes(t))
}
