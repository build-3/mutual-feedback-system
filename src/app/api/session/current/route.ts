import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getActiveSession, getNextSessionDate } from "@/lib/server/session-utils"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const session = await getActiveSession()

  return NextResponse.json({
    session: session ?? null,
    // Already a YYYY-MM-DD IST date. Previously this was a Date run through
    // toISOString().split("T")[0], which silently shifted the date by a day on
    // any host whose timezone was ahead of UTC.
    nextSessionDate: getNextSessionDate(),
  })
}
