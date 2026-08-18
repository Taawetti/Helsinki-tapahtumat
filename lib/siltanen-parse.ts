// Siltanen (siltanen.org) ohjelmaruudukon parseri — PUHDAS, fixture-testattava
// (scripts/test-categories.ts). Sivusto on WordPress + Simple Calendar -plugin:
// etusivun kuukausiruudukossa jokaisella päivällä <td class="simcal-day-N …">
// ja sen sisällä <span class="simcal-event-title">…</span> + piilotetut
// lisätiedot (lippulinkki, mahdollinen "klo HH.MM").

export interface SiltanenItem {
  date: string       // YYYY-MM-DD (otsikon kuukausi + solun päivä)
  title: string
  time: string       // "HH:MM" — klo-merkinnästä, terassi-oletus 19:00 tai 20:00
  ticketUrl?: string // ensimmäinen https-linkki lisätiedoissa (esim. Tiketti)
}

const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parsii Simple Calendar -kuukausiruudukon. `fallbackYM` (YYYY-MM) käytetään
 *  jos sivun kuukausiotsikkoa ei löydy (sivu näyttää aina kuluvan kuukauden). */
export function parseSiltanenGrid(html: string, fallbackYM: string): SiltanenItem[] {
  const monthM = html.match(/current-month[^>]*>\s*([A-Za-z]+)/)
  const monthNum = monthM ? EN_MONTHS[monthM[1].toLowerCase()] : null
  const [fy, fm] = fallbackYM.split('-').map(Number)
  const y = fy
  const mo = monthNum ?? fm
  if (!mo || mo < 1 || mo > 12) return []

  const results: SiltanenItem[] = []
  const dayBlocks = [...html.matchAll(/<td class="simcal-day-(\d{1,2})[^"]*"[\s\S]*?<\/td>/g)]
  for (const block of dayBlocks) {
    const day = parseInt(block[1], 10)
    const date = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    for (const ev of block[0].matchAll(/<span class="simcal-event-title">([\s\S]*?)<\/span>([\s\S]*?)<\/li>/g)) {
      const title = decode(ev[1])
      if (title.length < 2) continue
      const details = ev[2] ?? ''

      // Lippulinkki: ensimmäinen https-URL lisätiedoissa (yleensä Tiketti)
      const urlM = details.match(/https:\/\/[^\s<"']+/)
      // Kellonaika: "klo 19:00" jos mainittu; terassi-keikat 19:00, muut 20:00
      const timeM = details.match(/klo\s+(\d{1,2})[.:](\d{2})/i)
      const time = timeM
        ? `${String(parseInt(timeM[1])).padStart(2, '0')}:${timeM[2]}`
        : /terassi/i.test(title)
          ? '19:00'
          : '20:00'

      results.push({ date, title, time, ticketUrl: urlM ? urlM[0] : undefined })
    }
  }
  return results
}
