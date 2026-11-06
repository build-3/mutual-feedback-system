import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { getProbationOverview } from "@/lib/server/probation"
import {
  filterByScope,
  isProbationDecider,
  probationScopeFor,
} from "@/lib/probation-access"

/**
 * Probation records, scoped to the viewer:
 *  - deciders (see src/lib/probation-access.ts) get everyone and may act;
 *  - a sponsor gets only the people they sponsor, and may promote or extend them;
 *  - anyone else gets 403, which the page treats as "show nothing".
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const email = auth.user.email
  let sponsoredIds: string[] = []

  // Deciders need no sponsor lookup; everyone else might be somebody's sponsor.
  if (!isProbationDecider(email) && auth.employee) {
    const { data, error } = await getSupabaseAdmin()
      .from("employees")
      .select("id")
      .eq("sponsor_id", auth.employee.id)
      .eq("is_active", true)
    if (error) {
      console.error("[probation] sponsor lookup failed:", error.message)
      return NextResponse.json({ error: "Could not load probation data." }, { status: 500 })
    }
    sponsoredIds = (data ?? []).map((r) => r.id as string)
  }

  const scope = probationScopeFor({ viewerEmail: email, sponsoredIds })
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Probation access required." }, { status: 403 })
  }

  const overview = await getProbationOverview()
  const probations = filterByScope(overview.probations, scope)
  const totalActive =
    scope.kind === "all"
      ? overview.totalActive
      : probations.filter((p) => p.status === "active" || p.status === "extended").length

  return NextResponse.json({
    probations,
    totalActive,
    canAct: scope.canAct,
    canEditDates: scope.canEditDates,
  })
}
