import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"
import { analyzeEnhancedProbationStanding, buildEnhancedProbationMessage, buildCeoReviewMessage, CEO_EMAIL } from "@/lib/server/probation-rules"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const url = new URL(request.url)
  const employeeId = url.searchParams.get("employee")
  const type = url.searchParams.get("type") ?? "rules"

  if (!employeeId || !UUID_RE.test(employeeId)) {
    return NextResponse.json({ error: "Provide a valid ?employee=UUID" }, { status: 400 })
  }

  if (type !== "rules" && type !== "ceo") {
    return NextResponse.json({ error: "type must be 'rules' or 'ceo'." }, { status: 400 })
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

  const standing = await analyzeEnhancedProbationStanding(employeeId, emp.name, prob.join_date)

  if (type === "ceo") {
    const message = buildCeoReviewMessage(emp.name, standing, prob)
    return NextResponse.json({ recipient: `${CEO_EMAIL} (CEO)`, standing, message })
  }

  const message = buildEnhancedProbationMessage(emp.name, standing)
  return NextResponse.json({ recipient: emp.name, standing, message })
}
