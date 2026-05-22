import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { promoteToFullTime } from "@/lib/server/probation"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await request.json()
  const { probationId } = body

  if (!probationId || !UUID_RE.test(probationId)) {
    return NextResponse.json({ error: "Invalid probation ID." }, { status: 400 })
  }

  const result = await promoteToFullTime(probationId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }

  return NextResponse.json({ status: "promoted" })
}
