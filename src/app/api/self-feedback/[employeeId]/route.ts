import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { SELF_QUESTIONS } from "@/lib/questions"
import { latestSubstantiveSubmission } from "@/lib/server/period-gate"

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

  // Scoped to the current cycle, and it MUST match the gate in
  // /api/self-feedback-check. The caller (fetchSelfFeedbackAndAdvance in
  // feedback/page.tsx) treats a null submission as "no reflection exists" and
  // silently skips the whole self_review step — no error, no message. So if this
  // window were narrower than the gate's, an intern could be told they had
  // already reflected while every reviewer saw nothing and the reflection was
  // never read by anyone. Both now come from the same cycle helper.
  const sub = await latestSubstantiveSubmission({
    employeeId,
    feedbackType: "self",
    limit: 5,
  })

  if (!sub) {
    return NextResponse.json({ submission: null })
  }

  const { data: answerRows } = await supabaseAdmin
    .from("feedback_answers")
    .select("question_key, answer_value")
    .eq("submission_id", sub.id)

  const answers = (answerRows ?? []).map((a) => ({
    question_key: a.question_key,
    question_text: SELF_QUESTION_TEXT[a.question_key] || a.question_key,
    answer_value: a.answer_value,
  }))

  return NextResponse.json({
    submission: { id: sub.id, created_at: sub.created_at, answers },
  })
}
