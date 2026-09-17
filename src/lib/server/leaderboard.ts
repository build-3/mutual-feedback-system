import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import { fetchPaged, fetchPagedByIds } from "./paged-query"
import {
  buildLeaderboard,
  computeStreaks,
  needsFeedback,
  submissionCounts,
  TEXT_KEYS,
  type LeaderboardCohort,
  type LeaderboardPerson,
  type LeaderboardRow,
  type ReviewEvent,
} from "@/lib/leaderboard"
import {
  cycleFor,
  cycleKeyOf,
  shiftCycle,
  type Cycle,
} from "@/lib/cycles"
import type { DateRange } from "@/lib/brand"
import { loadPulseConfig } from "./pulse"

/** How many cycles back the streak calculation looks. */
const STREAK_DEPTH = 12

export type LeaderboardPayload = {
  range: DateRange
  cycleKey: string
  windowLabel: string
  windowStartIso: string
  windowEndIso: string
  rows: LeaderboardRow[]
  needsFeedback: { employeeId: string; name: string }[]
  totals: {
    people: number
    reviewsCounted: number
    activeGivers: number
    noFeedbackYet: number
  }
}

type EmployeeRow = {
  id: string
  name: string
  email: string | null
  role: string
  is_active: boolean
}
type SubmissionRow = {
  id: string
  submitted_by_id: string
  feedback_for_id: string | null
  feedback_type: string
  created_at: string
}
type AnswerRow = { submission_id: string; question_key: string; answer_value: string }

/**
 * The window the board covers.
 *
 * Unlike the pulse report this is about the LIVE cycle, not the closed one —
 * the board is a race in progress, so "this cycle" has to mean the one people
 * are currently able to affect.
 */
function resolveBoardWindow(range: DateRange, anchor: Cycle): { startIso: string; endIso: string; label: string } {
  if (range === "all") {
    return { startIso: new Date(0).toISOString(), endIso: anchor.endIso, label: "all time" }
  }
  if (range === "3cycles") {
    const first = shiftCycle(anchor, -2)
    return { startIso: first.startIso, endIso: anchor.endIso, label: "last 3 cycles" }
  }
  return { startIso: anchor.startIso, endIso: anchor.endIso, label: anchor.label }
}

/**
 * Read everything the board needs and rank it.
 *
 * Every read is paged. An all-time view spans far more than the 1000 rows an
 * unpaginated PostgREST select silently returns — the fault that had the pulse
 * report scoring people on a third of their feedback and publishing it as fact.
 */
export async function buildLeaderboardPayload(
  range: DateRange = "cycle",
  at: number = Date.now()
): Promise<LeaderboardPayload> {
  const supabaseAdmin = getSupabaseAdmin()
  const anchor = cycleFor(at)
  const window = resolveBoardWindow(range, anchor)

  // Streaks always look back a fixed depth regardless of the view, so the
  // number beside a name means the same thing whichever range is selected.
  const streakStart = shiftCycle(anchor, -(STREAK_DEPTH - 1)).startIso
  const readStartIso = window.startIso < streakStart ? window.startIso : streakStart

  const [allEmployees, submissions, pulseConfig] = await Promise.all([
    fetchPaged<EmployeeRow>(() =>
      supabaseAdmin
        .from("employees")
        .select("id, name, email, role, is_active")
        .eq("is_active", true)
        .order("id", { ascending: true })
    ),
    fetchPaged<SubmissionRow>(() =>
      supabaseAdmin
        .from("feedback_submissions")
        .select("id, submitted_by_id, feedback_for_id, feedback_type, created_at")
        .in("feedback_type", ["intern", "full_timer", "self", "build3"])
        .gte("created_at", readStartIso)
        .lt("created_at", window.endIso)
        .order("id", { ascending: true })
    ),
    loadPulseConfig(),
  ])

  // Non-person accounts share one exclusion list with the pulse report rather
  // than keeping a second copy here. The studio's own Chat sender sits on the
  // roster as an employee row so it can appear in pickers; it has no business
  // on a participation board, in the needs-feedback prompt, or in a nudge.
  const excluded = new Set(
    pulseConfig.exclude_emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  )
  const employees = allEmployees.filter(
    (e) => !excluded.has((e.email ?? "").trim().toLowerCase())
  )

  const peer = submissions.filter(
    (s) => (s.feedback_type === "intern" || s.feedback_type === "full_timer") && s.feedback_for_id
  )

  const answers = await fetchPagedByIds<AnswerRow>(
    (ids) =>
      supabaseAdmin
        .from("feedback_answers")
        .select("submission_id, question_key, answer_value")
        .in("submission_id", ids)
        // submissionCounts only ever inspects these keys, and they are roughly
        // a quarter of the rows. Filtering here rather than in memory is what
        // keeps a 12-cycle streak lookback from dominating the request.
        .in("question_key", Array.from(TEXT_KEYS))
        .order("id", { ascending: true }),
    peer.map((s) => s.id)
  )

  const answersBySubmission = new Map<string, AnswerRow[]>()
  for (const answer of answers) {
    const group = answersBySubmission.get(answer.submission_id) ?? []
    group.push(answer)
    answersBySubmission.set(answer.submission_id, group)
  }

  // Only submissions that actually said something reach the board.
  const counted = peer.filter((s) => submissionCounts(answersBySubmission.get(s.id) ?? []))

  const people: LeaderboardPerson[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    cohort: (e.role === "intern" ? "probation" : "full_timer") as LeaderboardCohort,
  }))

  const inWindow = counted.filter(
    (s) => s.created_at >= window.startIso && s.created_at < window.endIso
  )
  const reviews: ReviewEvent[] = inWindow.map((s) => ({
    giverId: s.submitted_by_id,
    subjectId: s.feedback_for_id as string,
    createdAt: s.created_at,
  }))

  // Streaks read the full counted history, not just the selected window.
  const giversByCycle = new Map<string, Set<string>>()
  for (const s of counted) {
    const key = cycleKeyOf(s.created_at)
    const givers = giversByCycle.get(key) ?? new Set<string>()
    givers.add(s.submitted_by_id)
    giversByCycle.set(key, givers)
  }
  const cycleKeysNewestFirst: string[] = []
  for (let i = 0; i < STREAK_DEPTH; i++) {
    cycleKeysNewestFirst.push(shiftCycle(anchor, -i).key)
  }
  const streaks = computeStreaks(
    giversByCycle,
    cycleKeysNewestFirst,
    people.map((p) => p.id)
  )

  // Reflections are counted on the live cycle only — it is a "have you done
  // yours yet" tick, not a historical tally.
  const selfFiled = new Set<string>()
  const studioFiled = new Set<string>()
  for (const s of submissions) {
    if (s.created_at < anchor.startIso || s.created_at >= anchor.endIso) continue
    if (s.feedback_type === "self") selfFiled.add(s.submitted_by_id)
    if (s.feedback_type === "build3") studioFiled.add(s.submitted_by_id)
  }
  const reflectionsFiled = new Set(
    Array.from(selfFiled).filter((id) => studioFiled.has(id))
  )

  const rows = buildLeaderboard({ people, reviews, reflectionsFiled, streaks })
  const gap = needsFeedback(rows)

  return {
    range,
    cycleKey: anchor.key,
    windowLabel: window.label,
    windowStartIso: window.startIso,
    windowEndIso: window.endIso,
    rows,
    needsFeedback: gap.map((r) => ({ employeeId: r.employeeId, name: r.name })),
    totals: {
      people: rows.length,
      // Summed from the rows, not from `reviews`. The raw list still holds
      // reviews whose giver or subject has since left the roster, which
      // buildLeaderboard then discards — reporting the pre-filter number made
      // the headline stat larger than the board underneath it.
      reviewsCounted: rows.reduce((total, row) => total + row.submissions, 0),
      activeGivers: rows.filter((r) => r.reviewed > 0).length,
      noFeedbackYet: gap.length,
    },
  }
}
