// Converts DataForSEO / Google `my_business_info` work_time into an OSM
// `opening_hours` string, so the same lib/opening-hours.ts evaluator handles
// both sources. Google hours are far fresher than OSM (which is often years
// stale — e.g. Roji tagged open Sundays in OSM while Google says closed).

interface HourMinute { hour?: number; minute?: number }
interface GoogleInterval { open?: HourMinute; close?: HourMinute }
interface GoogleWorkTime {
  work_hours?: { timetable?: Record<string, GoogleInterval[] | null> }
}

const DAY_TO_OSM: Record<string, string> = {
  monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th',
  friday: 'Fr', saturday: 'Sa', sunday: 'Su',
}
// Emit Mo→Su so the string reads naturally
const ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * @returns OSM opening_hours string (e.g. "Tu 11:00-15:00,17:00-20:30; We …"),
 *   or null when Google returned no usable timetable (→ caller keeps OSM data).
 *   Days present-but-null (Google "Closed") are omitted → the evaluator treats
 *   them as closed, which is the whole point (Roji's Sunday).
 */
export function googleTimetableToOsm(workTime: unknown): string | null {
  const timetable = (workTime as GoogleWorkTime | null)?.work_hours?.timetable
  if (!timetable || typeof timetable !== 'object') return null

  const parts: string[] = []
  let sawAnyDay = false

  for (const day of ORDER) {
    if (!(day in timetable)) continue
    sawAnyDay = true
    const intervals = timetable[day]
    if (!intervals || intervals.length === 0) continue // Google "Closed" → omit

    const ranges: string[] = []
    for (const iv of intervals) {
      const oh = iv?.open?.hour, om = iv?.open?.minute ?? 0
      const ch = iv?.close?.hour, cm = iv?.close?.minute ?? 0
      if (oh == null || ch == null) continue
      const open = `${pad(oh)}:${pad(om)}`
      // A midnight close is the END of the day → "24:00", not "00:00".
      // A close earlier than open is a genuine past-midnight span (18:00-02:00),
      // which the OSM evaluator understands — leave it as-is.
      const close = ch === 0 && cm === 0 ? '24:00' : `${pad(ch)}:${pad(cm)}`
      ranges.push(`${open}-${close}`)
    }
    if (ranges.length) parts.push(`${DAY_TO_OSM[day]} ${ranges.join(',')}`)
  }

  // No timetable at all, or every day closed/empty → unusable, keep OSM.
  if (!sawAnyDay || parts.length === 0) return null
  return parts.join('; ')
}
