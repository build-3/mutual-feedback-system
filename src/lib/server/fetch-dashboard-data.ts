import "server-only"

import { getSupabaseAdmin } from "@/lib/server/supabase-admin"

const PAGE_SIZE = 1000

/**
 * Fetch all rows from a table in PAGE_SIZE chunks.
 * Supabase caps .range() at 1000 rows per call; tables like
 * feedback_answers can exceed that limit.
 */
async function fetchAll<T>(
  table: string,
  columns: string
): Promise<{ data: T[]; error: unknown }> {
  const supabaseAdmin = getSupabaseAdmin()
  const allRows: T[] = []
  let offset = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) return { data: [], error }
    if (!data || data.length === 0) break

    allRows.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return { data: allRows, error: null }
}

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
        .select("id, name, role, email, birthday, created_at")
        .order("name")
        .range(0, PAGE_SIZE - 1),
      supabaseAdmin
        .from("feedback_submissions")
        .select("id, submitted_by_id, feedback_for_id, feedback_type, notified_at, created_at")
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1),
      fetchAll(
        "feedback_answers",
        "id, submission_id, question_key, question_text, answer_value, created_at"
      ),
      fetchAll(
        "feedback_responses",
        "id, answer_id, responder_id, response_text, created_at"
      ),
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
