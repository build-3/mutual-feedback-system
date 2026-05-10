import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { sendDirectMessage, isGoogleChatConfigured } from "@/lib/server/google-chat"
import { analyzeProbationStanding, buildCeoReviewMessage, CEO_EMAIL } from "@/lib/server/probation-rules"

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

  const supabaseAdmin = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: due, error } = await supabaseAdmin
    .from("probation_tracking")
    .select("id, employee_id, join_date, probation_status, probation_end_date, ceo_alerted_at")
    .in("probation_status", ["active", "extended"])
    .lte("probation_end_date", now)

  if (error) {
    return NextResponse.json({ error: "DB query failed." }, { status: 500 })
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ notified: 0 })
  }

  // Skip if CEO was already alerted in the last 7 days
  const needsAlert = due.filter((r) => {
    if (!r.ceo_alerted_at) return true
    const daysSinceAlert = (Date.now() - new Date(r.ceo_alerted_at).getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceAlert >= 7
  })

  if (needsAlert.length === 0) {
    return NextResponse.json({ notified: 0, reason: "All already alerted within 7 days." })
  }

  const empIds = Array.from(new Set(needsAlert.map((r) => r.employee_id)))
  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name, email")
    .in("id", empIds)
  const empMap = new Map((emps ?? []).map((e) => [e.id, e]))

  const results: { name: string; success: boolean; error?: string }[] = []

  for (const record of needsAlert) {
    const emp = empMap.get(record.employee_id) ?? null
    const name = emp?.name ?? "Unknown"

    try {
      const standing = await analyzeProbationStanding(record.employee_id, name)
      const message = buildCeoReviewMessage(name, standing, record, `${APP_URL}/glock17?tab=probation`)

      if (isGoogleChatConfigured()) {
        // Mark alerted BEFORE send to prevent double-fire on concurrent Vercel invocations
        await supabaseAdmin
          .from("probation_tracking")
          .update({ ceo_alerted_at: now })
          .eq("id", record.id)

        await sendDirectMessage(CEO_EMAIL, message)
      }

      results.push({ name, success: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      console.error(`[probation-check] Failed for ${name}:`, err)
      results.push({ name, success: false, error: msg })
    }
  }

  return NextResponse.json({
    notified: results.filter((r) => r.success).length,
    results,
  })
}
