import { NextResponse } from "next/server"
import { getBasicAuthChallengeHeaders, isAuthorizedRequest } from "@/lib/server/basic-auth"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"

function unauthorizedResponse() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: getBasicAuthChallengeHeaders(),
  })
}

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

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request.headers.get("authorization"))) {
    return unauthorizedResponse()
  }

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    )
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from("employees")
    .select("*")
    .order("role")
    .order("name")

  if (error) {
    return NextResponse.json(
      { error: "We could not load the roster right now." },
      { status: 500 }
    )
  }

  return NextResponse.json({ employees: data || [] })
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request.headers.get("authorization"))) {
    return unauthorizedResponse()
  }

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    )
  }

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

export async function DELETE(request: Request) {
  if (!isAuthorizedRequest(request.headers.get("authorization"))) {
    return unauthorizedResponse()
  }

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    )
  }

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
