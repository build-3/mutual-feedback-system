import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import {
  sendDirectMessage,
  isGoogleChatConfigured,
  isNotificationsEnabled,
} from "@/lib/server/google-chat"
import {
  isReminderDay,
  getNextSecondTuesday,
  getOrCreateSession,
  generateSessionAssignments,
} from "@/lib/server/session-utils"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://build3.online"

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

  // Only send reminders if tomorrow is a 2nd Tuesday
  if (!isReminderDay()) {
    return NextResponse.json({ skipped: true, reason: "Tomorrow is not a 2nd Tuesday." })
  }

  const chatConfigured = isGoogleChatConfigured()
  const notificationsOn = chatConfigured ? await isNotificationsEnabled() : false

  if (!chatConfigured || !notificationsOn) {
    return NextResponse.json({ skipped: true, reason: "Chat notifications disabled." })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Get or create session for tomorrow's 2nd Tuesday
  const sessionDate = getNextSecondTuesday()
  const session = await getOrCreateSession(sessionDate)

  // Generate assignments (idempotent)
  const assignmentsCreated = await generateSessionAssignments(session.id)

  // Get active probation interns
  const { data: probations } = await supabaseAdmin
    .from("probation_tracking")
    .select("employee_id")
    .in("probation_status", ["active", "extended"])

  if (!probations || probations.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No active probation interns." })
  }

  const internIds = probations.map((p) => p.employee_id)

  // Get intern names
  const { data: interns } = await supabaseAdmin
    .from("employees")
    .select("id, name")
    .in("id", internIds)

  const internNames = new Map<string, string>()
  for (const i of interns ?? []) {
    internNames.set(i.id, i.name)
  }

  // Get full-timers and admins to remind
  const { data: reviewers } = await supabaseAdmin
    .from("employees")
    .select("id, name, email")
    .in("role", ["full_timer", "admin"])

  if (!reviewers || reviewers.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No reviewers found." })
  }

  // Check which assignments are already completed for this session
  const { data: completedAssignments } = await supabaseAdmin
    .from("session_assignments")
    .select("reviewer_id, intern_id")
    .eq("session_id", session.id)
    .not("submission_id", "is", null)

  const completedSet = new Set(
    (completedAssignments ?? []).map((a) => `${a.reviewer_id}-${a.intern_id}`)
  )

  const results: { name: string; success: boolean; internsToReview: number; error?: string }[] = []

  for (const reviewer of reviewers) {
    // Skip self-review — find interns this reviewer still needs to review
    const pendingInterns = internIds.filter((internId) => {
      if (internId === reviewer.id) return false
      return !completedSet.has(`${reviewer.id}-${internId}`)
    })

    if (pendingInterns.length === 0) continue

    const internNameList = pendingInterns
      .map((id) => internNames.get(id) ?? "Unknown")
      .join(", ")

    const dateLabel = sessionDate.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "short",
    })

    const message = [
      `📋 *Feedback Session Reminder*`,
      "",
      `Tomorrow (${dateLabel}) is a feedback session day.`,
      "",
      `These team members on probation need your review:`,
      `• ${internNameList}`,
      "",
      `Please submit feedback during or after the session:`,
      `→ ${APP_URL}/feedback`,
    ].join("\n")

    if (!reviewer.email) continue

    try {
      await sendDirectMessage(reviewer.email, message)
      results.push({ name: reviewer.name, success: true, internsToReview: pendingInterns.length })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      results.push({ name: reviewer.name, success: false, internsToReview: pendingInterns.length, error: msg })
    }
  }

  return NextResponse.json({
    reminded: results.filter((r) => r.success).length,
    sessionId: session.id,
    sessionDate: sessionDate.toISOString().split("T")[0],
    assignmentsCreated,
    results,
  })
}
