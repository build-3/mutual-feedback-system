import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { SELF_QUESTIONS } from "@/lib/questions"

const SELF_QUESTION_TEXT: Record<string, string> = Object.fromEntries(
  SELF_QUESTIONS.map((q) => [q.key, q.text])
)

export async function GET(
  _request: Request,
  { params }: { params: { employeeId: string } }
) {
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    )
  }

  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { employeeId } = params

  // Basic UUID-ish validation
  if (!employeeId || employeeId.length < 20) {
    return NextResponse.json({ error: "Invalid employee ID." }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Get the latest self-feedback submission
  const { data: submissions } = await supabaseAdmin
    .from("feedback_submissions")
    .select("id, created_at")
    .eq("submitted_by_id", employeeId)
    .eq("feedback_type", "self")
    .order("created_at", { ascending: false })
    .limit(5)

  if (!submissions || submissions.length === 0) {
    return NextResponse.json({ submission: null })
  }

  // Check each submission for answers (skip ghosts)
  for (const sub of submissions) {
    const { data: answerRows } = await supabaseAdmin
      .from("feedback_answers")
      .select("question_key, answer_value")
      .eq("submission_id", sub.id)

    if (answerRows && answerRows.length > 0) {
      const answers = answerRows.map((a) => ({
        question_key: a.question_key,
        question_text: SELF_QUESTION_TEXT[a.question_key] || a.question_key,
        answer_value: a.answer_value,
      }))

      return NextResponse.json({
        submission: {
          id: sub.id,
          created_at: sub.created_at,
          answers,
        },
      })
    }
  }

  return NextResponse.json({ submission: null })
}
