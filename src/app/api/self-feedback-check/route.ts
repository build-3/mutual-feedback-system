import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { hasSubstantiveSubmission } from "@/lib/server/period-gate"

export async function GET() {
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    )
  }

  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (!auth.employee) {
    return NextResponse.json({ hasSelfFeedback: false })
  }

  // Scoped to the current cycle (2nd Tuesday → 2nd Tuesday), not the calendar
  // month. A reflection logged just after a session belongs to the cycle that
  // session opened, and the gate has to agree with what /insights shows.
  const hasSelfFeedback = await hasSubstantiveSubmission({
    employeeId: auth.employee.id,
    feedbackType: "self",
  })

  return NextResponse.json({ hasSelfFeedback })
}
