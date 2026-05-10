import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { CEO_EMAIL, addMonthsSafe } from "@/lib/server/probation-rules"

interface ChatEvent {
  type?: string
  user?: {
    displayName?: string
    email?: string
  }
  common?: {
    invokedFunction?: string
    parameters?: Record<string, string>
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  let event: ChatEvent
  try {
    event = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  const fn = event.common?.invokedFunction
  if (fn !== "probation_extend" && fn !== "probation_convert" && fn !== "probation_conclude") {
    return NextResponse.json({})
  }

  if (event.user?.email !== CEO_EMAIL) {
    return NextResponse.json({ text: "Only the CEO can take probation actions." })
  }

  const probationId = event.common?.parameters?.probation_id
  if (!probationId || !UUID_RE.test(probationId)) {
    return NextResponse.json({ text: "Invalid probation ID." })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: record, error: fetchError } = await supabaseAdmin
    .from("probation_tracking")
    .select("id, employee_id, probation_status, probation_end_date")
    .eq("id", probationId)
    .single()

  if (fetchError || !record) {
    return NextResponse.json({ text: "Probation record not found." })
  }

  if (record.probation_status !== "active" && record.probation_status !== "extended") {
    return NextResponse.json({ text: "This probation is already resolved." })
  }

  const { data: emp } = await supabaseAdmin
    .from("employees")
    .select("name")
    .eq("id", record.employee_id)
    .single()
  const name = emp?.name ?? "Unknown"

  if (fn === "probation_extend") {
    if (record.probation_status === "extended") {
      return NextResponse.json({ text: `${name} is already on extended probation (6 months max). Choose convert or conclude.` })
    }

    const newEnd = addMonthsSafe(new Date(record.probation_end_date), 3)

    const { error: extErr, count: extCount } = await supabaseAdmin
      .from("probation_tracking")
      .update(
        {
          probation_status: "extended",
          probation_end_date: newEnd.toISOString(),
          extended_at: now,
          updated_at: now,
        },
        { count: "exact" }
      )
      .eq("id", probationId)
      .eq("probation_status", record.probation_status)

    if (extErr || extCount === 0) {
      console.error("[probation-action] extend failed:", extErr)
      return NextResponse.json({ text: "Failed to extend — status may have changed. Check the dashboard." })
    }

    return NextResponse.json({
      text: `✅ Extended ${name}'s probation by 3 months (new end: ${newEnd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}).`,
    })
  }

  if (fn === "probation_convert") {
    const { error: probError, count: probCount } = await supabaseAdmin
      .from("probation_tracking")
      .update(
        {
          probation_status: "completed",
          completed_at: now,
          updated_at: now,
        },
        { count: "exact" }
      )
      .eq("id", probationId)
      .eq("probation_status", record.probation_status)

    if (probError || probCount === 0) {
      console.error("[probation-action] convert failed:", probError)
      return NextResponse.json({ text: "Failed — status may have changed. Check the dashboard." })
    }

    const { error: empError } = await supabaseAdmin
      .from("employees")
      .update({ role: "full_timer" })
      .eq("id", record.employee_id)

    if (empError) {
      console.error("[probation-action] role update failed:", empError)
      // Revert probation status
      const { error: revertErr } = await supabaseAdmin
        .from("probation_tracking")
        .update({
          probation_status: record.probation_status,
          completed_at: null,
          updated_at: now,
        })
        .eq("id", probationId)

      if (revertErr) {
        console.error("[probation-action] CRITICAL: revert also failed:", revertErr)
        return NextResponse.json({ text: "Role update failed and revert failed. Manual intervention needed." })
      }
      return NextResponse.json({ text: "Role update failed — probation reverted. Try again." })
    }

    return NextResponse.json({
      text: `🎉 ${name} is now a full-time team member!`,
    })
  }

  // probation_conclude
  const { error: conErr, count: conCount } = await supabaseAdmin
    .from("probation_tracking")
    .update(
      {
        probation_status: "concluded",
        concluded_at: now,
        updated_at: now,
      },
      { count: "exact" }
    )
    .eq("id", probationId)
    .eq("probation_status", record.probation_status)

  if (conErr || conCount === 0) {
    console.error("[probation-action] conclude failed:", conErr)
    return NextResponse.json({ text: "Failed — status may have changed. Check the dashboard." })
  }

  return NextResponse.json({
    text: `${name}'s probation has been concluded. Follow up with the transition process.`,
  })
}
