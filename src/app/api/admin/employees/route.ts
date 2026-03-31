import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"

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
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from("employees")
    .select("id, name, role, email, created_at")
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
    const { error } = await supabaseAdmin.from("employees").insert({
      name: normalizeName(body.name),
      role,
      email: normalizeEmail(body.email),
    })

    if (error) {
      return NextResponse.json(
        { error: error.message || "We could not add that teammate." },
        { status: 400 }
      )
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
    const { id, role, name, email } = body

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return NextResponse.json({ error: "Employee id is invalid." }, { status: 400 })
    }

    const updates: Record<string, string | null> = {}

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

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from("employees")
      .update(updates)
      .eq("id", id)

    if (error) {
      return NextResponse.json(
        { error: error.message || "Update failed." },
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
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id
      )
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
