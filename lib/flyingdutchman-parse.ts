// Flying Dutch (flyingdutch.fi) -settilistan parseri — PURET, verkkovapaat
// funktiot, jotta ne ovat fixture-testattavissa (scripts/test-categories.ts).
//
// Tuotantovirhe 8/2026: split-regex `(?=\b\d{1,2}\.\d{1,2}\.\b)` ei osunut
// KOSKAAN (välilyönti päivämäärän jälkeen → lopun \b epäonnistuu aina) →
// live-skrape palautti pysyvästi 0 tapahtumaa ja lähde eli staattisella
// varalistalla. Toinen virhe: parseFinnishDate siirsi eilisen keikan
// ensi vuoteen, joten se katosi näkymästä heti keikkapäivän jälkeen.

export interface SetlistItem { title: string; date: string; time: string }

/** HTML → normalisoitu teksti (tagit pois, välilyönnit tiivistetty). */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

// Kuinka kauas menneisyyteen päivämäärä vielä tulkitaan KULUVAN vuoden
// tapahtumaksi (esim. eilinen keikka 6.8. kun tänään on 7.8.). Tämän jälkeen
// oletetaan kyseessä olevan ensi vuoden alun tapahtuma (kausilistan reuna).
const PAST_DAYS_SAME_YEAR = 60
// Kuinka kauas tulevaisuuteen päivämäärä vielä tulkitaan kuluvan vuoden
// tapahtumaksi. Tämän jälkeen oletetaan viime vuoden lopun tapahtumaksi
// (esim. 29.12. kun tänään on 5.1.).
const FUTURE_DAYS_SAME_YEAR = 183

/** Parse "D.M." tai "DD.MM." → YYYY-MM-DD. `today` (YYYY-MM-DD) injektoitavissa
 *  testejä varten; oletuksena tämä päivä. */
export function parseFinnishDate(s: string, today?: string): string {
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.$/)
  if (!m) return ''
  const day = parseInt(m[1])
  const month = parseInt(m[2])
  if (day < 1 || day > 31 || month < 1 || month > 12) return ''
  const todayStr = today ?? new Date().toISOString().slice(0, 10)
  const year = parseInt(todayStr.slice(0, 4))
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const msDay = 86400000
  const candMs = Date.parse(`${year}-${mm}-${dd}`)
  const todayMs = Date.parse(todayStr)
  let y = year
  if (candMs > todayMs + FUTURE_DAYS_SAME_YEAR * msDay) y = year - 1
  else if (todayMs - candMs > PAST_DAYS_SAME_YEAR * msDay) y = year + 1
  return `${y}-${mm}-${dd}`
}

/** Poimii settilistatekstistä tapahtumat. Teksti on muotoa
 *  "…SUMMER SETLIST 23.5. Markus Holkko Quartet 3.6. The Shubie Brothers …".
 *  Jokainen tapahtuma alkaa omalla "D.M."-päivämäärällään.
 *
 *  HUOM: split-lookahead EI saa päättyä \b:hen — välilyönti päivämäärän
 *  jälkeen rikkoo sen (alkuperäinen hiljainen vika). */
export function parseSetlistText(text: string, today?: string): SetlistItem[] {
  const chunks = text.split(/(?=\b\d{1,2}\.\d{1,2}\.)/)
  const results: SetlistItem[] = []

  for (const chunk of chunks) {
    const dateMatch = chunk.match(/^(\d{1,2}\.\d{1,2}\.)/)
    if (!dateMatch) continue

    const date = parseFinnishDate(dateMatch[1], today)
    if (!date) continue

    // Kaikki päivämäärän jälkeen (rajoitettu pätkä) on artisti + mahdollinen aika
    let rest = chunk.slice(dateMatch[1].length).trim().slice(0, 120)

    // Kellonaika: eksplisiittinen "17:00"/"17.00", tai suluissa oleva
    // aikaväli "(17-21)" → aloitusaika. Oletus 19:00 ("Showtime 19.00 unless
    // informed otherwise" -käytäntö paikan omilla sivuilla).
    let time = '19:00'
    const parenTime = rest.match(/\((\d{1,2})(?:[.:]\d{2})?-\d{1,2}(?:[.:]\d{2})?\)/)
    const clockTime = rest.match(/\b(\d{1,2})[.:](\d{2})\b/)
    if (clockTime) time = `${String(parseInt(clockTime[1])).padStart(2, '0')}:${clockTime[2]}`
    else if (parenTime) time = `${String(parseInt(parenTime[1])).padStart(2, '0')}:00`

    // Artistin nimi: siivoa aikaväli-sulkeiset ja kellonajat, katkaise
    // settilistan jälkeiseen ohjelmatekstiin ("Showtime 19.00 unless…").
    const title = rest
      .replace(/\s*\(\d{1,2}(?:[.:]\d{2})?-\d{1,2}(?:[.:]\d{2})?\)\s*/g, ' ')
      .replace(/\b\d{1,2}[.:]\d{2}\b/g, '')
      .replace(/\s+(?:Showtime|Free entry|OPENING HOURS|Bar:|Kitchen:)\b[\s\S]*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (title.length >= 3 && title.length <= 100) {
      results.push({ title, date, time })
    }
  }

  return results
}
