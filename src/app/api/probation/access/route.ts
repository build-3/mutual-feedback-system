import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { isProbationDecider } from "@/lib/probation-access"

/**
 * A cheap yes/no for the nav: may this person open the probation board?
 * Deciders always; anyone else only if they sponsor somebody active. The board's
 * data route enforces the same rule, so this only decides whether to show a link.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (isProbationDecider(auth.user.email)) {
    return NextResponse.json({ canView: true })
  }
  if (!auth.employee) return NextResponse.json({ canView: false })

  const { count } = await getSupabaseAdmin()
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("sponsor_id", auth.employee.id)
    .eq("is_active", true)

  return NextResponse.json({ canView: (count ?? 0) > 0 })
}
