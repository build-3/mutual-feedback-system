import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { sendDirectMessage, isGoogleChatConfigured } from "@/lib/server/google-chat"
import { analyzeProbationStanding, buildProbationMessage } from "@/lib/server/probation-rules"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

function isSecondTuesday(date: Date): boolean {
  if (date.getDay() !== 2) return false
  const day = date.getDate()
  return day >= 8 && day <= 14
}

function getISTDate(): Date {
  // Use Intl to get IST components — works on any server timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00+05:30`)
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

  const url = new URL(request.url)
  const force = url.searchParams.get("force") === "true"

  if (!force) {
    const nowIST = getISTDate()
    if (!isSecondTuesday(nowIST)) {
      return NextResponse.json({ skipped: true, reason: "Not the 2nd Tuesday." })
    }
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: probations, error } = await supabaseAdmin
    .from("probation_tracking")
    .select("id, employee_id")
    .in("probation_status", ["active", "extended"])

  if (error) {
    return NextResponse.json({ error: "DB query failed." }, { status: 500 })
  }

  if (!probations || probations.length === 0) {
    return NextResponse.json({ sent: 0, reason: "No active probations." })
  }

  const empIds = Array.from(new Set(probations.map((r) => r.employee_id)))
  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name, email")
    .in("id", empIds)
  const empMap = new Map((emps ?? []).map((e) => [e.id, e]))

  const results: { name: string; success: boolean; error?: string }[] = []

  for (const prob of probations) {
    const emp = empMap.get(prob.employee_id) ?? null
    if (!emp?.email) {
      results.push({ name: emp?.name ?? "unknown", success: false, error: "No email" })
      continue
    }

    try {
      const standing = await analyzeProbationStanding(prob.employee_id, emp.name)
      const message = buildProbationMessage(emp.name, standing)

      if (isGoogleChatConfigured()) {
        await sendDirectMessage(emp.email, message)
        await supabaseAdmin
          .from("probation_tracking")
          .update({ rules_last_sent_at: new Date().toISOString() })
          .eq("id", prob.id)
      }

      results.push({ name: emp.name, success: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      results.push({ name: emp.name, success: false, error: msg })
    }
  }

  return NextResponse.json({
    sent: results.filter((r) => r.success).length,
    results,
  })
}
