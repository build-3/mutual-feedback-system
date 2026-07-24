import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { buildInsightsPayload } from "@/lib/server/fetch-dashboard-data"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const result = await buildInsightsPayload()

  if (result.error || !result.data) {
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
