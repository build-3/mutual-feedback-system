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
    return NextResponse.json({ hasBuild3Feedback: false })
  }

  // Scoped to the current cycle, not the calendar month — see period-gate.ts.
  const hasBuild3Feedback = await hasSubstantiveSubmission({
    employeeId: auth.employee.id,
    feedbackType: "build3",
  })

  return NextResponse.json({ hasBuild3Feedback })
}
