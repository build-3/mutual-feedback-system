/**
 * Which column of the probation board someone sits in.
 *
 * The three stages are the ones Charlez named: under probation, eligible for
 * review, full time. "Eligible for review" is the final stretch before the end
 * date and everything after it, so someone overdue is not hidden in the first
 * column. The window is the same 30 days the review-gap alert uses.
 */

import { REVIEW_GAP_CONFIG } from "./review-gap"
import { daysBetweenIso } from "./probation-dates"

export type ProbationStage = "under_probation" | "eligible_for_review" | "full_time"

/** How long a confirmed full-timer stays on the board. */
export const CONFIRMED_VISIBLE_DAYS = 90

export function probationStage({
  status,
  endDate,
  promotedAt,
  today,
}: {
  status: string
  /** YYYY-MM-DD */
  endDate: string
  /** ISO timestamp, set when status is promoted */
  promotedAt: string | null
  /** YYYY-MM-DD */
  today: string
}): ProbationStage | null {
  if (status === "promoted") {
    if (!promotedAt) return "full_time"
    const days = daysBetweenIso(promotedAt.slice(0, 10), today)
    return days <= CONFIRMED_VISIBLE_DAYS ? "full_time" : null
  }
  if (status !== "active" && status !== "extended") return null
  return daysBetweenIso(today, endDate) <= REVIEW_GAP_CONFIG.windowDays
    ? "eligible_for_review"
    : "under_probation"
}

/**
 * "Month 2 of 3". Counted from the start date, capped at the period so an
 * overdue person reads "month 3 of 3" with an overdue flag beside it, never
 * "month 5 of 3".
 */
export function probationMonth({
  startDate,
  today,
  durationMonths,
}: {
  startDate: string
  today: string
  durationMonths: number
}): { month: number; of: number } {
  const days = Math.max(0, daysBetweenIso(startDate, today))
  const month = Math.floor(days / 30.4375) + 1
  return { month: Math.min(month, durationMonths), of: durationMonths }
}
