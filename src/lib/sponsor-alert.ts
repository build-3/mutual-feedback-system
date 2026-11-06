/**
 * The sponsor alert: when someone on probation receives feedback that carries a
 * low-trust signal, their sponsor is told, because the end-of-probation
 * conversation is between the sponsor and the candidate, not leadership.
 *
 * "Low" is NOT a number chosen here. It reuses the form's own line,
 * TRUST_DETAIL_REQUIRED_BELOW (85): the one place the product already says a
 * trust score is low enough that a bare number is not acceptable and the giver
 * must explain it. If Arjun or Charlez want a different line, change
 * SPONSOR_ALERT_CONFIG; nothing else needs to move.
 *
 * "Insufficient feedback" (too few reviews by month N) is deliberately not
 * here: it needs numbers nobody has given yet.
 *
 * The buddy is never alerted. The buddy helps someone settle in and is not part
 * of the probation conversation.
 */

import { TRUST_DETAIL_REQUIRED_BELOW } from "./questions"

export const SPONSOR_ALERT_CONFIG = {
  /** A trust battery strictly below this raises an alert. */
  trustBelow: TRUST_DETAIL_REQUIRED_BELOW,
} as const

export type AnswerLike = { question_key: string; answer_value: string }

export type FeedbackSignal =
  | { negative: false }
  | { negative: true; reason: string; trust: number }

/** Read the trust battery out of a submission's answers, or null if absent. */
export function readTrust(answers: AnswerLike[]): number | null {
  const row = answers.find((a) => a.question_key === "trust_battery")
  if (!row) return null
  const n = Number(String(row.answer_value).trim())
  return Number.isFinite(n) ? n : null
}

export function classifyFeedbackSignal(
  answers: AnswerLike[],
  config: { trustBelow: number } = SPONSOR_ALERT_CONFIG
): FeedbackSignal {
  const trust = readTrust(answers)
  if (trust === null) return { negative: false }
  if (trust < config.trustBelow) {
    return {
      negative: true,
      trust,
      reason: `a trust score of ${trust}% (the form asks for an explanation below ${config.trustBelow}%)`,
    }
  }
  return { negative: false }
}

export function buildSponsorAlertText({
  sponsorName,
  candidateName,
  reason,
  url,
}: {
  sponsorName: string
  candidateName: string
  reason: string
  url: string
}): string {
  return (
    `Hello ${sponsorName} - ${candidateName}, who you sponsor, just received feedback with ${reason}.\n\n` +
    `As their sponsor, the probation conversation is yours. Read it here: ${url}`
  )
}

/** Sent to the probation reviewers when a probationer has no sponsor on record. */
export function buildNoSponsorText({
  candidateName,
  reason,
  url,
}: {
  candidateName: string
  reason: string
  url: string
}): string {
  return (
    `${candidateName} just received feedback with ${reason}, but no sponsor is recorded for them, ` +
    `so nobody owns the probation conversation yet.\n\nAssign a sponsor, then read the feedback: ${url}`
  )
}
