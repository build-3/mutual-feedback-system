import { NextResponse } from "next/server"
import { requireMod } from "@/lib/server/require-admin"
import { buildModQueue } from "@/lib/server/mod-queue"

// Backs the /mod response console. requireMod() also carries the
// MOD_DASHBOARD_ENABLED kill switch, so this 404s whenever the console is off.
export async function GET() {
  const auth = await requireMod()
  if (auth.error) return auth.error

  const result = await buildModQueue()

  if (result.error || !result.data) {
    console.error("[/api/mod/queue] query failed", result.error)
    return NextResponse.json(
      { error: "We could not load the response queue." },
      { status: 500 }
    )
  }

  return NextResponse.json(result.data)
}
