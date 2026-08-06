import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import {
  sendDirectMessage,
  isGoogleChatConfigured,
  isNotificationsEnabled,
} from "@/lib/server/google-chat"
import { isReminderDay } from "@/lib/server/session-utils"
import { submittersInCycle } from "@/lib/server/period-gate"
import { cycleFor } from "@/lib/cycles"

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
  // ?force=true is NOT a preview — it really sends. ?dry=true reports exactly who
  // would be messaged without contacting anyone, so a change to the suppression
  // rule can be checked before it reaches the org.
  const dry = url.searchParams.get("dry") === "true"
  if (!force && !dry && !isReminderDay()) {
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

  // Who has already submitted self + build3 in the current CYCLE? Skip them.
  //
  // This used to be a calendar-month query while the fire decision above used
  // isReminderDay() — cycle logic. The two halves of one request disagreed, so
  // someone who had reflected mid-cycle but before the 1st was not suppressed:
  // they got a DM, clicked through, and were told they had already submitted.
  // A dead-end nudge, org-wide, and unrecallable once sent.
  const tally = await submittersInCycle(["self", "build3"])
  const doneBoth = new Set<string>()
  tally.forEach((types, employeeId) => {
    if (types.has("self") && types.has("build3")) doneBoth.add(employeeId)
  })

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

    if (dry) {
      results.push({ name: emp.name, sent: false, reason: "dry run — would have sent" })
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
    dry,
    cycle: cycleFor().label,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => !r.sent && r.reason).length,
    failed: results.filter((r) => r.error).length,
    results,
  })
}
