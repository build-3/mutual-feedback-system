import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { consumeRateLimit } from "@/lib/server/rate-limit"
import { mayActOnProbation } from "@/lib/server/probation-permission"
import { summarizeProbationFeedback } from "@/lib/server/probation-summary"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * An on-demand AI summary of the written feedback a person on probation has
 * received. Same audience as the probation card: deciders, and a person's
 * sponsor. Generated when asked for, never stored.
 */
export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let body: { probationId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 })
  }
  if (typeof body.probationId !== "string" || !UUID_RE.test(body.probationId)) {
    return NextResponse.json({ error: "Invalid probation ID." }, { status: 400 })
  }

  const allowed = await mayActOnProbation(
    { email: auth.user.email, employeeId: auth.employee?.id ?? null },
    body.probationId
  )
  if (!allowed) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 })
  }

  const limit = consumeRateLimit({
    bucket: "probation-summary",
    key: auth.user.email,
    limit: 10,
    windowMs: 60_000,
  })
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many summaries. Wait a minute." }, { status: 429 })
  }

  const result = await summarizeProbationFeedback(body.probationId)
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }
  return NextResponse.json(result)
}
