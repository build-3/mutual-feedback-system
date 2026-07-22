import { NextResponse } from "next/server"
import { requireMod } from "@/lib/server/require-admin"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"

// Serves the /mod org-review dashboard. Gated to MOD_EMAILS — this is the real
// security boundary; the data never enters the client bundle and only reaches
// the three allowed leadership accounts. The dataset is small (~40 rows/table),
// so a single ordered select per table is enough.
export async function GET() {
  const auth = await requireMod()
  if (auth.error) return auth.error

  const supabaseAdmin = getSupabaseAdmin()

  const [reviewsResult, responsesResult] = await Promise.all([
    supabaseAdmin
      .from("mod_reviews")
      .select(
        "id, department, employee_name, period, topic, review, severity"
      )
      .order("department", { ascending: true })
      .order("severity", { ascending: false }),
    supabaseAdmin
      .from("mod_responses")
      .select(
        "id, employee_name, policy_clarity, tools_resources, trust_battery, trust_battery_details, nps_score, comments, source_row"
      )
      .order("source_row", { ascending: true }),
  ])

  if (reviewsResult.error || responsesResult.error) {
    return NextResponse.json(
      { error: "Failed to load review data." },
      { status: 500 }
    )
  }

  return NextResponse.json({
    reviews: reviewsResult.data ?? [],
    responses: responsesResult.data ?? [],
  })
}
