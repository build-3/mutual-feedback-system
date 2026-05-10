import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import { calculateSessionNumber } from "./session-utils"

export const CEO_EMAIL = process.env.CEO_EMAIL ?? "at@build3.org"

const RATING_KEYS = new Set([
  "recommend_rating",
  "teal_self_management",
  "teal_wholeness",
  "teal_evolutionary_purpose",
  "purpose_alignment",
  "itp_humble",
  "itp_hungry",
  "itp_smart",
])

const READABLE_LABELS: Record<string, string> = {
  recommend_rating: "Recommendation",
  teal_self_management: "Self-management",
  teal_wholeness: "Wholeness",
  teal_evolutionary_purpose: "Evolutionary purpose",
  purpose_alignment: "Purpose alignment",
  itp_humble: "Humility",
  itp_hungry: "Drive & hunger",
  itp_smart: "People smarts",
}

const CONTRIBUTION_LABELS: Record<string, string> = {
  A: "Finding their feet",
  B: "Contributing with guidance",
  C: "Independent contributor",
  D: "Strong independent contributor",
  E: "Team lead potential",
}

function readableKey(key: string): string {
  return READABLE_LABELS[key] ?? key.replace(/_/g, " ")
}

function readableContribution(level: string | null): string | null {
  if (!level) return null
  return CONTRIBUTION_LABELS[level] ?? level
}

export type ProbationStanding = {
  employeeName: string
  feedbackFromFullTimers: number
  totalFeedbackCount: number
  requiredFeedbackCount: number
  averageScore: number | null
  lowScoreKeys: string[]
  contributionLevel: string | null
  contributionLabel: string | null
  issues: string[]
  ceoSummary: string[]
}

export type SessionBreakdown = {
  sessionNumber: number
  sessionDate: string
  feedbackCount: number
  fullTimerFeedbackCount: number
  averageScore: number | null
  contributionLevel: string | null
  contributionLabel: string | null
  reviewerNames: string[]
}

export type EnhancedProbationStanding = ProbationStanding & {
  sessions: SessionBreakdown[]
  trend: "improving" | "steady" | "declining" | "insufficient_data"
  currentSessionNumber: number | null
  totalExpectedSessions: number
}

export async function analyzeProbationStanding(
  employeeId: string,
  employeeName: string
): Promise<ProbationStanding> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: submissions } = await supabaseAdmin
    .from("feedback_submissions")
    .select("id, submitted_by_id, feedback_type")
    .eq("feedback_for_id", employeeId)
    .in("feedback_type", ["intern", "full_timer"])

  const allSubmissions = submissions ?? []
  const submitterIds = allSubmissions.map((s) => s.submitted_by_id)

  let fullTimerSubmissionIds: string[] = []
  let fullTimerCount = 0
  if (submitterIds.length > 0) {
    const { data: submitters } = await supabaseAdmin
      .from("employees")
      .select("id, role")
      .in("id", submitterIds)

    const ftIds = new Set(
      (submitters ?? []).filter((e) => e.role === "full_timer" || e.role === "admin").map((e) => e.id)
    )
    const ftSubmissions = allSubmissions.filter((s) => ftIds.has(s.submitted_by_id))
    fullTimerCount = ftSubmissions.length
    fullTimerSubmissionIds = ftSubmissions.map((s) => s.id)
  }

  const scores: number[] = []
  const lowScoreSet = new Set<string>()
  const contributionVotes: string[] = []

  // Only analyze scores from full-timer submissions
  const idsToAnalyze = fullTimerSubmissionIds.length > 0 ? fullTimerSubmissionIds : []
  if (idsToAnalyze.length > 0) {
    const { data: answers } = await supabaseAdmin
      .from("feedback_answers")
      .select("question_key, answer_value")
      .in("submission_id", idsToAnalyze)

    for (const ans of answers ?? []) {
      if (RATING_KEYS.has(ans.question_key)) {
        const val = parseFloat(ans.answer_value)
        if (!isNaN(val)) {
          scores.push(val)
          if (val < 4) {
            lowScoreSet.add(ans.question_key)
          }
        }
      }
      if (ans.question_key === "contribution_level" && ans.answer_value) {
        contributionVotes.push(ans.answer_value)
      }
    }
  }

  const lowScoreKeys = Array.from(lowScoreSet)

  // Use most common contribution level (mode), fallback to latest
  let contributionLevel: string | null = null
  if (contributionVotes.length > 0) {
    const freq = new Map<string, number>()
    for (const v of contributionVotes) {
      freq.set(v, (freq.get(v) ?? 0) + 1)
    }
    let maxCount = 0
    freq.forEach((count, level) => {
      if (count > maxCount) {
        maxCount = count
        contributionLevel = level
      }
    })
  }

  const averageScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : null

  const issues: string[] = []
  const ceoSummary: string[] = []

  if (fullTimerCount < 3) {
    issues.push(
      `You have ${fullTimerCount} feedback${fullTimerCount !== 1 ? "s" : ""} from full-timers — you need at least 3. Collaborate with more full-timers and ask them to fill in your feedback.`
    )
    ceoSummary.push(`Only ${fullTimerCount}/3 full-timer feedbacks received`)
  }

  if (averageScore !== null && averageScore < 4) {
    issues.push(
      `Your average score is ${averageScore}/5 — the bar is 4+. Check your feedback for specifics and talk to your sponsor about where to improve.`
    )
    ceoSummary.push(`Average score ${averageScore}/5 (below 4.0 threshold)`)
  }

  if (lowScoreKeys.length > 0) {
    const readable = lowScoreKeys.map(readableKey).join(", ")
    issues.push(
      `Scores below 4 in: ${readable}. These are the specific areas to focus on.`
    )
    ceoSummary.push(`Below threshold in: ${readable}`)
  }

  if (contributionLevel === "A" || contributionLevel === "B") {
    const label = readableContribution(contributionLevel) ?? contributionLevel
    issues.push(
      `Your contribution level is "${label}". The expectation is independent contribution or higher by the end of probation.`
    )
    ceoSummary.push(`Contribution level: ${label} (needs improvement)`)
  }

  if (issues.length === 0 && fullTimerCount >= 3 && averageScore !== null && averageScore >= 4) {
    ceoSummary.push("All metrics look good — meets threshold for conversion")
  }

  return {
    employeeName,
    feedbackFromFullTimers: fullTimerCount,
    totalFeedbackCount: allSubmissions.length,
    requiredFeedbackCount: 3,
    averageScore,
    lowScoreKeys,
    contributionLevel,
    contributionLabel: readableContribution(contributionLevel),
    issues,
    ceoSummary,
  }
}

export async function analyzeEnhancedProbationStanding(
  employeeId: string,
  employeeName: string,
  joinDate: string
): Promise<EnhancedProbationStanding> {
  const base = await analyzeProbationStanding(employeeId, employeeName)
  const supabaseAdmin = getSupabaseAdmin()

  // Get all session-tagged submissions for this employee
  const { data: submissions } = await supabaseAdmin
    .from("feedback_submissions")
    .select("id, submitted_by_id, session_id, feedback_type")
    .eq("feedback_for_id", employeeId)
    .in("feedback_type", ["intern", "full_timer"])
    .not("session_id", "is", null)

  const allSubs = submissions ?? []

  if (allSubs.length === 0) {
    return {
      ...base,
      sessions: [],
      trend: "insufficient_data",
      currentSessionNumber: null,
      totalExpectedSessions: 3,
    }
  }

  // Get session details
  const sessionIds = Array.from(new Set(allSubs.map((s) => s.session_id).filter(Boolean))) as string[]
  const { data: sessions } = await supabaseAdmin
    .from("feedback_sessions")
    .select("id, session_date")
    .in("id", sessionIds)
    .order("session_date", { ascending: true })

  const sessionMap = new Map<string, string>()
  for (const s of sessions ?? []) {
    sessionMap.set(s.id, s.session_date)
  }

  // Get submitter roles
  const submitterIds = Array.from(new Set(allSubs.map((s) => s.submitted_by_id)))
  const { data: submitters } = await supabaseAdmin
    .from("employees")
    .select("id, name, role")
    .in("id", submitterIds)

  const submitterInfo = new Map<string, { name: string; role: string }>()
  for (const s of submitters ?? []) {
    submitterInfo.set(s.id, { name: s.name, role: s.role })
  }

  // Get all answers for these submissions
  const subIds = allSubs.map((s) => s.id)
  const { data: answers } = await supabaseAdmin
    .from("feedback_answers")
    .select("submission_id, question_key, answer_value")
    .in("submission_id", subIds)

  const answerMap = new Map<string, { question_key: string; answer_value: string }[]>()
  for (const a of answers ?? []) {
    const existing = answerMap.get(a.submission_id) ?? []
    existing.push({ question_key: a.question_key, answer_value: a.answer_value })
    answerMap.set(a.submission_id, existing)
  }

  // Group submissions by session
  const sessionGroups = new Map<string, typeof allSubs>()
  for (const sub of allSubs) {
    if (!sub.session_id) continue
    const group = sessionGroups.get(sub.session_id) ?? []
    group.push(sub)
    sessionGroups.set(sub.session_id, group)
  }

  // Build per-session breakdown
  const breakdowns: SessionBreakdown[] = []

  for (const [sessionId, subs] of Array.from(sessionGroups.entries())) {
    const sessionDate = sessionMap.get(sessionId)
    if (!sessionDate) continue

    const sessionNum = calculateSessionNumber(joinDate, sessionDate)
    const ftSubs = subs.filter((s) => {
      const info = submitterInfo.get(s.submitted_by_id)
      return info?.role === "full_timer" || info?.role === "admin"
    })

    const reviewerNames = ftSubs
      .map((s) => submitterInfo.get(s.submitted_by_id)?.name)
      .filter(Boolean) as string[]

    // Compute scores from full-timer submissions only
    const scores: number[] = []
    const contributionVotes: string[] = []
    for (const sub of ftSubs) {
      const subAnswers = answerMap.get(sub.id) ?? []
      for (const ans of subAnswers) {
        if (RATING_KEYS.has(ans.question_key)) {
          const val = parseFloat(ans.answer_value)
          if (!isNaN(val)) scores.push(val)
        }
        if (ans.question_key === "contribution_level" && ans.answer_value) {
          contributionVotes.push(ans.answer_value)
        }
      }
    }

    // Mode for contribution
    let contribLevel: string | null = null
    if (contributionVotes.length > 0) {
      const freq = new Map<string, number>()
      for (const v of contributionVotes) {
        freq.set(v, (freq.get(v) ?? 0) + 1)
      }
      let maxCount = 0
      freq.forEach((count, level) => {
        if (count > maxCount) {
          maxCount = count
          contribLevel = level
        }
      })
    }

    const avg = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null

    breakdowns.push({
      sessionNumber: sessionNum,
      sessionDate,
      feedbackCount: subs.length,
      fullTimerFeedbackCount: ftSubs.length,
      averageScore: avg,
      contributionLevel: contribLevel,
      contributionLabel: readableContribution(contribLevel),
      reviewerNames,
    })
  }

  // Sort by session number
  breakdowns.sort((a, b) => a.sessionNumber - b.sessionNumber)

  // Compute trend from last 2 sessions with scores
  const scored = breakdowns.filter((b) => b.averageScore !== null)
  let trend: EnhancedProbationStanding["trend"] = "insufficient_data"
  if (scored.length >= 2) {
    const prev = scored[scored.length - 2].averageScore!
    const curr = scored[scored.length - 1].averageScore!
    const diff = curr - prev
    if (diff >= 0.3) trend = "improving"
    else if (diff <= -0.3) trend = "declining"
    else trend = "steady"
  }

  // Current session number
  const now = new Date()
  const currentSessionNumber = calculateSessionNumber(joinDate, now.toISOString())

  return {
    ...base,
    sessions: breakdowns,
    trend,
    currentSessionNumber: currentSessionNumber > 0 ? currentSessionNumber : null,
    totalExpectedSessions: 3,
  }
}

export function buildEnhancedProbationMessage(
  name: string,
  standing: EnhancedProbationStanding
): string {
  const sessionLabel = standing.currentSessionNumber
    ? ` (Session ${standing.currentSessionNumber} of ${standing.totalExpectedSessions})`
    : ""

  const greeting = standing.issues.length > 0
    ? `Hey ${name}, here's where you stand after the feedback session${sessionLabel} — a few things need your attention:`
    : `Hey ${name}, here's your update after the feedback session${sessionLabel} — you're on track, keep it up!`

  const standingSection = [
    "",
    "📊 *Your Standing*",
    `• Feedback from full-timers: ${standing.feedbackFromFullTimers}/${standing.requiredFeedbackCount} (need at least 3)`,
    standing.averageScore !== null
      ? `• Average score: ${standing.averageScore}/5 (target: 4+)`
      : "• Average score: No ratings from full-timers yet",
    standing.contributionLabel
      ? `• Contribution level: ${standing.contributionLabel}`
      : "",
  ].filter(Boolean).join("\n")

  // Per-session breakdown
  let sessionSection = ""
  if (standing.sessions.length > 0) {
    const lines = ["", "📅 *Per-Session Breakdown*"]
    for (const s of standing.sessions) {
      const dateLabel = new Date(s.sessionDate).toLocaleDateString("en-IN", {
        day: "numeric", month: "short",
      })
      const scoreStr = s.averageScore !== null ? `${s.averageScore}/5` : "—"
      const contribStr = s.contributionLabel ? `, ${s.contributionLabel}` : ""
      lines.push(`• Session ${s.sessionNumber} (${dateLabel}): ${s.fullTimerFeedbackCount} FT feedbacks, avg ${scoreStr}${contribStr}`)
    }
    if (standing.trend !== "insufficient_data") {
      const trendEmoji = standing.trend === "improving" ? "📈" : standing.trend === "declining" ? "📉" : "➡️"
      lines.push(`• Trend: ${trendEmoji} ${standing.trend}`)
    }
    sessionSection = lines.join("\n")
  }

  const issuesSection = standing.issues.length > 0
    ? [
        "",
        "⚠️ *What needs attention*",
        ...standing.issues.map((issue, i) => `${i + 1}. ${issue}`),
      ].join("\n")
    : "\n✅ You're on track across all metrics."

  const footer = [
    "",
    "─────────────────────────",
    "The bar: 4+ average scores, at least 3 feedbacks from full-timers, and ability to work independently. Talk to your sponsor if you have questions.",
  ].join("\n")

  return [greeting, standingSection, sessionSection, issuesSection, footer].filter(Boolean).join("\n")
}

export function buildProbationMessage(
  name: string,
  standing: ProbationStanding
): string {
  const greeting = standing.issues.length > 0
    ? `Hey ${name}, here's where you stand after the feedback session — a few things need your attention:`
    : `Hey ${name}, here's your update after the feedback session — you're on track, keep it up!`

  const standingSection = [
    "",
    "📊 *Your Standing*",
    `• Feedback from full-timers: ${standing.feedbackFromFullTimers}/${standing.requiredFeedbackCount} (need at least 3)`,
    standing.averageScore !== null
      ? `• Average score: ${standing.averageScore}/5 (target: 4+)`
      : "• Average score: No ratings from full-timers yet",
    standing.contributionLabel
      ? `• Contribution level: ${standing.contributionLabel}`
      : "",
  ].filter(Boolean).join("\n")

  const issuesSection = standing.issues.length > 0
    ? [
        "",
        "⚠️ *What needs attention*",
        ...standing.issues.map((issue, i) => `${i + 1}. ${issue}`),
      ].join("\n")
    : "\n✅ You're on track across all metrics."

  const footer = [
    "",
    "─────────────────────────",
    "The bar: 4+ average scores, at least 3 feedbacks from full-timers, and ability to work independently. Talk to your sponsor if you have questions.",
  ].join("\n")

  return [greeting, standingSection, issuesSection, footer].join("\n")
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://build3.online"

export function buildCeoReviewMessage(
  name: string,
  standing: ProbationStanding | EnhancedProbationStanding,
  probation: { join_date: string; probation_end_date: string; probation_status: string }
): string {
  const isExtended = probation.probation_status === "extended"
  const joinDate = new Date(probation.join_date).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  })
  const endDate = new Date(probation.probation_end_date).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  })

  const lines = [
    `⚠️ *Probation Review: ${name}*`,
    "",
    `${name}'s ${isExtended ? "extended " : ""}probation has ended.`,
    `• Joined: ${joinDate}`,
    `• Probation ended: ${endDate}`,
    `• Period: ${isExtended ? "Extended (6 months total)" : "Initial (3 months)"}`,
    "",
    "📊 *Feedback Data*",
    `• Total feedbacks received: ${standing.totalFeedbackCount}`,
    `• From full-timers: ${standing.feedbackFromFullTimers}/${standing.requiredFeedbackCount}`,
    standing.averageScore !== null
      ? `• Average score: ${standing.averageScore}/5 (threshold: 4.0)`
      : "• Average score: No ratings from full-timers yet",
    standing.contributionLabel
      ? `• Contribution: ${standing.contributionLabel}`
      : "",
  ]

  // Per-session breakdown (enhanced standing only)
  const enhanced = "sessions" in standing ? (standing as EnhancedProbationStanding) : null
  if (enhanced && enhanced.sessions.length > 0) {
    lines.push("")
    lines.push("📅 *Per-Session Data*")
    for (const s of enhanced.sessions) {
      const dateLabel = new Date(s.sessionDate).toLocaleDateString("en-IN", {
        day: "numeric", month: "short",
      })
      const scoreStr = s.averageScore !== null ? `avg ${s.averageScore}/5` : "no scores"
      const contribStr = s.contributionLabel ? `, contrib: ${s.contributionLabel}` : ""
      const reviewers = s.reviewerNames.length > 0 ? ` (${s.reviewerNames.join(", ")})` : ""
      lines.push(`• Session ${s.sessionNumber} (${dateLabel}): ${s.fullTimerFeedbackCount} FT feedbacks, ${scoreStr}${contribStr}${reviewers}`)
    }
    if (enhanced.trend !== "insufficient_data") {
      const trendEmoji = enhanced.trend === "improving" ? "📈" : enhanced.trend === "declining" ? "📉" : "➡️"
      lines.push(`• Trend: ${trendEmoji} ${enhanced.trend}`)
    }
  }

  if (standing.ceoSummary.length > 0) {
    lines.push("")
    const allGood = standing.issues.length === 0
    lines.push(allGood ? "✅ *Assessment*" : "⚠️ *Flags*")
    for (const item of standing.ceoSummary) {
      lines.push(`• ${item}`)
    }
  }

  lines.push("")
  lines.push("*Decision needed:*")
  lines.push("1. *Extend* — 3 more months to assess")
  lines.push("2. *Convert* — promote to full-timer")
  lines.push("3. *Conclude* — part ways")
  lines.push("")
  lines.push(`→ ${APP_URL}/glock17?tab=probation`)

  return lines.filter(Boolean).join("\n")
}

export function addMonthsSafe(date: Date, months: number): Date {
  const result = new Date(date)
  const targetMonth = result.getMonth() + months
  result.setMonth(targetMonth)
  // If day overflowed (e.g. Jan 31 + 1 month = Mar 3), clamp to last day of target month
  if (result.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    result.setDate(0)
  }
  return result
}
