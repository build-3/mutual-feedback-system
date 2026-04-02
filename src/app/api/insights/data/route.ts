import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAuth } from "@/lib/server/require-admin"

const PAGE_SIZE = 1000

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  // Any authenticated user can view insights — not admin-only
  const supabaseAdmin = getSupabaseAdmin()

  const [employeeResult, submissionResult, answerResult, responseResult] =
    await Promise.all([
      supabaseAdmin
        .from("employees")
        .select("id, name, role, email, created_at")
        .order("name")
        .range(0, PAGE_SIZE - 1),
      supabaseAdmin
        .from("feedback_submissions")
        .select("id, submitted_by_id, feedback_for_id, feedback_type, created_at")
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1),
      supabaseAdmin
        .from("feedback_answers")
        .select("id, submission_id, question_key, question_text, answer_value")
        .range(0, PAGE_SIZE - 1),
      supabaseAdmin
        .from("feedback_responses")
        .select("id, answer_id, responder_id, response_text, created_at")
        .range(0, PAGE_SIZE - 1),
    ])

  const firstError =
    employeeResult.error ||
    submissionResult.error ||
    answerResult.error ||
    responseResult.error

  if (firstError) {
    return NextResponse.json(
      { error: "We could not load insight data right now." },
      { status: 500 }
    )
  }

  const response = NextResponse.json({
    employees: employeeResult.data || [],
    submissions: submissionResult.data || [],
    answers: answerResult.data || [],
    responses: responseResult.data || [],
  })

  response.headers.set(
    "Cache-Control",
    "private, max-age=30, stale-while-revalidate=60"
  )
  return response
}
