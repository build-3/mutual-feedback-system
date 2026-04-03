import "server-only"

import { getSupabaseAdmin } from "@/lib/server/supabase-admin"

const PAGE_SIZE = 1000

/**
 * Fetch all dashboard tables in parallel — shared between
 * /api/insights/data (auth-only) and /api/admin/dashboard (admin-only).
 */
export async function fetchDashboardData() {
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
    return { error: firstError }
  }

  return {
    data: {
      employees: employeeResult.data || [],
      submissions: submissionResult.data || [],
      answers: answerResult.data || [],
      responses: responseResult.data || [],
    },
  }
}
