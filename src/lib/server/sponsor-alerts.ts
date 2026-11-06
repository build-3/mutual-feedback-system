import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import {
  sendDirectMessage,
  isGoogleChatConfigured,
  isNotificationsEnabled,
} from "./google-chat"
import {
  buildNoSponsorText,
  buildSponsorAlertText,
  classifyFeedbackSignal,
  type AnswerLike,
} from "@/lib/sponsor-alert"

export type SponsorAlertResult =
  | { status: "sent"; to: string }
  | { status: "no_sponsor_notified"; to: string[] }
  | { status: "would_send"; to: string; text: string }
  | { status: "would_notify_reviewers"; to: string[]; text: string }
  | { status: "skipped"; reason: string }

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://mutualfeedback.build3.online"
}

/**
 * Off by default. Like the leaderboard nudge, this reaches people unprompted,
 * and what counts as "negative" is still a starting line rather than a decision,
 * so the switch is explicit: site_settings.sponsor_alerts_enabled = "true".
 */
export async function sponsorAlertsEnabled(): Promise<boolean> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings" as never)
      .select("value")
      .eq("key", "sponsor_alerts_enabled")
      .maybeSingle()
    return (data as { value: string } | null)?.value === "true"
  } catch {
    return false
  }
}

type SubmissionRow = {
  id: string
  feedback_for_id: string | null
  feedback_type: string
}

type EmployeeRow = {
  id: string
  name: string
  email: string | null
  sponsor_id: string | null
  is_active: boolean
}

/**
 * Tell a probationer's sponsor when the probationer receives feedback with a
 * low-trust signal. Safe to call any number of times for the same submission:
 * `sponsor_alerts.submission_id` is unique and is claimed BEFORE the send, so a
 * retry, a double click and a cron run overlapping cannot message twice. If the
 * send fails the claim is released, so the next run tries again.
 *
 *   dry: true   work out who would be told and what it would say. Sends nothing,
 *               claims nothing, and ignores the on/off switch so it can be previewed.
 */
export async function sendSponsorAlertForSubmission(
  submissionId: string,
  { dry = false }: { dry?: boolean } = {}
): Promise<SponsorAlertResult> {
  const supabaseAdmin = getSupabaseAdmin()

  if (!dry) {
    if (!(await sponsorAlertsEnabled())) {
      return { status: "skipped", reason: "sponsor alerts are off" }
    }
    if (!isGoogleChatConfigured() || !(await isNotificationsEnabled())) {
      return { status: "skipped", reason: "chat notifications disabled" }
    }
  }

  const { data: submissionData } = await supabaseAdmin
    .from("feedback_submissions")
    .select("id, feedback_for_id, feedback_type")
    .eq("id", submissionId)
    .single()
  const submission = submissionData as SubmissionRow | null
  if (!submission) return { status: "skipped", reason: "submission not found" }
  if (submission.feedback_type !== "intern" || !submission.feedback_for_id) {
    return { status: "skipped", reason: "not feedback about someone on probation" }
  }

  const { data: answerData, error: answerError } = await supabaseAdmin
    .from("feedback_answers")
    .select("question_key, answer_value")
    .eq("submission_id", submissionId)
  if (answerError) {
    return { status: "skipped", reason: `could not read answers: ${answerError.message}` }
  }
  const signal = classifyFeedbackSignal((answerData ?? []) as AnswerLike[])
  if (!signal.negative) return { status: "skipped", reason: "no low-trust signal" }

  const { data: candidateData } = await supabaseAdmin
    .from("employees")
    .select("id, name, email, sponsor_id, is_active")
    .eq("id", submission.feedback_for_id)
    .single()
  const candidate = candidateData as EmployeeRow | null
  if (!candidate || !candidate.is_active) {
    return { status: "skipped", reason: "candidate is not active" }
  }

  const url = `${appUrl()}/insights?employee=${candidate.id}`

  let sponsor: EmployeeRow | null = null
  if (candidate.sponsor_id && candidate.sponsor_id !== candidate.id) {
    const { data: sponsorData } = await supabaseAdmin
      .from("employees")
      .select("id, name, email, sponsor_id, is_active")
      .eq("id", candidate.sponsor_id)
      .single()
    sponsor = sponsorData as EmployeeRow | null
  }
  const sponsorReachable = Boolean(sponsor && sponsor.is_active && sponsor.email)

  // Nobody owns this conversation: say so to the people who can fix it, instead
  // of dropping the alert on the floor.
  if (!sponsor || !sponsorReachable) {
    const { data: reviewerRows } = (await supabaseAdmin
      .from("probation_reviewers" as never)
      .select("email")) as { data: { email: string }[] | null }
    const reviewers = (reviewerRows ?? []).map((r) => r.email).filter(Boolean)
    const text = buildNoSponsorText({ candidateName: candidate.name, reason: signal.reason, url })

    if (reviewers.length === 0) {
      return { status: "skipped", reason: "no sponsor on record and no probation reviewers to tell" }
    }
    if (dry) return { status: "would_notify_reviewers", to: reviewers, text }

    const claimed = await claim(submissionId, candidate.id, null, "no_sponsor")
    if (claimed !== "ok") return claimed
    try {
      for (const email of reviewers) await sendDirectMessage(email, text)
    } catch (err) {
      await release(submissionId)
      throw err
    }
    return { status: "no_sponsor_notified", to: reviewers }
  }

  const text = buildSponsorAlertText({
    sponsorName: sponsor.name,
    candidateName: candidate.name,
    reason: signal.reason,
    url,
  })
  if (dry) return { status: "would_send", to: sponsor.email as string, text }

  const claimed = await claim(submissionId, candidate.id, sponsor.id, "sent")
  if (claimed !== "ok") return claimed
  try {
    await sendDirectMessage(sponsor.email as string, text)
  } catch (err) {
    await release(submissionId)
    throw err
  }
  return { status: "sent", to: sponsor.email as string }
}

/** Insert the idempotency row. A unique violation means someone already handled it. */
async function claim(
  submissionId: string,
  employeeId: string,
  sponsorId: string | null,
  outcome: "sent" | "no_sponsor"
): Promise<"ok" | SponsorAlertResult> {
  const { error } = await getSupabaseAdmin()
    .from("sponsor_alerts" as never)
    .insert({
      submission_id: submissionId,
      employee_id: employeeId,
      sponsor_id: sponsorId,
      outcome,
    } as never)
  if (!error) return "ok"
  if ((error as { code?: string }).code === "23505") {
    return { status: "skipped", reason: "already alerted" }
  }
  // Table missing or any other failure: refuse to send. Without the claim we
  // cannot promise "once", and a duplicate alert to a sponsor is worse than a
  // late one.
  console.error("[sponsor-alert] could not record claim, not sending:", error.message)
  return { status: "skipped", reason: `could not record the alert (${error.message})` }
}

async function release(submissionId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("sponsor_alerts" as never)
    .delete()
    .eq("submission_id", submissionId)
  if (error) console.error("[sponsor-alert] could not release claim:", error.message)
}
