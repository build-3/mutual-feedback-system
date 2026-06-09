// One-off broadcast route — not added to the recurring scheduled tasks list.
// Fired manually via curl once, lives in the codebase for future ad-hoc sends.
import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import {
  sendDirectMessage,
  isGoogleChatConfigured,
  isNotificationsEnabled,
} from "@/lib/server/google-chat"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
const SENDER_EMAIL = process.env.GOOGLE_CHAT_SENDER_EMAIL ?? ""

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

  const chatConfigured = isGoogleChatConfigured()
  const notificationsOn = chatConfigured ? await isNotificationsEnabled() : false
  if (!chatConfigured || !notificationsOn) {
    return NextResponse.json({ skipped: true, reason: "Chat notifications disabled." })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: employees, error: empErr } = await supabaseAdmin
    .from("employees")
    .select("id, name, email")
    .not("email", "is", null)

  if (empErr || !employees || employees.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No employees found." })
  }

  // Google Chat plain-text formatting:
  //   *bold*  _italic_  <url|display>
  const message = [
    `hey team 👋`,
    ``,
    `our next mutual feedback session is coming up — please head over to <https://mutualfeedback.build3.online|mutualfeedback.build3.online> and complete both your *self-reflection* and your *feedback to build3* before we meet.`,
    ``,
    `note: both are _mandatory_ before the session.`,
    ``,
    `thank you 🙏`,
  ].join("\n")

  const results: { name: string; sent: boolean; reason?: string; error?: string }[] = []

  for (const emp of employees) {
    if (!emp.email) continue
    // Skip the sender account — Chat API rejects DMing yourself.
    if (SENDER_EMAIL && emp.email.toLowerCase() === SENDER_EMAIL.toLowerCase()) {
      results.push({ name: emp.name, sent: false, reason: "is sender account" })
      continue
    }
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
    skipped: results.filter((r) => r.reason).length,
    failed: results.filter((r) => r.error).length,
    results,
  })
}
