import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"

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

  let scores: number[] = []
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

export function buildCeoReviewMessage(
  name: string,
  standing: ProbationStanding,
  probation: { join_date: string; probation_end_date: string; probation_status: string },
  actionUrl: string
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
  lines.push(`→ ${actionUrl}`)

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
