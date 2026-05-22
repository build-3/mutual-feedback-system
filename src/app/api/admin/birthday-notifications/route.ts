import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from("birthday_notifications" as never)
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: "DB query failed." }, { status: 500 })
  }

  return NextResponse.json({ notifications: data ?? [] })
}
