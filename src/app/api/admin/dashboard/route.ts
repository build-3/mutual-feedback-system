import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { fetchDashboardData } from "@/lib/server/fetch-dashboard-data"

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const result = await fetchDashboardData()

  if (result.error) {
    return NextResponse.json(
      { error: "We could not load dashboard data right now." },
      { status: 500 }
    )
  }

  const response = NextResponse.json(result.data)
  // Cache for 30s, allow stale for 60s while revalidating
  response.headers.set(
    "Cache-Control",
    "private, max-age=30, stale-while-revalidate=60"
  )
  return response
}
