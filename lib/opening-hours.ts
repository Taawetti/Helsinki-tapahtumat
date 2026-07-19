// Restaurant / venue open-now evaluation.
//
// OSM `opening_hours` strings are deceptively hard: comma-separated rule lists,
// `off`/`closed` overrides, `PH` (public holidays), date/season exceptions
// (`Jul 01-31 Sa-Su off`), additive late-night ranges, overnight spans. A
// hand-rolled parser kept shipping wrong "Open" badges (a July weekend-closed
// café showing open while Google said closed), so evaluation is delegated to
// the canonical `opening_hours` library, the same engine behind openinghours.io.
//
// Two things it does NOT do on its own that matter here:
//  1. Timezone — it reads a Date's LOCAL getters. On a tourist's non-FI phone
//     (or a UTC server) `new Date()` is the wrong wall-clock, so we feed it a
//     Helsinki-local Date built from Intl parts. Correct on every device.
//  2. Public holidays need a country — passed via the nominatim config below.
import OpeningHours from 'opening_hours'

// Helsinki, country_code 'fi' → the library loads Finnish public-holiday
// definitions (Vappu, Juhannus, Itsenäisyyspäivä, joulu, …) so `PH off` closes
// venues on real Finnish holidays.
const NOMINATIM = { lat: 60.1699, lon: 24.9384, address: { country_code: 'fi', state: 'Uusimaa' } }

// Parse once per unique string — construction is the expensive step, evaluation
// is cheap. null = genuinely unparseable (Finnish abbreviations "Pe-La", emails,
// typos) → callers hide the badge rather than guess.
const cache = new Map<string, OpeningHours | null>()

function parse(value: string): OpeningHours | null {
  const hit = cache.get(value)
  if (hit !== undefined) return hit
  let oh: OpeningHours | null
  try {
    oh = new OpeningHours(value, NOMINATIM)
  } catch {
    oh = null
  }
  cache.set(value, oh)
  return oh
}

/** Helsinki wall-clock as a locally-constructed Date. `opening_hours` reads a
 *  Date's local getters, so this makes evaluation correct regardless of the
 *  visitor's device timezone (or a UTC server if ever run there). */
export function helsinkiNow(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const g = (t: string) => Number(parts.find((x) => x.type === t)!.value)
  return new Date(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second') % 60)
}

/** true = open now, false = closed now, undefined = no/unparseable hours (hide badge). */
export function isOpenNow(hours?: string | null, now?: Date): boolean | undefined {
  if (!hours) return undefined
  const oh = parse(hours)
  if (!oh) return undefined
  try {
    return oh.getState(now ?? helsinkiNow())
  } catch {
    return undefined
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
// A close at exactly midnight is the end of THIS day → show "24:00", not the
// confusing "00:00"; overnight closes (02:00) keep their real time.
const hhmm = (d: Date) =>
  d.getHours() === 0 && d.getMinutes() === 0 ? '24:00' : `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Today's opening intervals in Helsinki, e.g. "11:00–22:00" or
 *  "11:00–14:00, 17:00–02:00". "24h" when open around the clock, null when
 *  closed today or unparseable. */
export function getTodayHours(hours?: string | null, now?: Date): string | null {
  if (!hours) return null
  if (hours.trim() === '24/7') return '24h'
  const oh = parse(hours)
  if (!oh) return null
  try {
    const n = now ?? helsinkiNow()
    const dayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0)
    const nextDay = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0)
    // Window starts 12 h BEFORE midnight so last night's overnight tail appears
    // as a pre-dayStart interval we can drop, and ends +34 h so a close after
    // midnight (e.g. 02:00) is captured whole. Keep only intervals that START
    // today → yesterday's carryover is excluded, tonight's 18:00–02:00 stays one row.
    const windowStart = new Date(dayStart.getTime() - 12 * 3600 * 1000)
    const windowEnd = new Date(dayStart.getTime() + 34 * 3600 * 1000)
    const intervals = oh.getOpenIntervals(windowStart, windowEnd)
      .filter(([from]) => from >= dayStart && from < nextDay)
    if (!intervals.length) return null
    // Open the entire day → "24h"
    if (intervals.length === 1 && intervals[0][0] <= dayStart && intervals[0][1] >= nextDay) return '24h'
    return intervals.map(([from, to]) => `${hhmm(from)}–${hhmm(to)}`).join(', ')
  } catch {
    return null
  }
}
