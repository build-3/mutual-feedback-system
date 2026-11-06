import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { extendProbation } from "@/lib/server/probation"
import { mayActOnProbation } from "@/lib/server/probation-permission"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const body = await request.json()
  const { probationId } = body

  if (!probationId || !UUID_RE.test(probationId)) {
    return NextResponse.json({ error: "Invalid probation ID." }, { status: 400 })
  }

  // Deciders may extend anyone; a sponsor only the person they sponsor.
  const allowed = await mayActOnProbation(
    { email: auth.user.email, employeeId: auth.employee?.id ?? null },
    probationId
  )
  if (!allowed) {
    return NextResponse.json(
      { error: "Only a probation decider or this person's sponsor can extend." },
      { status: 403 }
    )
  }

  const result = await extendProbation(probationId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }

  return NextResponse.json({ status: "extended", new_end_date: result.new_end_date })
}
