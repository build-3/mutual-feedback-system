import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { buildInsightsPayload } from "@/lib/server/fetch-dashboard-data"
import { LEGACY_DATE_RANGE_ALIASES, type DateRange } from "@/lib/brand"
import { cycleFor, cycleFromKey } from "@/lib/cycles"

const VALID_RANGES: DateRange[] = ["cycle", "3cycles", "all"]

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  // Scope every metric to one window. Without this the org averages were
  // always all-time while the per-employee numbers rendered beside them were
  // range-filtered on the client, so the two halves of every comparison
  // silently disagreed.
  const params = new URL(request.url).searchParams
  const requested = params.get("range")
  const range: DateRange = VALID_RANGES.includes(requested as DateRange)
    ? (requested as DateRange)
    : // Pre-cycle bookmarks and in-flight clients resolve to the nearest
      // equivalent rather than silently falling through to the default.
      LEGACY_DATE_RANGE_ALIASES[requested ?? ""] ?? "cycle"

  // An unparseable key must never become a NaN window: every comparison against
  // NaN is false, so the response would be empty while still returning 200.
  // cycleFromKey returns null for anything that is not a real cycle boundary.
  const requestedCycle = params.get("cycle")
  const cycleKey = (requestedCycle && cycleFromKey(requestedCycle)?.key) || cycleFor().key

  const result = await buildInsightsPayload(range, cycleKey)

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: "We could not load insight data right now." },
      { status: 500 }
    )
  }

  // Echo both back so the client adopts the resolved values rather than trusting
  // its own state — an old client asking for range=month then renders the right
  // label instead of mislabelling cycle data.
  const response = NextResponse.json({ ...result.data, range, cycleKey })
  response.headers.set(
    "Cache-Control",
    "private, max-age=30, stale-while-revalidate=60"
  )
  return response
}
