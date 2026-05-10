import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from("probation_tracking")
    .select("*")
    .order("probation_end_date", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: "Could not load probation records." },
      { status: 500 }
    )
  }

  const employeeIds = Array.from(new Set((data ?? []).map((r) => r.employee_id)))
  const { data: emps } = employeeIds.length > 0
    ? await supabaseAdmin
        .from("employees")
        .select("id, name, email, role")
        .in("id", employeeIds)
    : { data: [] }

  const empMap = new Map((emps ?? []).map((e) => [e.id, e]))

  const probations = (data ?? []).map((r) => ({
    ...r,
    employees: empMap.get(r.employee_id) ?? null,
  }))

  return NextResponse.json({ probations })
}
