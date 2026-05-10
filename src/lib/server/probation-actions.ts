import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import { addMonthsSafe } from "./probation-rules"

export type ProbationAction = "extend" | "convert" | "conclude"

export type DecisionResult = {
  success: boolean
  status?: string
  newEndDate?: string
  error?: string
  httpStatus?: number
}

const MAX_NOTE_LENGTH = 2000

/**
 * Execute a probation decision (extend / convert / conclude).
 * Shared by the admin dashboard route and any future callers.
 *
 * Uses optimistic locking — the update WHERE clause includes the
 * current `probation_status` so concurrent mutations are rejected (409).
 */
export async function executeProbationDecision({
  probationId,
  action,
  note,
}: {
  probationId: string
  action: ProbationAction
  note?: string | null
}): Promise<DecisionResult> {
  const trimmedNote =
    typeof note === "string" ? note.trim().slice(0, MAX_NOTE_LENGTH) : null

  const supabaseAdmin = getSupabaseAdmin()

  const { data: record, error: fetchError } = await supabaseAdmin
    .from("probation_tracking")
    .select("id, employee_id, probation_status, probation_end_date")
    .eq("id", probationId)
    .single()

  if (fetchError || !record) {
    return { success: false, error: "Probation record not found.", httpStatus: 404 }
  }

  if (record.probation_status !== "active" && record.probation_status !== "extended") {
    return {
      success: false,
      error: "Can only act on active or extended probations.",
      httpStatus: 400,
    }
  }

  if (action === "extend" && record.probation_status === "extended") {
    return {
      success: false,
      error: "Already extended once. Maximum probation is 6 months. Choose convert or conclude.",
      httpStatus: 400,
    }
  }

  const now = new Date().toISOString()

  // ── Extend ──────────────────────────────────────────────────────────
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
      return { success: false, error: "Failed to extend probation.", httpStatus: 500 }
    }
    if (count === 0) {
      return {
        success: false,
        error: "Status changed by another action. Refresh and retry.",
        httpStatus: 409,
      }
    }

    return { success: true, status: "extended", newEndDate: newEnd.toISOString() }
  }

  // ── Convert ─────────────────────────────────────────────────────────
  if (action === "convert") {
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
      return { success: false, error: "Failed to complete probation.", httpStatus: 500 }
    }
    if (probCount === 0) {
      return {
        success: false,
        error: "Status changed by another action. Refresh and retry.",
        httpStatus: 409,
      }
    }

    const { error: empError } = await supabaseAdmin
      .from("employees")
      .update({ role: "full_timer" })
      .eq("id", record.employee_id)

    if (empError) {
      console.error("[probation-decision] role update failed:", empError)
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
        return {
          success: false,
          error: "Role update failed and revert failed. Manual intervention needed.",
          httpStatus: 500,
        }
      }

      return {
        success: false,
        error: "Role update failed — probation status reverted. Try again.",
        httpStatus: 500,
      }
    }

    return { success: true, status: "converted" }
  }

  // ── Conclude ────────────────────────────────────────────────────────
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
    return { success: false, error: "Failed to conclude probation.", httpStatus: 500 }
  }
  if (count === 0) {
    return {
      success: false,
      error: "Status changed by another action. Refresh and retry.",
      httpStatus: 409,
    }
  }

  return { success: true, status: "concluded" }
}
