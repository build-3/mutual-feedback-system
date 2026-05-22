import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin, requireAuth } from "@/lib/server/require-admin"

function normalizeName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error("Name is required.")
  }
  if (trimmed.length > 120) {
    throw new Error("Name must be 120 characters or less.")
  }
  return trimmed
}

function normalizeEmail(email: string | null | undefined) {
  const trimmed = email?.trim() || ""
  if (!trimmed) {
    return null
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(trimmed)) {
    throw new Error("Email must be valid.")
  }

  return trimmed.toLowerCase()
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from("employees")
    .select("id, name, role, email, is_active, buddy_id, sponsor_id, created_at")
    .order("role")
    .order("name")

  if (error) {
    return NextResponse.json(
      { error: "We could not load the roster right now." },
      { status: 500 }
    )
  }

  const response = NextResponse.json({ employees: data || [] })
  response.headers.set(
    "Cache-Control",
    "private, max-age=15, stale-while-revalidate=30"
  )
  return response
}

export async function POST(request: Request) {
  const postAuth = await requireAdmin()
  if (postAuth.error) return postAuth.error

  try {
    const body = await request.json()
    const role = body.role

    if (role !== "intern" && role !== "full_timer" && role !== "admin") {
      return NextResponse.json({ error: "Role is invalid." }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data: newEmployee, error } = await supabaseAdmin
      .from("employees")
      .insert({
        name: normalizeName(body.name),
        role,
        email: normalizeEmail(body.email),
      })
      .select("id")
      .single()

    if (error || !newEmployee) {
      return NextResponse.json(
        { error: error?.message || "We could not add that teammate." },
        { status: 400 }
      )
    }

    if (role === "intern") {
      const { createProbation, notifyReviewerGroup } = await import("@/lib/server/probation")
      const probation = await createProbation(newEmployee.id)

      if (!probation) {
        return NextResponse.json(
          { error: "Employee created but probation tracking failed. Contact admin." },
          { status: 500 }
        )
      }

      notifyReviewerGroup(
        normalizeName(body.name),
        probation.start_date,
        probation.end_date
      ).catch((err) => console.error("[employees] reviewer notification failed:", err))
    }

    return NextResponse.json({ status: "created" }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request is invalid."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const patchAuth = await requireAdmin()
  if (patchAuth.error) return patchAuth.error

  try {
    const body = await request.json()
    const { id, role, name, email, is_active, buddy_id, sponsor_id } = body

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return NextResponse.json({ error: "Employee id is invalid." }, { status: 400 })
    }

    const updates: Record<string, string | boolean | null> = {}

    if (typeof is_active === "boolean") {
      updates.is_active = is_active
    }

    if (role !== undefined) {
      if (role !== "intern" && role !== "full_timer" && role !== "admin") {
        return NextResponse.json({ error: "Role is invalid." }, { status: 400 })
      }
      // Prevent removing the last admin
      if (role !== "admin") {
        const supabaseAdmin = getSupabaseAdmin()
        const { data: admins } = await supabaseAdmin
          .from("employees")
          .select("id")
          .eq("role", "admin")

        const isLastAdmin =
          admins && admins.length === 1 && admins[0].id === id
        if (isLastAdmin) {
          return NextResponse.json(
            { error: "Cannot remove the last admin. Promote someone else first." },
            { status: 400 }
          )
        }
      }
      updates.role = role
    }

    if (name !== undefined) {
      updates.name = normalizeName(name)
    }

    if (email !== undefined) {
      updates.email = normalizeEmail(email)
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (buddy_id !== undefined) {
      if (buddy_id !== null && !uuidPattern.test(buddy_id)) {
        return NextResponse.json({ error: "Buddy id is invalid." }, { status: 400 })
      }
      if (buddy_id === id) {
        return NextResponse.json({ error: "An employee cannot be their own buddy." }, { status: 400 })
      }
      updates.buddy_id = buddy_id
    }
    if (sponsor_id !== undefined) {
      if (sponsor_id !== null && !uuidPattern.test(sponsor_id)) {
        return NextResponse.json({ error: "Sponsor id is invalid." }, { status: 400 })
      }
      if (sponsor_id === id) {
        return NextResponse.json({ error: "An employee cannot be their own sponsor." }, { status: 400 })
      }
      updates.sponsor_id = sponsor_id
    }

    const effectiveBuddy = buddy_id !== undefined ? buddy_id : null
    const effectiveSponsor = sponsor_id !== undefined ? sponsor_id : null
    if (effectiveBuddy && effectiveSponsor && effectiveBuddy === effectiveSponsor) {
      return NextResponse.json({ error: "Buddy and sponsor must be different people." }, { status: 400 })
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    if (effectiveBuddy || effectiveSponsor) {
      const idsToCheck = [effectiveBuddy, effectiveSponsor].filter(Boolean) as string[]
      const { data: candidates } = await supabaseAdmin
        .from("employees")
        .select("id, role")
        .in("id", idsToCheck)

      for (const cid of idsToCheck) {
        const found = candidates?.find((c) => c.id === cid)
        if (!found) {
          return NextResponse.json({ error: "Buddy or sponsor employee not found." }, { status: 400 })
        }
        if (found.role === "intern") {
          return NextResponse.json({ error: "Buddy and sponsor must be non-intern employees." }, { status: 400 })
        }
      }
    }

    const { error } = await supabaseAdmin
      .from("employees")
      .update(updates)
      .eq("id", id)

    if (error) {
      const safeMsg = error.message?.includes("chk_buddy_sponsor_different")
        ? "Buddy and sponsor must be different people."
        : "Update failed."
      return NextResponse.json(
        { error: safeMsg },
        { status: 400 }
      )
    }

    return NextResponse.json({ status: "updated" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request is invalid."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const delAuth = await requireAdmin()
  if (delAuth.error) return delAuth.error

  try {
    const body = await request.json()
    const id = body.id

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return NextResponse.json({ error: "Employee id is invalid." }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const [submissionReferenceResult, responseReferenceResult] = await Promise.all([
      supabaseAdmin
        .from("feedback_submissions")
        .select("id", { count: "exact", head: true })
        .or(`submitted_by_id.eq.${id},feedback_for_id.eq.${id}`),
      supabaseAdmin
        .from("feedback_responses")
        .select("id", { count: "exact", head: true })
        .eq("responder_id", id),
    ])

    if (submissionReferenceResult.error || responseReferenceResult.error) {
      return NextResponse.json(
        { error: "We could not validate delete safety right now." },
        { status: 500 }
      )
    }

    if ((submissionReferenceResult.count || 0) > 0 || (responseReferenceResult.count || 0) > 0) {
      return NextResponse.json(
        {
          error:
            "This teammate is tied to existing feedback, so we cannot remove them without risking history.",
        },
        { status: 409 }
      )
    }

    const { error } = await supabaseAdmin.from("employees").delete().eq("id", id)

    if (error) {
      return NextResponse.json(
        { error: error.message || "That delete did not stick." },
        { status: 400 }
      )
    }

    return NextResponse.json({ status: "deleted" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request is invalid."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
