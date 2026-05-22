import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getTopRecipients } from "@/lib/server/kudos"

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const limitParam = Number(searchParams.get("limit") ?? "3")
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 20 ? limitParam : 3

  const sinceDaysParam = Number(searchParams.get("sinceDays") ?? "30")
  const sinceDays = Number.isFinite(sinceDaysParam) && sinceDaysParam > 0 && sinceDaysParam <= 365 ? sinceDaysParam : 30

  try {
    const top = await getTopRecipients(limit, sinceDays)
    return NextResponse.json({ top, sinceDays })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Failed to load leaderboard: ${msg}` }, { status: 500 })
  }
}
