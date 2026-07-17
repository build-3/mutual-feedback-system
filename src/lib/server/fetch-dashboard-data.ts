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
  columns: string,
  orderBy = "id"
): Promise<{ data: T[]; error: unknown }> {
  const supabaseAdmin = getSupabaseAdmin()
  const allRows: T[] = []
  let offset = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Stable order is required: without it Postgres may shuffle rows
    // between page requests, duplicating some and dropping others.
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
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
      fetchAll(
        "employees",
        "id, name, role, email, birthday, is_active, created_at",
        "name"
      ),
      fetchAll(
        "feedback_submissions",
        "id, submitted_by_id, feedback_for_id, feedback_type, notified_at, created_at"
      ),
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

  // Consumers (timeline, admin browser) expect newest-first submissions —
  // pagination fetches by id for stability, so restore the display order here.
  const submissions = (submissionResult.data || []) as { created_at: string }[]
  submissions.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return {
    data: {
      employees: employeeResult.data || [],
      submissions,
      answers: answerResult.data || [],
      responses: responseResult.data || [],
    },
  }
}
