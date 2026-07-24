// Lähdeterveyden kanaria — havaitsee kun tapahtumasyöte hiljaa romahtaa.
//
// Tausta (2026-07-23): RA-klubilähde palautti 200 OK + 0 tapahtumaa (string-id
// → GraphQL-virhe niellyksi) ja Yöelämä-kategoria oli tyhjä kuukausia kenenkään
// huomaamatta. Tämä kanaria (cron /api/cron/source-health) hakee aggregaatin
// ja hälyttää sähköpostilla, jos backbone tai rakenteellisesti-aina-päällä
// oleva lähde putoaa nollaan.
//
// PERIAATE: konservatiiviset kynnykset → EI vääriä hälytyksiä. Per-lähde-0 EI
// hälytä (16/40 lähdettä on laillisesti tyhjiä minä tahansa viikkona — kesä,
// venue-kohtaiset). Vain (a) koko aggregaatin romahdus, (b) runkolähteen
// (linked-events) romahdus, (c) rakenteellisesti-aina-päällä olevan lähteen
// kuolema (RA-viikonloppuklubit, viikoittaiset pubivisat), (d) laajahäiriö.
//
// Kynnykset koskevat 7 PÄIVÄN ikkunaa (kanaria hakee start..+6d).

import { helsinkiToday } from './helsinki-time'

export const CANARY_MIN_TOTAL = 100          // koko aggregaatti (7 pv; ~780 normi)
export const CANARY_MIN_LINKED_EVENTS = 50   // runkolähde (~425 normi)
export const CANARY_MAX_DEAD_SOURCES = 20    // laajahäiriö: ei-vastanneet

// Lähteet jotka tuottavat käytännössä AINA ≥floor tapahtumaa 7 pv:n ikkunassa.
// 0/alle = lähde rikki (juuri se hiljainen kuolema jota emme huomanneet).
export const CANARY_SOURCE_FLOORS: Record<string, number> = {
  ra: 1,          // Resident Advisor — Helsingin viikonloppuklubit, aina jotain
  pubivisat: 10,  // viikoittaiset pubivisat — rakenteellisesti kymmeniä
}

// Kausilähteet: tuottavat tapahtumia VAIN tiettyinä kuukausina. Lattia
// tarkistetaan vain kun lähteen KUULUU olla aktiivinen, jottei laillinen kauden
// ulkopuolinen 0 aiheuta väärää hälytystä. Superterassin kesäohjelma (recurring)
// pyörii ~6 pv/viikko; heinäkuu on varmasti keskellä kautta (kausi ~12.6.–13.8.),
// joten sen reunat (alku-kesäkuu, loppu-elokuu) jätetään ulos false-alarmien takia.
export const SEASONAL_SOURCE_FLOORS: Record<string, { months: number[]; floor: number }> = {
  recurring: { months: [7], floor: 3 },
}

export interface SourceStat { name: string; ok: boolean; count: number }
export interface CanaryPayload {
  total?: number
  events?: unknown[]
  sources?: SourceStat[]
}

/** Hakee aggregaatin ja palauttaa poikkeamat — MUTTA yrittää kerran uudelleen
 *  jos ensimmäinen haku näyttää ongelmia. Syy: /api/events tekee 40 rinnakkaista
 *  alihakua, ja KYLMÄKÄYNNISTYKSESSÄ ne voivat timeoutata → kaikki lähteet
 *  näyttävät kuolleilta vaikka syöte on terve. Uudelleenyritys lämpimänä
 *  poistaa väärät hälytykset. Alertoi vain jos ongelma toistuu. */
export async function checkSourceHealth(origin: string): Promise<{ issues: string[]; payload: CanaryPayload | null }> {
  const fetchOnce = async (): Promise<CanaryPayload | null> => {
    try {
      const start = new Date().toISOString().slice(0, 10)
      const end = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10)
      const params = new URLSearchParams({ start, end, page: '1', municipality: 'helsinki' })
      const res = await fetch(`${origin}/api/events?${params}`, { signal: AbortSignal.timeout(45000) })
      return res.ok ? ((await res.json()) as CanaryPayload) : null
    } catch {
      return null
    }
  }
  const month = parseInt(helsinkiToday().slice(5, 7), 10) // 1-12, kausilattioille
  let payload = await fetchOnce()
  let issues = detectSourceAnomalies(payload, month)
  if (issues.length > 0) {
    // Voi olla kylmäkäynnistys — lämmitä (heitä hukkaan) ja hae uudelleen.
    await fetchOnce()
    payload = await fetchOnce()
    issues = detectSourceAnomalies(payload, month)
  }
  return { issues, payload }
}

/** Palauttaa listan poikkeamia (tyhjä = terve). Puhdas funktio → testattava
 *  ilman verkkoa. `month` (1-12) = nykyinen kuukausi kausilattioiden arviointiin;
 *  jos annettu ja lähde on kaudessaan, tarkistetaan myös SEASONAL_SOURCE_FLOORS.
 *  Ilman `month`:ia kausilattioita ei tarkisteta (testien determinismi). */
export function detectSourceAnomalies(payload: CanaryPayload | null, month?: number): string[] {
  const issues: string[] = []
  if (!payload) {
    issues.push('/api/events ei palauttanut dataa — koko aggregaatti alhaalla')
    return issues
  }

  const total = payload.total ?? payload.events?.length ?? 0
  const sources = payload.sources ?? []
  const byName = new Map(sources.map((s) => [s.name, s]))

  if (total < CANARY_MIN_TOTAL) {
    issues.push(`Kokonaismäärä ${total} < ${CANARY_MIN_TOTAL} (7 pv) — mahdollinen romahdus`)
  }

  const le = byName.get('linked-events')
  if (le && le.ok && le.count < CANARY_MIN_LINKED_EVENTS) {
    issues.push(`Runkolähde linked-events ${le.count} < ${CANARY_MIN_LINKED_EVENTS}`)
  }

  const dead = sources.filter((s) => !s.ok)
  if (dead.length > CANARY_MAX_DEAD_SOURCES) {
    issues.push(`${dead.length} lähdettä ei vastannut (${dead.slice(0, 8).map((s) => s.name).join(', ')}…)`)
  }

  for (const [name, floor] of Object.entries(CANARY_SOURCE_FLOORS)) {
    const s = byName.get(name)
    const count = s?.ok ? s.count : 0
    if (count < floor) {
      issues.push(`Lähde '${name}' ${count} < ${floor} (odotetaan aina ≥${floor}/viikko) — todennäköisesti rikki`)
    }
  }

  // Kausilattiat: vain kun kuukausi on annettu JA lähde on kaudessaan.
  if (month !== undefined) {
    for (const [name, cfg] of Object.entries(SEASONAL_SOURCE_FLOORS)) {
      if (!cfg.months.includes(month)) continue
      const s = byName.get(name)
      const count = s?.ok ? s.count : 0
      if (count < cfg.floor) {
        issues.push(`Kausilähde '${name}' ${count} < ${cfg.floor} (kk ${month}, odotetaan ≥${cfg.floor}) — todennäköisesti rikki`)
      }
    }
  }

  return issues
}
