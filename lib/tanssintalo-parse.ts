// Tanssin talo (tanssintalo.fi) Craft CMS GraphQL -rajapinnan parseri — PUHDAS,
// fixture-testattava (scripts/test-categories.ts). Sivun ohjelmakalenteri on
// Vue-sovellus, joka hakee esitykset /api-päätepisteestä GraphQL:llä
// (section "experiences"). Varsinaiset esitysajat ovat aina
// irregularShowTimes-listassa: { date, time }, jossa date kertoo esityspäivän
// (Helsinki-offset) ja time-kentän HH:MM kellonajan. HUOM: time-kentän oma
// päivämäärä/offset on epäluotettava (luontipäivän jäänne), siksi siitä
// käytetään vain HH:MM.

export interface TanssintaloItem {
  date: string   // YYYY-MM-DD
  title: string
  time: string   // "HH:MM"
  url: string
  ticketUrl: string | null
}

interface ShowTime { date?: unknown; time?: unknown }
interface Entry {
  title?: unknown
  url?: unknown
  ticketLink?: unknown
  irregularShowTimes?: unknown
}

/** Parsii GraphQL-vastauksen entries-listan esityskerroiksi. */
export function parseTanssintaloEntries(body: unknown): TanssintaloItem[] {
  const entries = (body as { data?: { entries?: unknown } })?.data?.entries
  if (!Array.isArray(entries)) return []

  const results: TanssintaloItem[] = []
  for (const raw of entries as Entry[]) {
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    const url = typeof raw.url === 'string' ? raw.url : ''
    const ticketUrl = typeof raw.ticketLink === 'string' && raw.ticketLink ? raw.ticketLink : null
    if (title.length < 2 || !url) continue
    if (!Array.isArray(raw.irregularShowTimes)) continue

    for (const st of raw.irregularShowTimes as ShowTime[]) {
      const date = typeof st.date === 'string' ? st.date.slice(0, 10) : ''
      const tm = typeof st.time === 'string' ? st.time.slice(11, 16) : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(tm)) continue
      results.push({ date, title, time: tm, url, ticketUrl })
    }
  }
  return results
}
