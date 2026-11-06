import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { isProbationDecider } from "@/lib/probation-access"
import { validateAssignment, type AssignEmployee } from "@/lib/probation-assignment"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Auth = Awaited<ReturnType<typeof requireAuth>>

/** Admin-page access: the admin role, or a probation decider. */
function mayAssign(auth: Exclude<Auth, { error: NextResponse }>): boolean {
  return auth.employee?.role === "admin" || isProbationDecider(auth.user.email)
}

function readId(value: unknown): string | null | undefined | "invalid" {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  return typeof value === "string" && UUID_RE.test(value) ? value : "invalid"
}

/**
 * Everyone on probation with their sponsor and buddy, plus the active roster to
 * pick from. Feeds the admin page's "sponsors" tab.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!mayAssign(auth)) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const [{ data: probations, error: probError }, { data: roster, error: rosterError }] =
    await Promise.all([
      supabaseAdmin
        .from("probation_tracking")
        .select("employee_id, status, end_date")
        .in("status", ["active", "extended"])
        .order("end_date", { ascending: true }),
      supabaseAdmin
        .from("employees")
        .select("id, name, role, email, is_active, sponsor_id, buddy_id")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ])
  if (probError || rosterError) {
    console.error("[probation] assignment list failed:", (probError ?? rosterError)?.message)
    return NextResponse.json({ error: "Could not load the list." }, { status: 500 })
  }

  const byId = new Map((roster ?? []).map((e) => [e.id as string, e]))
  const people = (probations ?? []).flatMap((p) => {
    const e = byId.get(p.employee_id as string)
    if (!e) return []
    return [
      {
        employee_id: e.id as string,
        name: e.name as string,
        status: p.status as string,
        end_date: p.end_date as string,
        sponsor_id: (e.sponsor_id as string | null) ?? null,
        buddy_id: (e.buddy_id as string | null) ?? null,
      },
    ]
  })

  return NextResponse.json({
    people,
    roster: (roster ?? []).map((e) => ({ id: e.id as string, name: e.name as string, role: e.role as string })),
  })
}

/**
 * Assign (or clear) the sponsor and buddy of someone on probation. Admin page
 * only. Once a sponsor is set they see that person's probation card through
 * GET /api/admin/probation, and get the low-trust feedback alerts.
 */
export async function PATCH(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (!mayAssign(auth)) {
    return NextResponse.json(
      { error: "Only admins can assign a sponsor or buddy." },
      { status: 403 }
    )
  }

  let body: { employeeId?: unknown; sponsorId?: unknown; buddyId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 })
  }

  if (typeof body.employeeId !== "string" || !UUID_RE.test(body.employeeId)) {
    return NextResponse.json({ error: "Invalid employee ID." }, { status: 400 })
  }
  const sponsorId = readId(body.sponsorId)
  const buddyId = readId(body.buddyId)
  if (sponsorId === "invalid" || buddyId === "invalid") {
    return NextResponse.json({ error: "Invalid sponsor or buddy ID." }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const wanted = [body.employeeId, sponsorId, buddyId].filter((v): v is string => typeof v === "string")

  const [{ data: rows, error: peopleError }, { data: open, error: openError }] = await Promise.all([
    supabaseAdmin.from("employees").select("id, name, role, is_active").in("id", wanted),
    supabaseAdmin
      .from("probation_tracking")
      .select("id")
      .eq("employee_id", body.employeeId)
      .in("status", ["active", "extended"])
      .limit(1),
  ])
  if (peopleError || openError) {
    console.error("[probation] assignment lookup failed:", (peopleError ?? openError)?.message)
    return NextResponse.json({ error: "Could not check that assignment." }, { status: 500 })
  }

  const people = new Map<string, AssignEmployee>(
    ((rows ?? []) as AssignEmployee[]).map((p) => [p.id, { ...p, is_active: p.is_active !== false }])
  )

  const checked = validateAssignment({
    request: { employeeId: body.employeeId, sponsorId, buddyId },
    people,
    hasOpenProbation: (open ?? []).length > 0,
  })
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: checked.httpStatus })
  }

  const { error } = await supabaseAdmin
    .from("employees")
    .update(checked.update)
    .eq("id", body.employeeId)
  if (error) {
    console.error("[probation] assignment update failed:", error.message)
    return NextResponse.json({ error: "Could not save the assignment." }, { status: 500 })
  }

  return NextResponse.json({ status: "saved", ...checked.update })
}
