// Stadissa-viikkohakujen ikkunointi — puhdas funktio fixture-testejä varten.
//
// Tuotantovika 8/2026: /api/stadissa haki AINA vain "tänään + 4 viikkoa"
// riippumatta pyydetystä start/end-ikkunasta → menneet tapahtumat (esim.
// Thailand Festival 9.–10.5.) eivät löytyneet menneisyyden selaamisesta,
// eivätkä yli 4 viikon päässä olevat festivaalit tulevaisuudesta.

/** Palauttaa listan index.php?date=-parametreja siten, että viikkosivut
 *  kattavat koko [start, end]-ikkunan (stadissa.fi palauttaa aina sen
 *  viikon, johon annettu päivä osuu — riittää yksi päivä per viikko).
 *  `maxPages` rajoittaa rinnakkaishaun koon (fan-out-budjetti). */
export function weekParamDates(start: string, end: string, maxPages = 12): string[] {
  const t0 = Date.parse(`${start}T00:00:00Z`)
  const t1 = Date.parse(`${end}T00:00:00Z`)
  if (isNaN(t0) || isNaN(t1) || t1 < t0) return [start]

  const dates: string[] = []
  const weekMs = 7 * 86400000
  for (let t = t0, i = 0; i < maxPages; t += weekMs, i++) {
    if (i > 0 && t > t1) break
    dates.push(new Date(t).toISOString().slice(0, 10))
  }
  return dates
}
