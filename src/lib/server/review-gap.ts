import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import { fetchPagedByIds } from "./paged-query"
import {
  sendDirectMessage,
  isGoogleChatConfigured,
  isNotificationsEnabled,
} from "./google-chat"
import { sponsorAlertsEnabled } from "./sponsor-alerts"
import {
  REVIEW_GAP_CONFIG,
  buildReviewGapNoSponsorText,
  buildReviewGapText,
  countFullTimeReviewers,
  decideReviewGap,
} from "@/lib/review-gap"
import { todayIso } from "@/lib/probation-dates"

export type ReviewGapRow = {
  name: string
  fullTimeReviewers: number
  daysLeft: number
  outcome:
    | "would_send_sponsor"
    | "would_notify_reviewers"
    | "sent_sponsor"
    | "notified_reviewers"
    | "skipped"
    | "error"
  to?: string[]
  reason?: string
  text?: string
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://mutualfeedback.build3.online"
}

/**
 * Daily pass over everyone on probation: anyone in the final stretch whose
 * feedback comes from fewer than 3 distinct full-time teammates gets their
 * sponsor told (probation reviewers if there is no sponsor). At most once a week
 * per person, claimed before sending so a double run cannot message twice.
 *
 *   dry: true   report who would be told and what it would say. Sends nothing,
 *               records nothing, and ignores the on/off switch.
 */
export async function runReviewGapAlerts({
  dry = false,
}: { dry?: boolean } = {}): Promise<
  { skipped: string } | { dry: boolean; today: string; checked: number; rows: ReviewGapRow[] }
> {
  if (!dry) {
    if (!(await sponsorAlertsEnabled())) return { skipped: "sponsor alerts are off" }
    if (!isGoogleChatConfigured() || !(await isNotificationsEnabled())) {
      return { skipped: "chat notifications disabled" }
    }
  }

  const sb = getSupabaseAdmin()
  const today = todayIso()

  const { data: probationRows, error: probError } = await sb
    .from("probation_tracking")
    .select("id, employee_id, status, start_date, end_date")
    .in("status", ["active", "extended"])
  if (probError) throw new Error(`probation read failed: ${probError.message}`)
  const probations = probationRows ?? []
  if (probations.length === 0) return { dry, today, checked: 0, rows: [] }

  const candidateIds = Array.from(new Set(probations.map((p) => p.employee_id as string)))

  type Emp = { id: string; name: string; email: string | null; is_active: boolean; sponsor_id: string | null }
  const candidates = await fetchPagedByIds<Emp>(
    (ids) =>
      sb
        .from("employees")
        .select("id, name, email, is_active, sponsor_id")
        .in("id", ids)
        .order("id", { ascending: true }),
    candidateIds
  )
  const candById = new Map(candidates.map((e) => [e.id, e]))

  type Sub = { id: string; submitted_by_id: string; feedback_for_id: string; created_at: string }
  const submissions = await fetchPagedByIds<Sub>(
    (ids) =>
      sb
        .from("feedback_submissions")
        .select("id, submitted_by_id, feedback_for_id, created_at")
        .eq("feedback_type", "intern")
        .in("feedback_for_id", ids)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }),
    candidateIds
  )

  const reviewerIds = Array.from(new Set(submissions.map((s) => s.submitted_by_id)))
  const reviewerRows = await fetchPagedByIds<{ id: string; role: string }>(
    (ids) => sb.from("employees").select("id, role").in("id", ids).order("id", { ascending: true }),
    reviewerIds
  )
  const rolesById = new Map(reviewerRows.map((r) => [r.id, r.role]))

  // Recent alerts, to keep to once a week.
  const recentCutoff = new Date(
    Date.parse(`${today}T00:00:00Z`) - (REVIEW_GAP_CONFIG.repeatEveryDays - 1) * 86_400_000
  )
    .toISOString()
    .slice(0, 10)
  const { data: recentRows } = await sb
    .from("review_gap_alerts" as never)
    .select("probation_id")
    .gte("sent_on", recentCutoff)
  const recentlyAlerted = new Set(((recentRows ?? []) as { probation_id: string }[]).map((r) => r.probation_id))

  const sponsorIds = Array.from(
    new Set(candidates.map((c) => c.sponsor_id).filter((v): v is string => Boolean(v)))
  )
  const sponsors = await fetchPagedByIds<Emp>(
    (ids) =>
      sb
        .from("employees")
        .select("id, name, email, is_active, sponsor_id")
        .in("id", ids)
        .order("id", { ascending: true }),
    sponsorIds
  )
  const sponsorById = new Map(sponsors.map((s) => [s.id, s]))

  const rows: ReviewGapRow[] = []

  for (const p of probations) {
    const cand = candById.get(p.employee_id as string)
    if (!cand || !cand.is_active) continue

    const mine = submissions.filter(
      (s) => s.feedback_for_id === cand.id && s.created_at.slice(0, 10) >= (p.start_date as string)
    )
    const fullTimeReviewers = countFullTimeReviewers(mine, rolesById, cand.id)
    const decision = decideReviewGap({
      status: p.status as string,
      fullTimeReviewers,
      endDate: p.end_date as string,
      today,
    })
    if (!decision.alert) continue

    const base = { name: cand.name, fullTimeReviewers, daysLeft: decision.daysLeft }

    if (recentlyAlerted.has(p.id as string)) {
      rows.push({ ...base, outcome: "skipped", reason: "already alerted in the last 7 days" })
      continue
    }

    const url = `${appUrl()}/insights?employee=${cand.id}`
    const sponsor = cand.sponsor_id ? sponsorById.get(cand.sponsor_id) : undefined
    const reachable = Boolean(sponsor && sponsor.is_active && sponsor.email)

    let recipients: string[]
    let text: string
    if (reachable && sponsor) {
      recipients = [sponsor.email as string]
      text = buildReviewGapText({
        sponsorName: sponsor.name,
        candidateName: cand.name,
        fullTimeReviewers,
        daysLeft: decision.daysLeft,
        url,
      })
    } else {
      const { data: reviewerList } = (await sb
        .from("probation_reviewers" as never)
        .select("email")) as { data: { email: string }[] | null }
      recipients = (reviewerList ?? []).map((r) => r.email).filter(Boolean)
      text = buildReviewGapNoSponsorText({
        candidateName: cand.name,
        fullTimeReviewers,
        daysLeft: decision.daysLeft,
        url,
      })
      if (recipients.length === 0) {
        rows.push({ ...base, outcome: "skipped", reason: "no sponsor and no probation reviewers to tell" })
        continue
      }
    }

    if (dry) {
      rows.push({
        ...base,
        outcome: reachable ? "would_send_sponsor" : "would_notify_reviewers",
        to: recipients,
        text,
      })
      continue
    }

    // Claim first. A unique violation means another run got there.
    const { error: claimError } = await sb.from("review_gap_alerts" as never).insert({
      probation_id: p.id,
      sent_on: today,
      full_time_reviewers: fullTimeReviewers,
      sponsor_id: reachable && sponsor ? sponsor.id : null,
    } as never)
    if (claimError) {
      const dup = (claimError as { code?: string }).code === "23505"
      rows.push({
        ...base,
        outcome: "skipped",
        reason: dup ? "already alerted today" : `could not record the alert (${claimError.message})`,
      })
      continue
    }

    try {
      for (const email of recipients) await sendDirectMessage(email, text)
      rows.push({ ...base, outcome: reachable ? "sent_sponsor" : "notified_reviewers", to: recipients })
    } catch (err) {
      await sb
        .from("review_gap_alerts" as never)
        .delete()
        .eq("probation_id", p.id as string)
        .eq("sent_on", today)
      rows.push({ ...base, outcome: "error", reason: err instanceof Error ? err.message : String(err) })
    }
  }

  return { dry, today, checked: probations.length, rows }
}
