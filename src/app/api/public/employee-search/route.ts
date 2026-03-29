import { NextResponse } from "next/server"

// Deprecated: employee search now requires authentication.
// Use GET /api/employee-search instead.
export async function GET() {
  return NextResponse.json(
    { error: "This endpoint has been removed. Please log in and use /api/employee-search." },
    { status: 410 }
  )
}
