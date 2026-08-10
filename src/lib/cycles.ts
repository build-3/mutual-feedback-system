/**
 * Cycle math — the single source of truth for "which period is this?".
 *
 * A cycle runs from the 2nd Tuesday of month M up to (but not including) the
 * 2nd Tuesday of month M+1. Half-open: [start, end). The session happens on the
 * opening Tuesday, so a cycle *starts* on its session and fills up afterwards.
 * On the next 2nd Tuesday the window resets and legitimately reads zero until
 * someone submits — that is intended, not a bug, and there is deliberately no
 * fallback to the previous cycle.
 *
 * Boundaries are IST (Asia/Kolkata) midnight.
 *
 * WHY NO TIMEZONE LIBRARY: India is a fixed +05:30 offset and has never observed
 * DST, so IST midnight is exactly `Date.UTC(y, m, d) - IST_OFFSET_MS`. That makes
 * the whole module pure integer arithmetic with no ICU/zone-data dependency. The
 * previous approach (session-utils' getISTDate) round-tripped through
 * Intl.DateTimeFormat, which needs a full-ICU Node build; `istParts` replaces it
 * and cycles.test.ts cross-checks the two agree over thousands of instants.
 *
 * THE ONE RULE: never call .getMonth() / .getDate() / .getDay() / .getFullYear()
 * in this file. Those read the *host* timezone, which is IST on dev machines and
 * UTC on the Coolify host — the exact discrepancy that already caused one
 * off-by-one bug (see the comment in session-utils.ts). All comparisons happen in
 * epoch milliseconds; all calendar arithmetic goes through getUTC* on a
 * Date.UTC-constructed instant, which is pure calendar math and host-TZ-proof.
 *
 * Every function takes `at = Date.now()` rather than reading the clock, so tests
 * and the reset smoke test can inject an instant.
 */

import type { DateRange } from "./brand"

/** 5h30m. Fixed since 1945; India has never observed DST. */
export const IST_OFFSET_MS = 19_800_000

const DAY_MS = 86_400_000

/** Tuesday, in the 0=Sunday numbering getUTCDay() returns. */
const TUESDAY = 2

const MONTHS_SHORT = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
]

/**
 * IST calendar date of the cycle's opening 2nd Tuesday, as "YYYY-MM-DD".
 * Deliberately the same shape as feedback_sessions.session_date so cycles and
 * sessions share one key space, and lexicographic sort == chronological sort.
 */
export type CycleKey = string

export type Cycle = {
  key: CycleKey
  /** IST midnight on the opening 2nd Tuesday, inclusive. */
  startMs: number
  /** IST midnight on the next 2nd Tuesday, EXCLUSIVE. */
  endMs: number
  /** startMs as an ISO string — feed straight to a Supabase .gte(). */
  startIso: string
  /** endMs as an ISO string — feed straight to a Supabase .lt(). */
  endIso: string
  /** Human label, e.g. "14 jul – 10 aug". End is rendered inclusive. */
  label: string
}

export type CycleWindow = {
  startMs: number
  endMs: number
  startIso: string
  endIso: string
}

export type IstParts = {
  year: number
  /** 1-based, so 8 = August. */
  month: number
  day: number
}

/** Normalise an out-of-range 1-based month into a valid (year, month) pair. */
function normMonth(year: number, month: number): { year: number; month: number } {
  if (month < 1) return { year: year - 1, month: month + 12 }
  if (month > 12) return { year: year + 1, month: month - 12 }
  return { year, month }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * IST civil date components of an instant. Shifting the instant by the fixed
 * offset and then reading UTC parts is exact for a fixed-offset zone.
 */
export function istParts(at: number = Date.now()): IstParts {
  const shifted = new Date(at + IST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/** Epoch ms of IST midnight on a given IST calendar date. */
export function istMidnightMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) - IST_OFFSET_MS
}

/** "YYYY-MM-DD" from integer components. Never touches a Date. */
export function istDateKey(year: number, month: number, day: number): CycleKey {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/**
 * Day-of-month of the 2nd Tuesday. Always lands in [8, 14]: start from the 8th
 * and walk forward to the next Tuesday. The weekday of a (y, m, d) triple is the
 * same whichever zone you name it in, so computing it in UTC is host-TZ-proof.
 */
function secondTuesdayDayOfMonth(year: number, month: number): number {
  const dow = new Date(Date.UTC(year, month - 1, 8)).getUTCDay()
  return 8 + ((TUESDAY - dow + 7) % 7)
}

/** Epoch ms of IST midnight on the 2nd Tuesday of the given month. */
export function secondTuesdayIstMs(year: number, month: number): number {
  return istMidnightMs(year, month, secondTuesdayDayOfMonth(year, month))
}

/** "YYYY-MM-DD" of the 2nd Tuesday of the given month. */
export function secondTuesdayKey(year: number, month: number): CycleKey {
  return istDateKey(year, month, secondTuesdayDayOfMonth(year, month))
}

function buildCycle(year: number, month: number): Cycle {
  // Boundary is the REMINDER day (the day before the session), not the session
  // itself. The reminder cron fires when tomorrow is a 2nd Tuesday and asks
  // people to reflect "before we meet" — with the boundary on the session day,
  // that reminder was evaluated against the window opened by the *previous*
  // session, so anyone who reflected at that session was suppressed (18 people,
  // 16 of them for exactly this reason). Rolling over on reminder day also puts
  // a reflection written in response to the message and the feedback given at
  // the session into the SAME window, instead of expiring it at midnight in
  // between.
  const startMs = secondTuesdayIstMs(year, month) - DAY_MS
  const next = normMonth(year, month + 1)
  const endMs = secondTuesdayIstMs(next.year, next.month) - DAY_MS

  // Label the last *included* day, not the exclusive bound — "13 jul – 9 aug"
  // reads correctly where "13 jul – 10 aug" would imply the 10th is in scope.
  const lastDay = istParts(endMs - DAY_MS)
  const first = istParts(startMs)

  return {
    // Still the 2nd Tuesday — the key shares a space with
    // feedback_sessions.session_date, so only the window moved, not the key.
    key: secondTuesdayKey(year, month),
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    label: `${first.day} ${MONTHS_SHORT[first.month - 1]} – ${lastDay.day} ${MONTHS_SHORT[lastDay.month - 1]}`,
  }
}

/**
 * The cycle containing `at`.
 *
 * Only one month of lookback is ever needed: if `at` is before this month's 2nd
 * Tuesday, then `at >= the 1st of M > the last day of M-1 >= 2ndTue(M-1)`,
 * because the 2nd Tuesday always falls on the 8th-14th. So `at` is
 * unconditionally inside [2ndTue(M-1), 2ndTue(M)). Holds across Feb and Dec→Jan.
 */
export function cycleFor(at: number = Date.now()): Cycle {
  const { year, month } = istParts(at)
  const thisMonthsBoundary = secondTuesdayIstMs(year, month) - DAY_MS
  const base = at >= thisMonthsBoundary ? { year, month } : normMonth(year, month - 1)
  return buildCycle(base.year, base.month)
}

/** Alias that reads better at call sites. */
export function currentCycle(at: number = Date.now()): Cycle {
  return cycleFor(at)
}

/**
 * Rebuild a cycle from its key. Returns null for anything that is not a
 * well-formed date — callers must not let a bad key become a NaN window, since
 * every comparison against NaN is false and would silently filter out
 * everything while looking like a success.
 */
export function cycleFromKey(key: string): Cycle | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return null
  // A cycle key is by definition a 2nd Tuesday; anything else is not a cycle.
  if (day !== secondTuesdayDayOfMonth(year, month)) return null
  return buildCycle(year, month)
}

/** Shift by whole cycles. Negative goes back in time. */
export function shiftCycle(cycle: Cycle, delta: number): Cycle {
  const { year, month } = istParts(cycle.startMs)
  const target = normMonth(year, month + delta)
  return buildCycle(target.year, target.month)
}

/** Which cycle a stored timestamp belongs to. */
export function cycleKeyOf(createdAtIso: string): CycleKey {
  return cycleFor(Date.parse(createdAtIso)).key
}

export function isInCycle(createdAtIso: string, cycle: Cycle): boolean {
  const t = Date.parse(createdAtIso)
  return t >= cycle.startMs && t < cycle.endMs
}

/**
 * The window a DateRange selects, or null for all-time.
 *
 * `cycleKey` picks a specific historical cycle; it is ignored for "all" and for
 * "3cycles". An unparseable key falls back to the current cycle rather than
 * producing a NaN window.
 */
export function resolveWindow(
  range: DateRange,
  cycleKey?: string | null,
  at: number = Date.now()
): CycleWindow | null {
  if (range === "all") return null

  const anchor = (cycleKey ? cycleFromKey(cycleKey) : null) ?? cycleFor(at)

  if (range === "cycle") {
    return {
      startMs: anchor.startMs,
      endMs: anchor.endMs,
      startIso: anchor.startIso,
      endIso: anchor.endIso,
    }
  }

  // "3cycles" — the anchor cycle plus the two before it. Cycle-aligned, so the
  // numbers stop drifting day to day the way a rolling 3-month cutoff did.
  const first = shiftCycle(anchor, -2)
  return {
    startMs: first.startMs,
    endMs: anchor.endMs,
    startIso: first.startIso,
    endIso: anchor.endIso,
  }
}

/** Cycles from the one containing `fromMs` up to the current one, newest first. */
export function listCyclesSince(fromMs: number, at: number = Date.now()): Cycle[] {
  const oldest = cycleFor(fromMs)
  const out: Cycle[] = []
  let cursor = cycleFor(at)
  // Bounded so a bad `fromMs` can never spin forever.
  for (let i = 0; i < 600 && cursor.startMs >= oldest.startMs; i++) {
    out.push(cursor)
    cursor = shiftCycle(cursor, -1)
  }
  return out
}

/**
 * The next 2nd Tuesday at or after `at`, in epoch ms.
 *
 * Preserves session-utils' getNextSecondTuesday semantics exactly: on the 2nd
 * Tuesday itself it returns *today*, not next month. session-reminder feeds this
 * to getOrCreateSession, so it decides what session_date gets written.
 */
export function upcomingSecondTuesdayMs(at: number = Date.now()): number {
  // Computed straight from the calendar rather than off cycle.startMs/endMs:
  // the cycle window now opens the day BEFORE the session, so deriving the
  // session date from the window would report the wrong Tuesday.
  const p = istParts(at)
  const secondTuesday = secondTuesdayDayOfMonth(p.year, p.month)
  if (p.day <= secondTuesday) return istMidnightMs(p.year, p.month, secondTuesday)
  const next = normMonth(p.year, p.month + 1)
  return secondTuesdayIstMs(next.year, next.month)
}

/** Whether the given IST calendar date is a 2nd Tuesday. */
export function isSecondTuesdayIst(year: number, month: number, day: number): boolean {
  return day === secondTuesdayDayOfMonth(year, month)
}

const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]

const MONTHS_TITLE = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * "Tuesday, 11 Aug" from a YYYY-MM-DD IST date key.
 *
 * Formats from the integer components rather than handing an instant to
 * toLocaleDateString, which would read host-local parts off an IST midnight and
 * print the wrong day on a UTC host.
 */
export function formatSessionDateLabel(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return dateKey
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const weekday = WEEKDAYS_LONG[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${weekday}, ${day} ${MONTHS_TITLE[month - 1]}`
}
