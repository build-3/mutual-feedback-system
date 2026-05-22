import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { getProbationOverview } from "@/lib/server/probation"

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const data = await getProbationOverview()
  return NextResponse.json(data)
}
