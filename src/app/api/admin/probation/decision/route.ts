import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { executeProbationDecision } from "@/lib/server/probation-actions"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_ACTIONS = new Set(["extend", "convert", "conclude"])

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await request.json()
  const { probationId, action, note } = body

  if (!UUID_RE.test(probationId)) {
    return NextResponse.json({ error: "Invalid probation id." }, { status: 400 })
  }

  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "Action must be extend, convert, or conclude." },
      { status: 400 }
    )
  }

  const result = await executeProbationDecision({ probationId, action, note })

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: result.httpStatus ?? 500 }
    )
  }

  const response: Record<string, string> = { status: result.status ?? action }
  if (result.newEndDate) {
    response.new_end_date = result.newEndDate
  }

  return NextResponse.json(response)
}
