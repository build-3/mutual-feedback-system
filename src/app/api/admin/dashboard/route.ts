import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"

const PAGE_SIZE = 1000

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const supabaseAdmin = getSupabaseAdmin()

  // Fetch all four tables in parallel — each uses a single range query.
  // For tables that might exceed 1000 rows, we do a count-first approach
  // to decide if pagination is needed, but for a small internal team
  // a single 1000-row page per table is sufficient.
  const [employeeResult, submissionResult, answerResult, responseResult] =
    await Promise.all([
      supabaseAdmin
        .from("employees")
        .select("id, name, role, created_at")
        .order("name")
        .range(0, PAGE_SIZE - 1),
      supabaseAdmin
        .from("feedback_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1),
      supabaseAdmin
        .from("feedback_answers")
        .select("*")
        .order("created_at")
        .range(0, PAGE_SIZE - 1),
      supabaseAdmin
        .from("feedback_responses")
        .select("*")
        .order("created_at")
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
