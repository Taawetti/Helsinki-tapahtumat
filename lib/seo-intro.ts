// Laskeutumissivujen (tapahtumat/tanaan, /viikonloppu, /ilmaiset) elävät
// faktat esittelytekstiin, otsikkoon ja metakuvaukseen (SEO-suunnitelma 2,
// 4.11.2026). Ne lasketaan palvelimella SAMASTA listasta jonka sivu näyttää,
// joten teksti vastaa hakijan kysymykseen ("mitä Helsingissä tapahtuu
// tänään?") konkreettisesti — päivä, määrä, ilmaisten määrä, päivän
// kellonaikaväli ja vilkkaimmat paikat — eikä yleisluontoisesti. Puhtaita
// funktioita, testattavissa ilman verkkoa (scripts/test-categories.ts).

import { tuntematonAika } from '@/lib/utils'
import { kanoninenPaikannimi } from '@/lib/paikannimet'
import { isOutsideTargetAudience } from '@/lib/audience'

export interface IntroTapahtuma { title: string; startTime: string; venue: string; categories?: string[] }

const VIIKONPAIVAT_ESSIIVI = ['sunnuntaina', 'maanantaina', 'tiistaina', 'keskiviikkona', 'torstaina', 'perjantaina', 'lauantaina']

/** "4.11." Helsingin kalenteripäivälle (YYYY-MM-DD). */
export function paivaLyhyt(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
}

/** "keskiviikkona 4.11." — viikonpäivä essiivissä, kuten lauseessa
 *  "keskiviikkona 4.11. Helsingissä on 87 tapahtumaa". */
export function paivaEssiivi(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  return `${VIIKONPAIVAT_ESSIIVI[d.getUTCDay()]} ${paivaLyhyt(ymd)}`
}

/** "6.–8.11." tai kuukauden vaihtuessa "30.10.–1.11.". */
export function paivavaliLyhyt(alku: string, loppu: string): string {
  const a = new Date(`${alku}T12:00:00Z`)
  const l = new Date(`${loppu}T12:00:00Z`)
  if (a.getUTCMonth() === l.getUTCMonth() && a.getUTCFullYear() === l.getUTCFullYear()) {
    return `${a.getUTCDate()}.–${l.getUTCDate()}.${l.getUTCMonth() + 1}.`
  }
  return `${paivaLyhyt(alku)}–${paivaLyhyt(loppu)}`
}

/** Ensimmäinen kirjain isoksi ("keskiviikkona" → "Keskiviikkona"). */
export function isoAlkukirjain(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Suomenkielinen luettelo: ["A"] → "A", ["A","B"] → "A ja B", ["A","B","C"] → "A, B ja C". */
export function luettelo(osat: string[]): string {
  if (osat.length <= 1) return osat[0] ?? ''
  return `${osat.slice(0, -1).join(', ')} ja ${osat[osat.length - 1]}`
}

/** Vilkkaimmat paikat: eniten tapahtumia, tasapelissä listassa ensin
 *  esiintynyt. Nimet yhdistetään kanonisiksi (lib/paikannimet), jotta
 *  "Helsingin Kulttuuritalo" ja "Kulttuuritalo" lasketaan yhteen; tyhjät
 *  nimet ohitetaan. KOHDERYHMÄN ULKOPUOLISET (lib/audience: seniorikeskukset,
 *  palvelukeskukset, leikkipuistot, käsityökerhot…) eivät osallistu laskentaan:
 *  mitattu 4.11.2026, ilman rajausta kärjessä olivat "Kampin palvelukeskus" (12
 *  riviä) ja "Töölön seniorikeskus" — sama kohderyhmäsääntö kuin listan
 *  järjestyksessä (lib/seo-curation), tässä vain esittelylauseen paikoille. */
export function vilkkaimmatPaikat(events: IntroTapahtuma[], n = 3, vahintaan = 3): string[] {
  const maarat = new Map<string, number>()
  for (const e of events) {
    const nimi = e.venue ? kanoninenPaikannimi(e.venue.trim()) : ''
    if (!nimi) continue
    if (isOutsideTargetAudience({ title: e.title, categories: e.categories ?? [], location: { name: e.venue } })) continue
    maarat.set(nimi, (maarat.get(nimi) ?? 0) + 1)
  }
  // "Vilkkain" tarkoittaa jotain vain, jos paikalla on useita tapahtumia:
  // hiljaisena viikonloppuna galleria kahdella rivillä nousi kakkoseksi
  // (mitattu 6.–8.11.2026). Alle kahdella kelvollisella paikalla lause
  // jätetään pois kokonaan (tyhjä lista).
  const karki = [...maarat.entries()]
    .filter(([, maara]) => maara >= vahintaan)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([nimi]) => nimi)
  return karki.length >= 2 ? karki : []
}

function helsinkiKello(iso: string): string {
  return new Date(iso).toLocaleTimeString('fi-FI', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Helsinki' })
}

/** Päivän ensimmäinen ja viimeinen alkamisaika Helsingin aikaa ("10.00",
 *  "23.00"). Ajattomat tapahtumat (00.00-sentinel, lib/utils tuntematonAika)
 *  ohitetaan — muuten "päivä alkaa klo 00.00". Null, jos yhtään ajallista ei
 *  ole. */
export function alkamisaikavali(events: IntroTapahtuma[]): { ensimmainen: string; viimeinen: string } | null {
  const ajat = events
    .filter((e) => !tuntematonAika(e.startTime))
    .map((e) => new Date(e.startTime).getTime())
    .filter((t) => Number.isFinite(t))
  if (ajat.length === 0) return null
  const min = Math.min(...ajat)
  const max = Math.max(...ajat)
  return { ensimmainen: helsinkiKello(new Date(min).toISOString()), viimeinen: helsinkiKello(new Date(max).toISOString()) }
}
