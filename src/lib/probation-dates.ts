/**
 * Probation date arithmetic, done in UTC on calendar dates.
 *
 * probation.ts has `addMonthsToDate`, which builds local-midnight Dates and
 * reads them back through `toISOString()`. That is only right when the host is
 * UTC: on an IST machine local midnight is the previous UTC day and the stored
 * date comes out one day early. Anything that sets a joining date by hand must
 * not depend on where the code happens to run, so these helpers never touch
 * local time.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Earliest joining date accepted; anything older is a typo, not a person. */
export const MIN_JOINING_DATE = "2015-01-01"

/** How far ahead a joining date may sit (someone starting next week is real). */
export const MAX_DAYS_AHEAD = 60

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false
  const m = ISO_DATE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

function toIso(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

/** Today's calendar date in UTC, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return toIso(now)
}

/**
 * Add whole months to a calendar date, clamping to the last day of the target
 * month (31 Jan + 1 month = 28/29 Feb), the same rule probation.ts applies.
 */
export function addMonthsIso(startIso: string, months: number): string {
  if (!isValidIsoDate(startIso)) throw new Error(`Invalid date: ${startIso}`)
  const [y, mo, d] = startIso.split("-").map(Number)
  const target = new Date(Date.UTC(y, mo - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return toIso(target)
}

export type JoiningDateCheck = { ok: true; date: string } | { ok: false; error: string }

/** Validate a hand-entered joining date. Never guesses or coerces. */
export function checkJoiningDate(value: unknown, now: Date = new Date()): JoiningDateCheck {
  if (!isValidIsoDate(value)) {
    return { ok: false, error: "Joining date must be a real date in YYYY-MM-DD form." }
  }
  if (value < MIN_JOINING_DATE) {
    return { ok: false, error: `Joining date cannot be before ${MIN_JOINING_DATE}.` }
  }
  const latest = new Date(now)
  latest.setUTCDate(latest.getUTCDate() + MAX_DAYS_AHEAD)
  if (value > toIso(latest)) {
    return { ok: false, error: `Joining date cannot be more than ${MAX_DAYS_AHEAD} days ahead.` }
  }
  return { ok: true, date: value }
}

/** Whole days from `fromIso` to `toIsoDate` (negative when already past). */
export function daysBetweenIso(fromIso: string, toIsoDate: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`)
  const b = Date.parse(`${toIsoDate}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}
