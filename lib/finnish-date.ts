// Suomalainen "D.M."-päivämäärän vuodenpäättely — jaettu venue-skrapereille.
//
// Taustavika (8/2026): naiivi "mennyt → ensi vuosi" -sääntö siirsi EILISEN
// keikan ensi vuoteen, joten se katosi listalta heti keikkapäivän jälkeen
// (Flying Dutch -tapaus). Sama vika oli juttutupa/postbar/glivelab/venues-
// skrapereissa. Sääntö:
//   - alle PAST_DAYS_SAME_YEAR vrk menneessä → kuluva vuosi (eilinen säilyy)
//   - yli FUTURE_DAYS_SAME_YEAR vrk tulevassa → edellinen vuosi (29.12. tammikuussa)
//   - muuten mennyt → ensi vuosi (joulukuun lista tammikeikoista)

// Kuinka kauas menneisyyteen päivämäärä vielä tulkitaan KULUVAN vuoden
// tapahtumaksi (esim. eilinen keikka 6.8. kun tänään on 7.8.).
export const PAST_DAYS_SAME_YEAR = 60
// Kuinka kauas tulevaisuuteen päivämäärä vielä tulkitaan kuluvan vuoden
// tapahtumaksi. Tämän jälkeen oletetaan viime vuoden lopun tapahtumaksi.
export const FUTURE_DAYS_SAME_YEAR = 183

/** Parse "D.M." tai "DD.MM." → YYYY-MM-DD (tyhjä jos virheellinen).
 *  `today` (YYYY-MM-DD) injektoitavissa testejä varten; oletuksena tämä päivä. */
export function parseFinnishDate(s: string, today?: string): string {
  const m = s.match(/(\d{1,2})\.(\d{1,2})\./)
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
