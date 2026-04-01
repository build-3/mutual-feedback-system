import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"

const PAGE_SIZE = 1000

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const supabaseAdmin = getSupabaseAdmin()

  // Fetch all four tables in parallel — select only columns the client needs.
  // Smaller payloads = faster serialization + transfer + parsing.
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
      { error: "We could not load dashboard data right now." },
      { status: 500 }
    )
  }

  const response = NextResponse.json({
    employees: employeeResult.data || [],
    submissions: submissionResult.data || [],
    answers: answerResult.data || [],
    responses: responseResult.data || [],
  })

  // Cache for 30s, allow stale for 60s while revalidating
  response.headers.set(
    "Cache-Control",
    "private, max-age=30, stale-while-revalidate=60"
  )
  return response
}
