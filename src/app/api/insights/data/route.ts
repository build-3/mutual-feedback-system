import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { fetchDashboardData } from "@/lib/server/fetch-dashboard-data"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  // Any authenticated user can view insights — not admin-only
  const result = await fetchDashboardData()

  if (result.error) {
    return NextResponse.json(
      { error: "We could not load insight data right now." },
      { status: 500 }
    )
  }

  const response = NextResponse.json(result.data)
  response.headers.set(
    "Cache-Control",
    "private, max-age=30, stale-while-revalidate=60"
  )
  return response
}
