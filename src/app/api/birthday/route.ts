import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"

const MM_DD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!auth.employee) {
    return NextResponse.json({ error: "No employee record found." }, { status: 403 })
  }

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 })
  }

  let body: { birthday?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  const { birthday } = body
  if (!birthday || !MM_DD_RE.test(birthday)) {
    return NextResponse.json({ error: "Birthday must be in MM-DD format." }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from("employees")
    .update({ birthday })
    .eq("id", auth.employee.id)

  if (error) {
    return NextResponse.json({ error: "Failed to save birthday." }, { status: 500 })
  }

  return NextResponse.json({ success: true, birthday })
}
