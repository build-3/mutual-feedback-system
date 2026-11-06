/**
 * The "too few reviews" alert: a probationer is nearing the end of probation
 * and fewer than MIN_FULL_TIMERS full-time teammates have given them feedback,
 * so the sponsor has little to base the probation conversation on.
 *
 * What is counted (Arjun, 6 Nov: "less than 3 full timers"): DISTINCT
 * full-time teammates who gave this person feedback during their probation.
 * Three reviews from one person is one full-timer. Feedback from someone on
 * probation does not count. Admins count as full-time.
 *
 * WINDOW_DAYS = 30 is an assumption: no timing was given, so the check runs in
 * the final month of probation (month 3 of a 3-month probation, the case
 * Charlez described). Change it here and nothing else needs to move.
 */

import { daysBetweenIso } from "./probation-dates"

export const REVIEW_GAP_CONFIG = {
  /** Fewer than this many distinct full-time reviewers raises the alert. */
  minFullTimers: 3,
  /** The alert applies from this many days before the end date, and after it. */
  windowDays: 30,
  /** At most one alert per person per this many days. */
  repeatEveryDays: 7,
} as const

/** Roles that count as full-time for this rule. */
export function isFullTimeRole(role: string | null | undefined): boolean {
  return role === "full_timer" || role === "admin"
}

/**
 * Distinct full-time reviewers among the submissions about one person. A
 * reviewer unknown to `rolesById` is not counted: no guessing.
 */
export function countFullTimeReviewers(
  submissions: { submitted_by_id: string }[],
  rolesById: Map<string, string>,
  subjectId?: string
): number {
  const people = new Set<string>()
  for (const s of submissions) {
    if (subjectId && s.submitted_by_id === subjectId) continue
    if (isFullTimeRole(rolesById.get(s.submitted_by_id))) people.add(s.submitted_by_id)
  }
  return people.size
}

export type GapInput = {
  status: string
  fullTimeReviewers: number
  /** YYYY-MM-DD */
  endDate: string
  /** YYYY-MM-DD, today in UTC */
  today: string
}

export type GapDecision =
  | { alert: false; reason: string }
  | { alert: true; daysLeft: number }

export function decideReviewGap(
  { status, fullTimeReviewers, endDate, today }: GapInput,
  config: { minFullTimers: number; windowDays: number } = REVIEW_GAP_CONFIG
): GapDecision {
  if (status !== "active" && status !== "extended") {
    return { alert: false, reason: "probation is not open" }
  }
  if (fullTimeReviewers >= config.minFullTimers) {
    return { alert: false, reason: "enough full-time reviewers" }
  }
  const daysLeft = daysBetweenIso(today, endDate)
  if (daysLeft > config.windowDays) {
    return { alert: false, reason: "not yet in the final stretch" }
  }
  return { alert: true, daysLeft }
}

/** Plain words for how far off the end date is. */
export function describeDaysLeft(daysLeft: number): string {
  if (daysLeft < 0) {
    const n = -daysLeft
    return `their probation ended ${n} day${n === 1 ? "" : "s"} ago`
  }
  if (daysLeft === 0) return "their probation ends today"
  return `their probation ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
}

function reviewersPhrase(n: number): string {
  if (n === 0) return "no feedback from a full-time teammate yet"
  return `feedback from only ${n} full-time teammate${n === 1 ? "" : "s"} so far`
}

export function buildReviewGapText({
  sponsorName,
  candidateName,
  fullTimeReviewers,
  daysLeft,
  minFullTimers = REVIEW_GAP_CONFIG.minFullTimers,
  url,
}: {
  sponsorName: string
  candidateName: string
  fullTimeReviewers: number
  daysLeft: number
  minFullTimers?: number
  url: string
}): string {
  return (
    `Hello ${sponsorName} - ${candidateName}, who you sponsor, has ${reviewersPhrase(fullTimeReviewers)} and ${describeDaysLeft(daysLeft)}.\n\n` +
    `Feedback from fewer than ${minFullTimers} full-time teammates gives you little to base the probation conversation on. ` +
    `Ask full-time teammates who have worked with them to share feedback, then see where things stand: ${url}`
  )
}

export function buildReviewGapNoSponsorText({
  candidateName,
  fullTimeReviewers,
  daysLeft,
  minFullTimers = REVIEW_GAP_CONFIG.minFullTimers,
  url,
}: {
  candidateName: string
  fullTimeReviewers: number
  daysLeft: number
  minFullTimers?: number
  url: string
}): string {
  return (
    `${candidateName} has ${reviewersPhrase(fullTimeReviewers)} and ${describeDaysLeft(daysLeft)}, ` +
    `but no sponsor is recorded, so nobody owns the probation conversation.\n\n` +
    `Feedback from fewer than ${minFullTimers} full-time teammates is too little to decide on. ` +
    `Assign a sponsor (admin page, sponsors tab): ${url}`
  )
}
