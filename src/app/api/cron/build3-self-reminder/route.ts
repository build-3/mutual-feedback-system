import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import {
  sendDirectMessage,
  isGoogleChatConfigured,
  isNotificationsEnabled,
} from "@/lib/server/google-chat"
import { isReminderDay } from "@/lib/server/session-utils"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mutualfeedback.build3.online"

function firstName(name: string | null | undefined): string {
  if (!name) return "there"
  const first = name.trim().split(/\s+/)[0]
  return first || "there"
}

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

  // Only fire the Monday before a 2nd-Tuesday session, matching session-reminder.
  // Pass ?force=true to bypass the date check (for on-demand sends).
  const url = new URL(request.url)
  const force = url.searchParams.get("force") === "true"
  if (!force && !isReminderDay()) {
    return NextResponse.json({ skipped: true, reason: "Tomorrow is not a 2nd Tuesday." })
  }

  const chatConfigured = isGoogleChatConfigured()
  const notificationsOn = chatConfigured ? await isNotificationsEnabled() : false
  if (!chatConfigured || !notificationsOn) {
    return NextResponse.json({ skipped: true, reason: "Chat notifications disabled." })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Everyone in the org with a valid email.
  const { data: employees, error: empErr } = await supabaseAdmin
    .from("employees")
    .select("id, name, email")
    .not("email", "is", null)

  if (empErr || !employees || employees.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No employees found." })
  }

  // Who's already submitted self + build3 feedback this calendar month? Skip them.
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const { data: submissions } = await supabaseAdmin
    .from("feedback_submissions")
    .select("submitted_by_id, feedback_type")
    .in("feedback_type", ["self", "build3"])
    .gte("created_at", monthStart)
    .lt("created_at", monthEnd)

  const doneBoth = new Set<string>()
  const tally = new Map<string, Set<string>>()
  for (const s of submissions ?? []) {
    if (!s.submitted_by_id) continue
    const set = tally.get(s.submitted_by_id) ?? new Set<string>()
    set.add(s.feedback_type)
    tally.set(s.submitted_by_id, set)
    if (set.has("self") && set.has("build3")) doneBoth.add(s.submitted_by_id)
  }

  const results: { name: string; sent: boolean; reason?: string; error?: string }[] = []

  for (const emp of employees) {
    if (!emp.email) continue
    if (doneBoth.has(emp.id)) {
      results.push({ name: emp.name, sent: false, reason: "already submitted both" })
      continue
    }

    const message = [
      `hey ${firstName(emp.name)}! 👋`,
      "",
      `our feedback session is coming up. before we meet, please take 10 mins to fill in your feedback for the org (to build3) and your self reflection on ${APP_URL.replace(/^https?:\/\//, "")}`,
      "",
      `thank you 🙏`,
    ].join("\n")

    try {
      await sendDirectMessage(emp.email, message)
      results.push({ name: emp.name, sent: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error"
      results.push({ name: emp.name, sent: false, error: msg })
    }
  }

  return NextResponse.json({
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => !r.sent && r.reason).length,
    failed: results.filter((r) => r.error).length,
    results,
  })
}
