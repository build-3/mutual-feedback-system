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
    return NextResponse.json({ hasBuddyFeedback: false, hasSponsorFeedback: false })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Check current calendar month only
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  // Check buddy and sponsor feedback in parallel
  const [buddyResult, sponsorResult] = await Promise.all([
    supabaseAdmin
      .from("feedback_submissions")
      .select("id")
      .eq("submitted_by_id", auth.employee.id)
      .eq("feedback_type", "buddy")
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd)
      .limit(5),
    supabaseAdmin
      .from("feedback_submissions")
      .select("id")
      .eq("submitted_by_id", auth.employee.id)
      .eq("feedback_type", "sponsor")
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd)
      .limit(5),
  ])

  // Verify at least one submission has actual answers
  async function hasAnswers(submissions: { id: string }[] | null): Promise<boolean> {
    if (!submissions || submissions.length === 0) return false
    for (const sub of submissions) {
      const { count } = await supabaseAdmin
        .from("feedback_answers")
        .select("id", { count: "exact", head: true })
        .eq("submission_id", sub.id)
      if (count && count > 0) return true
    }
    return false
  }

  const [hasBuddyFeedback, hasSponsorFeedback] = await Promise.all([
    hasAnswers(buddyResult.data),
    hasAnswers(sponsorResult.data),
  ])

  return NextResponse.json({ hasBuddyFeedback, hasSponsorFeedback })
}
