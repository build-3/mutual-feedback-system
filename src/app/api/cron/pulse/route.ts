import { NextResponse } from "next/server"
import { hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import {
  sendDirectMessage,
  isGoogleChatConfigured,
  isNotificationsEnabled,
} from "@/lib/server/google-chat"
import {
  buildPulseRun,
  buildReportText,
  loadPreviousScores,
  loadPulseRecipients,
  markReported,
  persistNotes,
  persistRun,
} from "@/lib/server/pulse"
import { draftNote } from "@/lib/server/pulse-notes"
import { MOD_EMAILS } from "@/lib/server/require-admin"
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
 * The notes it drafts are all left in `draft` status. Nothing here messages an
 * employee — that only happens when a human approves a note in /admin.
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

  const recipients = await loadPulseRecipients()
  if (recipients.length === 0) {
    // Fails closed, unlike the notification switch beside it: a report naming
    // people's performance goes nowhere until someone sets the list.
    return NextResponse.json({
      skipped: true,
      reason: "No pulse recipients configured.",
      hint: "Set the recipient list in /admin?tab=pulse before enabling the schedule.",
    })
  }

  const previousScores = await loadPreviousScores(run.cycleKey)
  const persisted = await persistRun(run, previousScores)

  if (!persisted.created) {
    // A run already exists for this cycle. Re-running must not produce a
    // second report or a second set of drafts.
    return NextResponse.json({
      skipped: true,
      reason: "A pulse run already exists for this cycle.",
      runId: persisted.runId,
      cycle: run.cycleKey,
    })
  }

  // Everyone gets a note — including the doing-well bucket, which is the only
  // one that is pure recognition and makes no ask.
  const rosterNames = run.people.map((p) => p.name)
  const leadershipNames = run.people
    .filter((p) => p.email && MOD_EMAILS.includes(p.email.toLowerCase()))
    .map((p) => p.name)

  const drafted = await Promise.all(
    run.people.map(async (person) => {
      const note = await draftNote(person, run.config, {
        appUrl: APP_URL,
        rosterNames,
        leadershipNames,
      })
      return {
        employeeId: person.employeeId,
        bucket: person.bucket,
        text: note.text,
        source: note.source,
      }
    })
  )

  const notesWritten = await persistNotes(persisted.runId, drafted)

  const text = buildReportText(run, {
    appUrl: APP_URL,
    runId: persisted.runId,
    previousScores,
    pendingNotes: notesWritten,
  })

  const results: { email: string; success: boolean; error?: string }[] = []
  for (const email of recipients) {
    try {
      await sendDirectMessage(email, text)
      results.push({ email, success: true })
    } catch (err: unknown) {
      results.push({
        email,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  const delivered = results.filter((r) => r.success).map((r) => r.email)
  if (delivered.length > 0) await markReported(persisted.runId, delivered)

  return NextResponse.json({
    runId: persisted.runId,
    cycle: run.cycleKey,
    totals: run.totals,
    notesDrafted: notesWritten,
    llmDrafts: drafted.filter((d) => d.source === "llm").length,
    reportSentTo: results,
  })
}
