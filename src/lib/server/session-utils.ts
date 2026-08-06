import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import type { FeedbackSession } from "@/lib/types"
import {
  isSecondTuesdayIst,
  istDateKey,
  istMidnightMs,
  istParts,
  secondTuesdayIstMs,
  secondTuesdayKey,
  upcomingSecondTuesdayMs,
} from "@/lib/cycles"

/**
 * Session helpers. All date arithmetic lives in src/lib/cycles.ts, which is
 * client-safe and host-timezone-proof; this file is only the server-side adapter
 * that talks to feedback_sessions.
 *
 * Removed in the cycle migration — every one of them read host-local date parts
 * and so was wrong on the UTC Coolify host:
 *   - getSecondTuesday, getISTDate  → superseded by cycles.ts
 *   - isSecondTuesday, calculateSessionNumber → dead code, no importers
 *   - toDateString → the dangerous one. It read host-local Y/M/D off whatever
 *     Date it was handed, so on a UTC host it would write session_date
 *     "2026-08-10" for the 2026-08-11 session. With UNIQUE INDEX idx_session_date
 *     that silently forks session identity: a duplicate row, assignments split
 *     across two session_ids, and getActiveSession unable to find the row the
 *     cron created. Session dates are now formatted from integers via istDateKey
 *     and never round-trip through a Date.
 */

/** Tomorrow (IST) is a 2nd Tuesday — used by the reminder cron, which runs Monday. */
export function isReminderDay(at: number = Date.now()): boolean {
  const p = istParts(at + 24 * 60 * 60 * 1000)
  return isSecondTuesdayIst(p.year, p.month, p.day)
}

/**
 * The next upcoming 2nd Tuesday (IST) as a YYYY-MM-DD session key.
 *
 * Returns *today* when today is the 2nd Tuesday — session-reminder feeds this
 * straight to getOrCreateSession, so it decides what session_date gets written.
 */
export function getNextSessionDate(at: number = Date.now()): string {
  const p = istParts(upcomingSecondTuesdayMs(at))
  return istDateKey(p.year, p.month, p.day)
}

/**
 * Idempotent: get or create a feedback_sessions row for the given session date.
 *
 * Takes the date as a YYYY-MM-DD string, not a Date — the old signature accepted
 * a Date and derived the string with host-local getters, which is how the UTC-host
 * off-by-one could reach the unique index.
 */
export async function getOrCreateSession(dateStr: string): Promise<FeedbackSession> {
  const supabaseAdmin = getSupabaseAdmin()

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
export async function getActiveSession(at: number = Date.now()): Promise<FeedbackSession | null> {
  // Compare IST *midnight* against the 2nd Tuesday's IST midnight, not the raw
  // instant. Comparing an instant against a midnight yields fractional days and
  // would shift the ±2-day window by up to a day at both edges.
  const p = istParts(at)
  const istMidnightToday = istMidnightMs(p.year, p.month, p.day)
  const secondTuesdayMs = secondTuesdayIstMs(p.year, p.month)

  const diffDays = Math.abs(
    (istMidnightToday - secondTuesdayMs) / (1000 * 60 * 60 * 24)
  )

  // Active window: 2nd Tuesday ± 2 days (Mon before through Thu after)
  if (diffDays > 2) return null

  const supabaseAdmin = getSupabaseAdmin()
  const dateStr = secondTuesdayKey(p.year, p.month)

  const { data } = await supabaseAdmin
    .from("feedback_sessions")
    .select("*")
    .eq("session_date", dateStr)
    .single()

  return (data as FeedbackSession) ?? null
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
    .in("status", ["active", "extended"])

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
