// Joulukonsertit-opas (omistaja 27.10.2026): kausiopas, joka kokoaa syötteen
// joulukonsertit marras-joulukuulta ja nostaa kärkinostot (lib/nostot)
// ensimmäisiksi. Puhtaat osat täällä, haku lib/guide-data.ts:ssä.
//
// MIKSI. "Joulukonsertti Helsinki" on marras-joulukuun haetuimpia menovinkkejä
// Googlessa, eikä syötteessä ole yhtä paikkaa jossa kirkkojen ja salien
// joulukonsertit olisivat yhdessä. Opassivu /joulukonsertit tuo sovellukseen
// kävijöitä, jotka eivät sitä vielä tunne — ja näyttää heille Jannan joulun
// kärjessä.

import type { Event } from './types'

/** Kausi, jolloin opas näkyy valikoissa. SEO-sivu toimii aina. */
export const JOULUKAUSI_ALKU = '10-15'
export const JOULUKAUSI_LOPPU = '12-26'

export function onJoulukausi(tanaan: string): boolean {
  const kkpv = tanaan.slice(5)
  return kkpv >= JOULUKAUSI_ALKU && kkpv <= JOULUKAUSI_LOPPU
}

/** Joulusanat: tapahtuman pitää olla joulutapahtuma otsikon tai kategorian perusteella. */
export const JOULU_REGEX = /joulu|christmas|\bjul\b|julkonsert|xmas|noel/i
/** Konsertti: otsikko, kategoria tai paikka. Kirkko tai sali paikkana riittää,
 *  kun tapahtuma on joulutapahtuma — kirkoissa joulukuussa soi musiikki. */
export const JOULUKONSERTTI_REGEX = /konsert|concert|joululaul|kauneimmat|kuoro|choir|carol|gospel|jazz|klassi|urku|orkester|orchestra|sinfon|kantaat|orator|lucia|laulu|laulaa|laulaj|soi\b|sing|kirkko|church|cathedral|katedraali|\bsali\b|musiikki|music|show\b|konsertti/i
/** Pois: markkinat ja myyjäiset, pajat ja lasten puuhat, jumalanpalvelukset,
 *  ruokailut ja risteilyt — ne eivät ole konsertteja vaikka olisivat joulua. */
export const JOULU_POIS_REGEX = /markkin|myyjäi|\bpaja\b|työpaja|askartel|puuha|satutun|jumalanpalvelu|messu\b|messut\b|hartaus|lounas|brunssi|illallinen|risteily|myynti|näyttely|elokuva|leffa|kirpputori|basaari|bazaar|workshop|market|part(y|ies)\b|bileet|klubi|\bclub\b|\bdj\b|pikkujoulu|bites|street ?food|ruoka|glögi/i

export function suodataJoulukonsertit(events: readonly Event[]): Event[] {
  return events.filter((e) => {
    const otsikko = `${e.title} ${e.categories.join(' ')}`
    const kaikki = `${otsikko} ${e.location?.name ?? ''}`
    return JOULU_REGEX.test(otsikko) && JOULUKONSERTTI_REGEX.test(kaikki) && !JOULU_POIS_REGEX.test(e.title)
  })
}
