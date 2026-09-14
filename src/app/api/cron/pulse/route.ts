import { NextResponse } from "next/server"
import { hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import {
  sendDirectMessage,
  isGoogleChatConfigured,
  isNotificationsEnabled,
} from "@/lib/server/google-chat"
import { buildPulseRun, buildReportText } from "@/lib/server/pulse"
import { isDayAfterSecondTuesdayIst } from "@/lib/cycles"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mutualfeedback.build3.online"

/**
 * The pulse run. Scheduled daily in Coolify; the route decides whether today is
 * the day, matching how every other cron here works.
 *
 * Modes:
 *   (default)        persist, draft notes, DM the report to the configured list
 *   ?dry=true        compute and return JSON. Writes nothing, sends nothing
 *   ?preview=<email> compute and DM the report to that address only. Writes nothing
 *   ?force=true      bypass the day gate; combines with the above
 *
 * Phase 1 implements the read path only: ?dry=true and ?preview=. The default
 * mode returns 501 rather than half-running, so a schedule registered early
 * cannot quietly send a report built by an unfinished pipeline.
 */
export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 })
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 })
  }

  const url = new URL(request.url)
  const dry = url.searchParams.get("dry") === "true"
  const force = url.searchParams.get("force") === "true"
  const preview = url.searchParams.get("preview")?.trim() || null

  if (!force && !isDayAfterSecondTuesdayIst()) {
    return NextResponse.json({
      skipped: true,
      reason: "Today is not the day after a session.",
    })
  }

  const run = await buildPulseRun()

  if (dry) {
    return NextResponse.json({
      dry: true,
      cycle: run.cycleKey,
      cycleLabel: run.cycleLabel,
      window: { start: run.windowStartIso, end: run.windowEndIso, label: run.windowLabel },
      totals: run.totals,
      reviewsInWindow: run.reviewsInWindow,
      config: run.config,
      people: run.people.map((p) => ({
        name: p.name,
        cohort: p.cohort,
        bucket: p.bucket,
        composite: p.composite === null ? null : Math.round(p.composite * 10) / 10,
        reviewScores: p.reviewScores,
        coverage: `${p.coverageReceived}/${p.coverageExpected}`,
        selfReviewFiled: p.selfReviewFiled,
        weakest: p.weakest.map((w) => `${w.key} ${Math.round(w.value)}`),
        strongest: p.strongest ? `${p.strongest.key} ${Math.round(p.strongest.value)}` : null,
        improvementThemes: p.improvementThemes,
        probationEndDate: p.probationEndDate,
      })),
      report: buildReportText(run, { appUrl: APP_URL }),
    })
  }

  const chatConfigured = isGoogleChatConfigured()
  const notificationsOn = chatConfigured ? await isNotificationsEnabled() : false
  if (!chatConfigured || !notificationsOn) {
    return NextResponse.json({ skipped: true, reason: "Chat notifications disabled." })
  }

  if (preview) {
    const text = buildReportText(run, { appUrl: APP_URL })
    try {
      await sendDirectMessage(preview, text)
      return NextResponse.json({ preview, sent: true, persisted: false, totals: run.totals })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error"
      return NextResponse.json({ preview, sent: false, error: message }, { status: 502 })
    }
  }

  // Guarded until persistence and note drafting land (phases 2-3). Returning
  // 501 keeps a prematurely registered schedule from sending anything.
  return NextResponse.json(
    {
      error: "Live pulse runs are not enabled yet.",
      hint: "Use ?dry=true to inspect the buckets, or ?preview=<email> to test delivery.",
      totals: run.totals,
    },
    { status: 501 }
  )
}
