// Laskeutumissivujen järjestys.
//
// MIKSI. Hakukonesivut näyttivät tapahtumat pelkässä aikajärjestyksessä, jolloin
// ensimmäisenä oli aamukahdeksan palvelukeskusohjelma. Mitattu tuotannosta
// 26.8.2026, /tapahtumat/tanaan alkoi näin: "Bridge 47 ry", "Pingistä
// (pöytätennis)", "Omatoiminen ompelu", "Omatoiminen ompelu". Omistaja:
// "senioiri, vauva, turistikierros, ompelutapahtumia ei saisi tulla ekana —
// sovelluksen trendi kärsii." Google lähettää juuri näille sivuille eniten
// kävijöitä (keikat helsinki 9 900 hakua/kk), joten tämä on sivuston näyteikkuna.
//
// MITÄÄN EI POISTETA. Omistajan aiempi linjaus 24.8. on että kohderyhmärajaus
// koskee SUOSITUKSIA, ei kategorioita: "voi etsiä sitten kategorioista mutta ei
// suosituksiin". Siksi tämä VAIN JÄRJESTÄÄ — kohderyhmän ulkopuoliset tapahtumat
// säilyvät listalla, mutta painuvat alas. Sivun lukumäärä ei muutu.

import { isOutsideTargetAudience } from './audience'
import { classifyEvent } from './event-classify'

/** Vähin mitä järjestäminen tarvitsee. Laskeutumissivuilla on omia
 *  tapahtumatyyppejään (PageEvent), jotka eivät ole täysiä Event-olioita —
 *  siksi rakenteellinen minimi eikä sidos yhteen tyyppiin. */
export interface Curatable {
  title: string
  startTime: string
  /** Osalla sivuista (esim. /tapahtumat/ilmaiset) kategoriat eivät kulje
   *  listaan asti, joten valinnainen. Puuttuessa kohdellaan tyhjänä. */
  categories?: string[]
  image?: string | null
  shortDescription?: string | null
  description?: string | null
  vibes?: string[]
  ysoIds?: string[]
  isFree?: boolean
  location?: { name?: string | null } | null
}

/** Kuvattomat rivit näyttävät keskeneräisiltä ruudukossa; kuva on myös merkki
 *  siitä että järjestäjä on nähnyt vaivaa. Sama painotus kuin etusivun
 *  poiminnoissa (HomeClient bestPicks). */
function vibesOf(e: Curatable): string[] {
  if (e.vibes) return e.vibes
  try {
    // classifyEvent lukee vain otsikon, kuvauksen, kategoriat ja yso-koodit.
    return classifyEvent({
      title: e.title, shortDescription: e.shortDescription ?? '', description: e.description ?? '',
      categories: e.categories ?? [], ysoIds: e.ysoIds,
    } as Parameters<typeof classifyEvent>[0])
  } catch { return [] }
}

function score(e: Curatable): number {
  let s = 0
  if (isOutsideTargetAudience({ ...e, categories: e.categories ?? [] })) s -= 100   // seniori, vauva, lapsi, neulonta → pohjalle
  if (e.image) s += 6
  const vibes = vibesOf(e)
  if (vibes.includes('festivaali')) s += 5
  if (vibes.includes('keikka')) s += 4
  if (vibes.includes('yoelama')) s += 3
  if (vibes.includes('teatteri') || vibes.includes('taide')) s += 2
  if (e.shortDescription || e.description) s += 1
  // Toistuva visaspammi ei saa täyttää kärkeä (196 samaa riviä mitattu 8/2026).
  if (/tietovisa|pubivisa|musavisa|\bvisa\b/i.test(`${e.title} ${(e.categories ?? []).join(' ')}`)) s -= 3
  return s
}

/**
 * Järjestä laskeutumissivun lista: kiinnostavimmat ensin, kohderyhmän
 * ulkopuoliset viimeisiksi. Aika ratkaisee tasapelin, jotta järjestys on
 * vakaa eikä sivu näytä eri asiaa joka uusiutumisella.
 */
export function curateForLanding<T extends Curatable>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const d = score(b) - score(a)
    if (d !== 0) return d
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  })
}

/** Montako kärkitapahtumaa on kohderyhmässä. Mittari jolla voi todeta ettei
 *  sivun ensivaikutelma ole ompeluryhmä — käytetään testeissä. */
export function inTargetInTop(events: Curatable[], n = 8): number {
  return events.slice(0, n).filter((e) => !isOutsideTargetAudience({ ...e, categories: e.categories ?? [] })).length
}
