import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { submitProbationReview } from "@/lib/server/probation"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await request.json()
  const { probationId, contributionLevel, backingScore } = body

  if (!probationId || !UUID_RE.test(probationId)) {
    return NextResponse.json({ error: "Invalid probation ID." }, { status: 400 })
  }

  if (contributionLevel !== "independent_contributor" && contributionLevel !== "leader") {
    return NextResponse.json({ error: "Invalid contribution level." }, { status: 400 })
  }

  const score = Number(backingScore)
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return NextResponse.json({ error: "Backing score must be 1-5." }, { status: 400 })
  }

  const result = await submitProbationReview(
    probationId,
    auth.employee.id,
    contributionLevel,
    score
  )

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }

  return NextResponse.json({ status: "submitted" })
}
