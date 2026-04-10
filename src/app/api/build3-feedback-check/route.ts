import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"

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

  const supabaseAdmin = getSupabaseAdmin()

  // Find build3 feedback submissions by this user
  const { data: submissions } = await supabaseAdmin
    .from("feedback_submissions")
    .select("id")
    .eq("submitted_by_id", auth.employee.id)
    .eq("feedback_type", "build3")
    .order("created_at", { ascending: false })
    .limit(10)

  if (!submissions || submissions.length === 0) {
    return NextResponse.json({ hasBuild3Feedback: false })
  }

  // Check if any has actual answers (not ghost)
  for (const sub of submissions) {
    const { count } = await supabaseAdmin
      .from("feedback_answers")
      .select("id", { count: "exact", head: true })
      .eq("submission_id", sub.id)

    if (count && count > 0) {
      return NextResponse.json({ hasBuild3Feedback: true })
    }
  }

  return NextResponse.json({ hasBuild3Feedback: false })
}
