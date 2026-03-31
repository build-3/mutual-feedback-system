import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const supabaseAdmin = getSupabaseAdmin()

  // Get row counts for all tables in parallel using head-only requests
  const [empCount, subCount, ansCount, resCount] = await Promise.all([
    supabaseAdmin.from("employees").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("feedback_submissions").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("feedback_answers").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("feedback_responses").select("id", { count: "exact", head: true }),
  ])

  const tables = [
    { name: "employees", rows: empCount.count ?? 0 },
    { name: "feedback_submissions", rows: subCount.count ?? 0 },
    { name: "feedback_answers", rows: ansCount.count ?? 0 },
    { name: "feedback_responses", rows: resCount.count ?? 0 },
  ]

  const totalRows = tables.reduce((sum, t) => sum + t.rows, 0)

  const response = NextResponse.json({
    database: {
      tables,
      totalRows,
    },
    supabase: {
      projectRef: process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
        /https:\/\/([^.]+)\./
      )?.[1] ?? "unknown",
      plan: "free",
      limits: {
        dbSize: "500 MB",
        bandwidth: "5 GB",
        storageSize: "1 GB",
        edgeFunctionInvocations: "500,000/mo",
        realtimeMessages: "2M/mo",
      },
    },
  })

  response.headers.set(
    "Cache-Control",
    "private, max-age=60, stale-while-revalidate=120"
  )
  return response
}
