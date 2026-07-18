// Helsinki-timezone helpers for server code. Vercel runs in UTC, so plain
// Date math (setHours, toISOString().split('T')) silently shifts times by
// 2-3 h and flips the calendar date between 00:00-03:00 Helsinki time.

const HKI_DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' })

/** Today's date in Helsinki as YYYY-MM-DD, regardless of server TZ. */
export function helsinkiToday(): string {
  return HKI_DATE_FMT.format(new Date())
}

/** Helsinki calendar date (YYYY-MM-DD) of a timestamp — a 00:30 Helsinki event
 *  serialized as 21:30Z belongs to the NEXT Helsinki day, not the UTC day. */
export function helsinkiDateOf(iso: string): string {
  return HKI_DATE_FMT.format(new Date(iso))
}

/** Helsinki date range from today forward, as YYYY-MM-DD strings. */
export function helsinkiDateRange(days: number): { start: string; end: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' })
  return {
    start: fmt.format(new Date()),
    end: fmt.format(new Date(Date.now() + days * 24 * 60 * 60 * 1000)),
  }
}

/** Helsinki UTC offset for a date: '+03:00' (EEST) or '+02:00' (EET), DST-aware. */
export function helsinkiOffset(date: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Helsinki', timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+3'
  const m = name.match(/([+-])(\d+)/)
  const sign = m?.[1] ?? '+'
  const h = m?.[2] ?? '3'
  return `${sign}${h.padStart(2, '0')}:00`
}

/** ISO timestamp for a Helsinki-local wall-clock time, e.g. 2026-07-15T19:00:00+03:00. */
export function helsinkiISO(y: number, month: number, day: number, hour: number, minute: number): string {
  // Noon UTC of the same date is safely inside the target day for offset lookup
  const approx = new Date(Date.UTC(y, month - 1, day, 12))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:00${helsinkiOffset(approx)}`
}

/** Event timestamp for list rows: 'ke 15. heinäk. klo 19.00' style, Helsinki time.
 *  Date-only strings (ongoing/all-day events) render without a misleading time. */
export function formatEventDate(iso: string): string {
  const dateOnly = !iso.includes('T')
  return new Date(iso).toLocaleDateString('fi-FI', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(dateOnly ? {} : { hour: '2-digit' as const, minute: '2-digit' as const }),
    timeZone: 'Europe/Helsinki',
  })
}
