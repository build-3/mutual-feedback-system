import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getActiveSession, getNextSecondTuesday } from "@/lib/server/session-utils"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const session = await getActiveSession()
  const nextSession = getNextSecondTuesday()

  return NextResponse.json({
    session: session ?? null,
    nextSessionDate: nextSession.toISOString().split("T")[0],
  })
}
