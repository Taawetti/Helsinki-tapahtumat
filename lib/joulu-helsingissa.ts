// "Joulu Helsingissä" -laskeutumissivun data (/joulu-helsingissa, omistaja
// 6.11.2026). "Helsingin joulunavaus" toi 13 kävijää viikossa ilman yhtään
// panostusta, ja hakupiikki on avajaisviikolla — sivu vastaa siihen ja avaa
// sovelluksen jouluhaulla (owner: laskeutumissivu avaa aina sovelluksen).

import { fetchLinkedEventsAll, LE_MAX_PAGE_SIZE } from '@/lib/linked-events'
import { normalisoiLinkedEvent, type LinkedEventRaw } from '@/lib/fetchInitialEvents'
import { helsinkiDateOf } from '@/lib/helsinki-time'
import { hakutermit, osuuHakuun } from '@/lib/hakusynonyymit'
import { paivaEssiivi, paivaLyhyt } from '@/lib/seo-intro'
import { siirraPaivaa } from '@/lib/lahdevarasto'
import type { Event } from '@/lib/types'

/** Sovelluksen hakusana sivulla. Synonyymit (lib/hakusynonyymit) tuovat
 *  mukaan englanninkieliset otsikot ja Tuomaan markkinat. */
export const JOULU_HAKUSANA = 'joulu'

export interface JoulunavausTieto {
  /** YYYY-MM-DD */
  paiva: string
  /** Kellonaika suomalaisittain, esim. '16' tai '16.30' */
  klo: string
}

/**
 * Helsingin joulunavaus eli Aleksanterinkadun joulukadun avajaiset.
 *
 * KÄSIN YLLÄPIDETTY. Kaupungin kalenteri poisti oman ilmoituksensa 5.11.2026,
 * ja järjestäjän sivulla oli vielä edellisen vuoden tiedot. Päivä ja aika
 * ovat toisesta tapahtumalähteestä ja matkailuoppaasta (21.11.2026 klo 16).
 * PÄIVITÄ joka syksy järjestäjän kanavasta (downtownhelsinki.fi/joulu,
 * Instagram/Facebook @helsinginjoulunavaus). Väärän vuoden tieto ei näy
 * sivulla (joulunavausTila → 'tuntematon'), joten unohdus ei näytä vanhaa
 * päivää — sivu kertoo silloin vain, että ajankohta julkaistaan myöhemmin.
 */
export const JOULUNAVAUS: JoulunavausTieto = { paiva: '2026-11-21', klo: '16' }

/** Joulukauden vuosi: 27.12. alkaen seuraava joulu. */
export function joulukaudenVuosi(tanaan: string): number {
  const vuosi = Number(tanaan.slice(0, 4))
  return tanaan.slice(5) > '12-26' ? vuosi + 1 : vuosi
}

export type NavausTila =
  | { tila: 'tulossa' | 'mennyt'; paivaTeksti: string; lyhyt: string; klo: string }
  | { tila: 'tuntematon' }

/** Joulunavauksen tila tänään. paivaTeksti "lauantaina 21.11.", lyhyt "21.11.". */
export function joulunavausTila(tanaan: string, tieto: JoulunavausTieto = JOULUNAVAUS): NavausTila {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tieto.paiva) || Number(tieto.paiva.slice(0, 4)) !== joulukaudenVuosi(tanaan)) {
    return { tila: 'tuntematon' }
  }
  return {
    tila: tanaan <= tieto.paiva ? 'tulossa' : 'mennyt',
    paivaTeksti: paivaEssiivi(tieto.paiva),
    lyhyt: paivaLyhyt(tieto.paiva),
    klo: tieto.klo,
  }
}

/** Siemenhaun aikaväli: tästä päivästä joulukauden loppuun (26.12.), enintään
 *  90 päivää — sama yläraja kuin sovelluksen hakuikkunalla. */
export function joulunHakuvali(tanaan: string): { start: string; end: string } {
  const kausiLoppu = `${joulukaudenVuosi(tanaan)}-12-26`
  const yla = siirraPaivaa(tanaan, 90)
  return { start: tanaan, end: kausiLoppu < yla ? kausiLoppu : yla }
}

/**
 * Sivun hakusiemen ja hakukoneelle näkyvä lista: kaupungin kalenterin
 * jouluaiheiset tapahtumat, suodatettuna TÄSMÄLLEEN sovelluksen hakusäännöllä
 * (lib/hakusynonyymit osuuHakuun), jotta selaimen oma haku ei pudota mitään
 * siemenestä valmistuessaan. Kalenteri on kevyt ja nopea lähde (mitattu
 * 6.11.2026: 359 riviä, ~4 s); sovelluksen omat hakusivut olisivat olleet
 * ~2 Mt ja 10–15 s per sivu kylmänä. Muut lähteet täydentyvät selaimen haussa.
 * Virhe → tyhjä lista: sivu toimii silloin pelkällä selainhaulla.
 */
export async function haeJoulunTapahtumat(tanaan: string, raja = 60): Promise<Event[]> {
  const { start, end } = joulunHakuvali(tanaan)
  const termit = hakutermit(JOULU_HAKUSANA)
  try {
    const { rows } = await fetchLinkedEventsAll<LinkedEventRaw>(
      (page) =>
        `https://api.hel.fi/linkedevents/v1/event/?${new URLSearchParams({
          text: JOULU_HAKUSANA, start, end,
          // Samat rajaukset kuin koosteen kalenterihaussa (app/api/events):
          // Helsinki ja suomenkielinen sisältö.
          division: 'helsinki', language: 'fi',
          include: 'location,keywords', sort: 'start_time', format: 'json',
          page: String(page), page_size: String(LE_MAX_PAGE_SIZE),
        })}`,
      () => ({ next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }),
      { maxPages: 8 },
    )
    const nahty = new Set<string>()
    const tapahtumat: Event[] = []
    for (const raw of rows) {
      const e = normalisoiLinkedEvent(raw)
      if (nahty.has(e.id)) continue
      // Kalenterin start= palauttaa myös jo alkaneet pitkät tapahtumat
      // (näyttelyt) — kooste karsii ne, joten siemenkin karsii.
      let paiva: string
      try { paiva = helsinkiDateOf(e.startTime) } catch { continue }
      if (paiva < start || paiva > end) continue
      if (!osuuHakuun(e, termit)) continue
      nahty.add(e.id)
      tapahtumat.push(e)
    }
    tapahtumat.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    return tapahtumat.slice(0, raja)
  } catch {
    return []
  }
}
