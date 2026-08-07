// Flying Dutch (flyingdutch.fi) -settilistan parseri — PURET, verkkovapaat
// funktiot, jotta ne ovat fixture-testattavissa (scripts/test-categories.ts).
//
// Tuotantovirhe 8/2026: split-regex `(?=\b\d{1,2}\.\d{1,2}\.\b)` ei osunut
// KOSKAAN (välilyönti päivämäärän jälkeen → lopun \b epäonnistuu aina) →
// live-skrape palautti pysyvästi 0 tapahtumaa ja lähde eli staattisella
// varalistalla. Toinen virhe: parseFinnishDate siirsi eilisen keikan
// ensi vuoteen, joten se katosi näkymästä heti keikkapäivän jälkeen.

// Re-export yhteensopivuuden vuoksi (reitti + testit käyttävät tätä polkua);
// varsinainen toteutus on jaetussa lib/finnish-date.ts:ssä.
import { parseFinnishDate } from './finnish-date'
export { parseFinnishDate }

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
    const rest = chunk.slice(dateMatch[1].length).trim().slice(0, 120)

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
