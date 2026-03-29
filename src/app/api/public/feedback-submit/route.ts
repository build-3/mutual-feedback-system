import { NextResponse } from "next/server"

// Deprecated: feedback submission now requires authentication.
// Use POST /api/feedback-submit instead.
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has been removed. Please log in and use /api/feedback-submit." },
    { status: 410 }
  )
}
