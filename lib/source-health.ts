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

export const CANARY_MIN_TOTAL = 100          // koko aggregaatti (7 pv; ~780 normi)
export const CANARY_MIN_LINKED_EVENTS = 50   // runkolähde (~425 normi)
export const CANARY_MAX_DEAD_SOURCES = 20    // laajahäiriö: ei-vastanneet

// Lähteet jotka tuottavat käytännössä AINA ≥floor tapahtumaa 7 pv:n ikkunassa.
// 0/alle = lähde rikki (juuri se hiljainen kuolema jota emme huomanneet).
export const CANARY_SOURCE_FLOORS: Record<string, number> = {
  ra: 1,          // Resident Advisor — Helsingin viikonloppuklubit, aina jotain
  pubivisat: 10,  // viikoittaiset pubivisat — rakenteellisesti kymmeniä
}

export interface SourceStat { name: string; ok: boolean; count: number }
export interface CanaryPayload {
  total?: number
  events?: unknown[]
  sources?: SourceStat[]
}

/** Palauttaa listan poikkeamia (tyhjä = terve). Puhdas funktio → testattava
 *  ilman verkkoa. */
export function detectSourceAnomalies(payload: CanaryPayload | null): string[] {
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

  return issues
}
