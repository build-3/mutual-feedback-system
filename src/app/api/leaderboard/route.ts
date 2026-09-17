import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { buildLeaderboardPayload } from "@/lib/server/leaderboard"
import type { DateRange } from "@/lib/brand"

const RANGES: DateRange[] = ["cycle", "3cycles", "all"]

/**
 * The feedback leaderboard.
 *
 * requireAuth, not requireAdmin: this is roster-wide by design. A board only
 * leadership can see is a management report, not gamification — and the
 * existing insights page already shows every person's feedback to everyone
 * signed in, so this needs no new access model.
 *
 * What keeps it safe is what is ranked, not who can look: only giving is
 * ranked, received is never sorted on, and no feedback content is returned.
 */
export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const rangeParam = new URL(request.url).searchParams.get("range")
  const range: DateRange = RANGES.includes(rangeParam as DateRange)
    ? (rangeParam as DateRange)
    : "cycle"

  try {
    const payload = await buildLeaderboardPayload(range)
    const response = NextResponse.json(payload)
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60")
    return response
  } catch (err: unknown) {
    console.error("[leaderboard] failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "We could not load the leaderboard right now." }, { status: 500 })
  }
}
