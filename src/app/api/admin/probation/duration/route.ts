import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { updateProbationDuration } from "@/lib/server/probation"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await request.json()
  const { probationId, months } = body

  if (!probationId || !UUID_RE.test(probationId)) {
    return NextResponse.json({ error: "Invalid probation ID." }, { status: 400 })
  }

  if (months !== 3 && months !== 6) {
    return NextResponse.json({ error: "Duration must be 3 or 6 months." }, { status: 400 })
  }

  const result = await updateProbationDuration(probationId, months)

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }

  return NextResponse.json({ status: "updated", end_date: result.end_date })
}
