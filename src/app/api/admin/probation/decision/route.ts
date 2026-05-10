import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"
import { addMonthsSafe } from "@/lib/server/probation-rules"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_ACTIONS = new Set(["extend", "convert", "conclude"])
const MAX_NOTE_LENGTH = 2000

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await request.json()
  const { probationId, action, note } = body

  if (!UUID_RE.test(probationId)) {
    return NextResponse.json({ error: "Invalid probation id." }, { status: 400 })
  }

  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "Action must be extend, convert, or conclude." },
      { status: 400 }
    )
  }

  const trimmedNote = typeof note === "string" ? note.trim().slice(0, MAX_NOTE_LENGTH) : null

  const supabaseAdmin = getSupabaseAdmin()

  const { data: record, error: fetchError } = await supabaseAdmin
    .from("probation_tracking")
    .select("id, employee_id, probation_status, probation_end_date")
    .eq("id", probationId)
    .single()

  if (fetchError || !record) {
    return NextResponse.json({ error: "Probation record not found." }, { status: 404 })
  }

  if (record.probation_status !== "active" && record.probation_status !== "extended") {
    return NextResponse.json(
      { error: "Can only act on active or extended probations." },
      { status: 400 }
    )
  }

  // Guard: don't allow extending beyond 6 months total (already extended once)
  if (action === "extend" && record.probation_status === "extended") {
    return NextResponse.json(
      { error: "Already extended once. Maximum probation is 6 months. Choose convert or conclude." },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  if (action === "extend") {
    const newEnd = addMonthsSafe(new Date(record.probation_end_date), 3)

    const { error, count } = await supabaseAdmin
      .from("probation_tracking")
      .update(
        {
          probation_status: "extended",
          probation_end_date: newEnd.toISOString(),
          extended_at: now,
          decision_note: trimmedNote,
          updated_at: now,
        },
        { count: "exact" }
      )
      .eq("id", probationId)
      .eq("probation_status", record.probation_status)

    if (error) {
      console.error("[probation-decision] extend failed:", error)
      return NextResponse.json({ error: "Failed to extend probation." }, { status: 500 })
    }
    if (count === 0) {
      return NextResponse.json({ error: "Status changed by another action. Refresh and retry." }, { status: 409 })
    }

    return NextResponse.json({ status: "extended", new_end_date: newEnd.toISOString() })
  }

  if (action === "convert") {
    // Update both tables — if role update fails, revert probation status
    const { error: probError, count: probCount } = await supabaseAdmin
      .from("probation_tracking")
      .update(
        {
          probation_status: "completed",
          completed_at: now,
          decision_note: trimmedNote,
          updated_at: now,
        },
        { count: "exact" }
      )
      .eq("id", probationId)
      .eq("probation_status", record.probation_status)

    if (probError) {
      console.error("[probation-decision] convert failed:", probError)
      return NextResponse.json({ error: "Failed to complete probation." }, { status: 500 })
    }
    if (probCount === 0) {
      return NextResponse.json({ error: "Status changed by another action. Refresh and retry." }, { status: 409 })
    }

    const { error: empError } = await supabaseAdmin
      .from("employees")
      .update({ role: "full_timer" })
      .eq("id", record.employee_id)

    if (empError) {
      console.error("[probation-decision] role update failed:", empError)
      // Revert probation status since role update failed
      const { error: revertError } = await supabaseAdmin
        .from("probation_tracking")
        .update({
          probation_status: record.probation_status,
          completed_at: null,
          decision_note: null,
          updated_at: now,
        })
        .eq("id", probationId)

      if (revertError) {
        console.error("[probation-decision] CRITICAL: revert also failed:", revertError)
        return NextResponse.json(
          { error: "Role update failed and revert failed. Manual intervention needed." },
          { status: 500 }
        )
      }

      return NextResponse.json(
        { error: "Role update failed — probation status reverted. Try again." },
        { status: 500 }
      )
    }

    return NextResponse.json({ status: "converted" })
  }

  // conclude
  const { error, count } = await supabaseAdmin
    .from("probation_tracking")
    .update(
      {
        probation_status: "concluded",
        concluded_at: now,
        decision_note: trimmedNote,
        updated_at: now,
      },
      { count: "exact" }
    )
    .eq("id", probationId)
    .eq("probation_status", record.probation_status)

  if (error) {
    console.error("[probation-decision] conclude failed:", error)
    return NextResponse.json({ error: "Failed to conclude probation." }, { status: 500 })
  }
  if (count === 0) {
    return NextResponse.json({ error: "Status changed by another action. Refresh and retry." }, { status: 409 })
  }

  return NextResponse.json({ status: "concluded" })
}
