import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { extendProbation } from "@/lib/server/probation"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LEVEL1_EMAILS = ["vc@build3.org", "at@build3.org"]

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  if (!auth.employee.email || !LEVEL1_EMAILS.includes(auth.employee.email)) {
    return NextResponse.json({ error: "Only Level 1 admins can extend." }, { status: 403 })
  }

  const body = await request.json()
  const { probationId } = body

  if (!probationId || !UUID_RE.test(probationId)) {
    return NextResponse.json({ error: "Invalid probation ID." }, { status: 400 })
  }

  const result = await extendProbation(probationId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }

  return NextResponse.json({ status: "extended", new_end_date: result.new_end_date })
}
