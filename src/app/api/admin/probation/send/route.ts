import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"
import { sendDirectMessage, isGoogleChatConfigured, isNotificationsEnabled } from "@/lib/server/google-chat"
import { analyzeEnhancedProbationStanding, buildEnhancedProbationMessage, buildCeoReviewMessage, CEO_EMAIL } from "@/lib/server/probation-rules"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await request.json()
  const { employeeId, type } = body

  if (!employeeId || !UUID_RE.test(employeeId)) {
    return NextResponse.json({ error: "Invalid employee id." }, { status: 400 })
  }

  if (type !== "rules" && type !== "ceo") {
    return NextResponse.json({ error: "Type must be rules or ceo." }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: emp } = await supabaseAdmin
    .from("employees")
    .select("name, email")
    .eq("id", employeeId)
    .single()

  if (!emp) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 })
  }

  const { data: prob } = await supabaseAdmin
    .from("probation_tracking")
    .select("id, employee_id, join_date, probation_status, probation_end_date")
    .eq("employee_id", employeeId)
    .in("probation_status", ["active", "extended"])
    .single()

  if (!prob) {
    return NextResponse.json({ error: "No active probation found." }, { status: 404 })
  }

  const enabled = await isNotificationsEnabled()
  const configured = isGoogleChatConfigured()
  const standing = await analyzeEnhancedProbationStanding(employeeId, emp.name, prob.join_date)

  if (type === "rules") {
    const message = buildEnhancedProbationMessage(emp.name, standing)

    if (configured && enabled && emp.email) {
      await sendDirectMessage(emp.email, message)
      await supabaseAdmin
        .from("probation_tracking")
        .update({ rules_last_sent_at: new Date().toISOString() })
        .eq("id", prob.id)

      return NextResponse.json({ sent: true, to: emp.email })
    }

    return NextResponse.json({
      sent: false,
      reason: !configured ? "Google Chat not configured" : !enabled ? "Notifications disabled (DEV_MODE)" : "No email",
      message,
    })
  }

  // CEO notification
  const message = buildCeoReviewMessage(emp.name, standing, prob)

  if (configured && enabled) {
    await sendDirectMessage(CEO_EMAIL, message)
    return NextResponse.json({ sent: true, to: CEO_EMAIL })
  }

  return NextResponse.json({
    sent: false,
    reason: !configured ? "Google Chat not configured" : "Notifications disabled (DEV_MODE)",
    message,
  })
}
