import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import { cycleFor, type Cycle } from "@/lib/cycles"
import type { FeedbackType } from "@/lib/types"

/**
 * "Has this person already submitted in the current period?" — asked by the
 * self/build3 gates, the reviewer's self-reflection lookup, and the reminder cron.
 *
 * All four used to compute the window inline with `new Date(y, m, 1)`, i.e. the
 * host's calendar month. That was wrong twice over: the period is a cycle
 * (2nd Tuesday → 2nd Tuesday), and host-local month boundaries differ between
 * dev machines (IST) and the Coolify host (UTC). Worse, the reminder cron decided
 * *whether to fire* on cycle logic while deciding *whom to skip* on month logic,
 * so the two halves of one request disagreed.
 *
 * These gates are advisory — they drive UI stages, not database constraints.
 * submitFeedback has no period check, so a direct POST or two open tabs can still
 * double-submit within a cycle. Closing that needs a cycle_key column and a
 * partial unique index; tracked separately.
 */

/** Submissions with zero answers are abandoned forms, not real submissions. */
async function hasAnswers(submissionId: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin()
  const { count } = await supabaseAdmin
    .from("feedback_answers")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submissionId)
  return !!count && count > 0
}

/**
 * The most recent non-ghost submission of this type by this person in the cycle,
 * or null.
 */
export async function latestSubstantiveSubmission({
  employeeId,
  feedbackType,
  cycle = cycleFor(),
  limit = 10,
}: {
  employeeId: string
  feedbackType: FeedbackType
  cycle?: Cycle
  limit?: number
}): Promise<{ id: string; created_at: string } | null> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: submissions } = await supabaseAdmin
    .from("feedback_submissions")
    .select("id, created_at")
    .eq("submitted_by_id", employeeId)
    .eq("feedback_type", feedbackType)
    .gte("created_at", cycle.startIso)
    .lt("created_at", cycle.endIso)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (!submissions || submissions.length === 0) return null

  for (const submission of submissions) {
    if (await hasAnswers(submission.id)) return submission
  }
  return null
}

/** Whether this person has a real submission of this type in the cycle. */
export async function hasSubstantiveSubmission(args: {
  employeeId: string
  feedbackType: FeedbackType
  cycle?: Cycle
}): Promise<boolean> {
  return (await latestSubstantiveSubmission(args)) !== null
}

/**
 * Which feedback types each person has submitted during the cycle, for the
 * reminder cron's suppression set. One query for the whole org rather than one
 * per person.
 */
export async function submittersInCycle(
  feedbackTypes: FeedbackType[],
  cycle: Cycle = cycleFor()
): Promise<Map<string, Set<string>>> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data } = await supabaseAdmin
    .from("feedback_submissions")
    .select("submitted_by_id, feedback_type")
    .in("feedback_type", feedbackTypes)
    .gte("created_at", cycle.startIso)
    .lt("created_at", cycle.endIso)

  const out = new Map<string, Set<string>>()
  for (const row of data ?? []) {
    const set = out.get(row.submitted_by_id) ?? new Set<string>()
    set.add(row.feedback_type)
    out.set(row.submitted_by_id, set)
  }
  return out
}
