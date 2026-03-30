import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import type { SupabaseClient } from "@supabase/supabase-js"

const PAGE_SIZE = 1000

async function fetchAll<T = Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  select: string,
  orderCol: string,
  ascending = true
): Promise<{ data: T[]; error: Error | null }> {
  const all: T[] = []
  let from = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .order(orderCol, { ascending })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: [], error }
    if (!data || data.length === 0) break

    all.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: all, error: null }
}

// This endpoint is behind middleware auth (requires @build3.org login)
// but does NOT require admin role — any authenticated employee can view insights.
export async function GET() {
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    )
  }

  const supabaseAdmin = getSupabaseAdmin()

  const [employeeResult, submissionResult, answerResult, responseResult] =
    await Promise.all([
      supabaseAdmin
        .from("employees")
        .select("id, name, role, created_at")
        .order("name"),
      fetchAll(supabaseAdmin, "feedback_submissions", "*", "created_at", false),
      fetchAll(supabaseAdmin, "feedback_answers", "*", "created_at", true),
      fetchAll(supabaseAdmin, "feedback_responses", "*", "created_at", true),
    ])

  const firstError =
    employeeResult.error ||
    submissionResult.error ||
    answerResult.error ||
    responseResult.error

  if (firstError) {
    return NextResponse.json(
      { error: "We could not load insights data right now." },
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
