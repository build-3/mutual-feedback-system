import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import type { FeedbackSession } from "@/lib/types"

/**
 * Get the 2nd Tuesday of a given month.
 * The 2nd Tuesday falls between the 8th and 14th.
 */
export function getSecondTuesday(year: number, month: number): Date {
  // month is 0-indexed (0 = Jan)
  const date = new Date(year, month, 8) // start from 8th
  const dayOfWeek = date.getDay()
  // Tuesday = 2. Calculate offset to next Tuesday from day 8.
  const offset = (2 - dayOfWeek + 7) % 7
  return new Date(year, month, 8 + offset)
}

/**
 * Get today's date in IST using Intl (works on any server timezone).
 */
export function getISTDate(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00+05:30`)
}

/**
 * Check if a date is a 2nd Tuesday.
 */
export function isSecondTuesday(date: Date): boolean {
  if (date.getDay() !== 2) return false
  const day = date.getDate()
  return day >= 8 && day <= 14
}

/**
 * Check if tomorrow (IST) is a 2nd Tuesday — used by reminder cron (runs on Monday).
 */
export function isReminderDay(): boolean {
  const today = getISTDate()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return isSecondTuesday(tomorrow)
}

/**
 * Get the next upcoming 2nd Tuesday from today (IST).
 */
export function getNextSecondTuesday(): Date {
  const now = getISTDate()
  const year = now.getFullYear()
  const month = now.getMonth()

  // Check this month's 2nd Tuesday
  const thisMonth = getSecondTuesday(year, month)
  if (thisMonth >= now) return thisMonth

  // Otherwise next month
  const nextMonth = month === 11 ? 0 : month + 1
  const nextYear = month === 11 ? year + 1 : year
  return getSecondTuesday(nextYear, nextMonth)
}

/**
 * Format a Date as YYYY-MM-DD for session_date column.
 */
function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Idempotent: get or create a feedback_sessions row for the given date.
 */
export async function getOrCreateSession(sessionDate: Date): Promise<FeedbackSession> {
  const supabaseAdmin = getSupabaseAdmin()
  const dateStr = toDateString(sessionDate)

  const { data: existing } = await supabaseAdmin
    .from("feedback_sessions")
    .select("*")
    .eq("session_date", dateStr)
    .single()

  if (existing) return existing as FeedbackSession

  const { data: created, error } = await supabaseAdmin
    .from("feedback_sessions")
    .insert({ session_date: dateStr, status: "upcoming" })
    .select("*")
    .single()

  if (error) {
    // Race condition: another process created it
    const { data: retry } = await supabaseAdmin
      .from("feedback_sessions")
      .select("*")
      .eq("session_date", dateStr)
      .single()
    if (retry) return retry as FeedbackSession
    throw new Error(`Failed to create session for ${dateStr}: ${error.message}`)
  }

  return created as FeedbackSession
}

/**
 * Get the currently active session (within ±2 days of a 2nd Tuesday).
 * Returns null if no session is active.
 */
export async function getActiveSession(): Promise<FeedbackSession | null> {
  const now = getISTDate()
  const year = now.getFullYear()
  const month = now.getMonth()
  const secondTuesday = getSecondTuesday(year, month)

  const diffDays = Math.abs(
    (now.getTime() - secondTuesday.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Active window: 2nd Tuesday ± 2 days (Mon before through Thu after)
  if (diffDays > 2) return null

  const supabaseAdmin = getSupabaseAdmin()
  const dateStr = toDateString(secondTuesday)

  const { data } = await supabaseAdmin
    .from("feedback_sessions")
    .select("*")
    .eq("session_date", dateStr)
    .single()

  return (data as FeedbackSession) ?? null
}

/**
 * Calculate which session number this is for an intern (1, 2, 3, ...).
 * Based on how many 2nd Tuesdays have passed since their join date.
 */
export function calculateSessionNumber(
  internJoinDate: string | Date,
  sessionDate: string | Date
): number {
  const join = new Date(internJoinDate)
  const session = new Date(sessionDate)

  let count = 0
  const current = new Date(join.getFullYear(), join.getMonth(), 1)

  while (current <= session) {
    const secondTues = getSecondTuesday(current.getFullYear(), current.getMonth())
    if (secondTues >= join && secondTues <= session) {
      count++
    }
    current.setMonth(current.getMonth() + 1)
  }

  return count
}

/**
 * Generate session_assignments: pairs every active probation intern
 * with every full-timer/admin as a reviewer.
 * Idempotent — skips existing assignments.
 */
export async function generateSessionAssignments(sessionId: string): Promise<number> {
  const supabaseAdmin = getSupabaseAdmin()

  // Get active probation interns
  const { data: probations } = await supabaseAdmin
    .from("probation_tracking")
    .select("employee_id")
    .in("probation_status", ["active", "extended"])

  if (!probations || probations.length === 0) return 0

  const internIds = probations.map((p) => p.employee_id)

  // Get full-timers and admins (potential reviewers)
  const { data: reviewers } = await supabaseAdmin
    .from("employees")
    .select("id")
    .in("role", ["full_timer", "admin"])

  if (!reviewers || reviewers.length === 0) return 0

  // Check existing assignments for this session
  const { data: existing } = await supabaseAdmin
    .from("session_assignments")
    .select("intern_id, reviewer_id")
    .eq("session_id", sessionId)

  const existingSet = new Set(
    (existing ?? []).map((a) => `${a.intern_id}-${a.reviewer_id}`)
  )

  // Build new assignments (skip self-review, skip existing)
  const newAssignments: { session_id: string; intern_id: string; reviewer_id: string }[] = []
  for (const internId of internIds) {
    for (const reviewer of reviewers) {
      if (reviewer.id === internId) continue // intern can't review themselves
      const key = `${internId}-${reviewer.id}`
      if (existingSet.has(key)) continue
      newAssignments.push({
        session_id: sessionId,
        intern_id: internId,
        reviewer_id: reviewer.id,
      })
    }
  }

  if (newAssignments.length === 0) return 0

  const { error } = await supabaseAdmin
    .from("session_assignments")
    .insert(newAssignments)

  if (error) {
    console.error("[session-utils] Failed to generate assignments:", error)
    return 0
  }

  return newAssignments.length
}
