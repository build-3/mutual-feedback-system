import { NextResponse } from "next/server"
import { hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { runReviewGapAlerts } from "@/lib/server/review-gap"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

/**
 * Once a day: tell the sponsor of anyone in the final month of probation who has
 * feedback from fewer than 3 distinct full-time teammates. See
 * src/lib/review-gap.ts for the rule. Off until site_settings.sponsor_alerts_enabled
 * is "true" (shared with the sponsor feedback alerts).
 *
 * Coolify scheduled task: daily, GET with `Authorization: Bearer $CRON_SECRET`.
 *
 *   ?dry=true   show who would be told and the exact message. Sends nothing.
 */
export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 })
  }

  const dry = new URL(request.url).searchParams.get("dry") === "true"
  try {
    return NextResponse.json(await runReviewGapAlerts({ dry }))
  } catch (err) {
    console.error("[review-gap] run failed:", err)
    return NextResponse.json({ error: "Review-gap run failed." }, { status: 500 })
  }
}
