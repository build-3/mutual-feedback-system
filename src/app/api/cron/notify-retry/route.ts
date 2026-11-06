import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { sendNotificationForSubmission } from "@/lib/server/feedback"
import { sendSponsorAlertForSubmission } from "@/lib/server/sponsor-alerts"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

/** Only look back this far. Older unsent rows predate notifications or are long stale. */
const LOOKBACK_HOURS = 72
/** Leave newer rows alone: the request that created them may still be sending. */
const MIN_AGE_MINUTES = 5
/** Per run, so a backlog drains over several runs instead of one long request. */
const BATCH = 25

/**
 * The safety net under feedback notifications.
 *
 * The submit route sends the "you got feedback" DM after it responds. On a small
 * server that work can be cut off, and the DM is lost without a trace, except
 * that `feedback_submissions.notified_at` stays NULL because it is only written
 * after a successful send. This job finds exactly those rows and sends them.
 * `notified_at` stays the idempotency key, so nothing is sent twice.
 *
 * It also runs the sponsor alert for recent probation feedback that has not been
 * escalated yet (a no-op unless site_settings.sponsor_alerts_enabled is "true").
 *
 * Coolify scheduled task: every 10 minutes (five-field cron, minute field
 * step 10), GET with `Authorization: Bearer $CRON_SECRET`.
 *
 *   ?dry=true   list what would be sent and send nothing.
 */
export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 })
  }

  const dry = new URL(request.url).searchParams.get("dry") === "true"
  const supabaseAdmin = getSupabaseAdmin()
  const now = Date.now()
  const since = new Date(now - LOOKBACK_HOURS * 3_600_000).toISOString()
  const before = new Date(now - MIN_AGE_MINUTES * 60_000).toISOString()

  // 1. Candidate DMs that never went out.
  const { data: unsent, error: unsentError } = await supabaseAdmin
    .from("feedback_submissions")
    .select("id, created_at")
    .is("notified_at", null)
    .not("feedback_for_id", "is", null)
    .gte("created_at", since)
    .lte("created_at", before)
    .order("created_at", { ascending: true })
    .limit(BATCH)

  if (unsentError) {
    console.error("[notify-retry] could not list unsent notifications:", unsentError.message)
    return NextResponse.json({ error: "Could not list unsent notifications." }, { status: 500 })
  }

  const unsentIds = (unsent ?? []).map((r) => r.id as string)

  // 2. Recent probation feedback not yet escalated to a sponsor.
  const { data: recentIntern } = await supabaseAdmin
    .from("feedback_submissions")
    .select("id")
    .eq("feedback_type", "intern")
    .not("feedback_for_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(200)
  const recentInternIds = (recentIntern ?? []).map((r) => r.id as string)

  let handled = new Set<string>()
  if (recentInternIds.length > 0) {
    const { data: done } = await supabaseAdmin
      .from("sponsor_alerts" as never)
      .select("submission_id")
      .in("submission_id", recentInternIds)
    handled = new Set(((done ?? []) as { submission_id: string }[]).map((r) => r.submission_id))
  }
  const toEscalate = recentInternIds.filter((id) => !handled.has(id)).slice(0, BATCH)

  if (dry) {
    const preview = []
    for (const id of toEscalate) {
      try {
        preview.push({ submissionId: id, ...(await sendSponsorAlertForSubmission(id, { dry: true })) })
      } catch (err) {
        preview.push({ submissionId: id, status: "error", error: String(err) })
      }
    }
    return NextResponse.json({
      dry: true,
      unsentCandidateDms: unsentIds,
      sponsorAlerts: preview.filter((p) => p.status !== "skipped"),
      sponsorAlertsSkipped: preview.filter((p) => p.status === "skipped").length,
    })
  }

  const candidateResults: { id: string; status: string; error?: string }[] = []
  for (const id of unsentIds) {
    try {
      const r = await sendNotificationForSubmission(id)
      candidateResults.push({ id, status: r.status })
    } catch (err) {
      console.error(`[notify-retry] candidate DM failed for ${id}:`, err)
      candidateResults.push({ id, status: "error", error: err instanceof Error ? err.message : String(err) })
    }
  }

  const sponsorResults: { id: string; status: string; error?: string }[] = []
  for (const id of toEscalate) {
    try {
      const r = await sendSponsorAlertForSubmission(id)
      sponsorResults.push({ id, status: r.status })
    } catch (err) {
      console.error(`[notify-retry] sponsor alert failed for ${id}:`, err)
      sponsorResults.push({ id, status: "error", error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({
    candidateDms: {
      attempted: candidateResults.length,
      sent: candidateResults.filter((r) => r.status === "sent").length,
      failed: candidateResults.filter((r) => r.status === "error").length,
      results: candidateResults.filter((r) => r.status !== "skipped"),
    },
    sponsorAlerts: {
      attempted: sponsorResults.length,
      sent: sponsorResults.filter((r) => r.status === "sent" || r.status === "no_sponsor_notified").length,
      failed: sponsorResults.filter((r) => r.status === "error").length,
    },
  })
}
