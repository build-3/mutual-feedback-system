import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { buildInsightsPayload } from "@/lib/server/fetch-dashboard-data"
import type { DateRange } from "@/lib/brand"

const VALID_RANGES: DateRange[] = ["month", "3months", "all"]

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  // Scope every metric to one window. Without this the org averages were
  // always all-time while the per-employee numbers rendered beside them were
  // range-filtered on the client, so the two halves of every comparison
  // silently disagreed.
  const requested = new URL(request.url).searchParams.get("range")
  const range: DateRange = VALID_RANGES.includes(requested as DateRange)
    ? (requested as DateRange)
    : "3months"

  const result = await buildInsightsPayload(range)

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: "We could not load insight data right now." },
      { status: 500 }
    )
  }

  const response = NextResponse.json({ ...result.data, range })
  response.headers.set(
    "Cache-Control",
    "private, max-age=30, stale-while-revalidate=60"
  )
  return response
}
