import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { setProbationStartDate } from "@/lib/server/probation"
import { isProbationDecider } from "@/lib/probation-access"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Set the real joining date for a probation. The end date is recomputed from
 * the stored period, and the change is written to probation_date_changes with
 * who made it. Deciders only.
 */
export async function PATCH(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (!isProbationDecider(auth.user.email)) {
    return NextResponse.json(
      { error: "Only probation deciders can change a joining date." },
      { status: 403 }
    )
  }

  let body: { probationId?: unknown; startDate?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 })
  }

  if (typeof body.probationId !== "string" || !UUID_RE.test(body.probationId)) {
    return NextResponse.json({ error: "Invalid probation ID." }, { status: 400 })
  }

  const result = await setProbationStartDate(body.probationId, String(body.startDate ?? ""), {
    changedBy: auth.employee?.id ?? null,
    source: `admin: ${auth.user.email}`,
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }

  return NextResponse.json(result)
}
