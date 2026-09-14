import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { loadPulseConfig, loadPulseRecipients } from "@/lib/server/pulse"

type RunRow = {
  id: string
  cycle_key: string
  run_date: string
  window_start: string
  window_end: string
  config: unknown
  report_sent_at: string | null
  report_recipients: string[] | null
  status: string
}

type ScoreRow = {
  employee_id: string
  cohort: string
  bucket: string
  composite: number | null
  components: Record<string, number>
  review_count: number
  distinct_reviewers: number
  lowest_review: number | null
  review_scores: number[]
  coverage_expected: number
  coverage_received: number
  self_review_filed: boolean
  probation_end_date: string | null
  probation_overdue: boolean
  prev_composite: number | null
}

type NoteRow = {
  id: string
  employee_id: string
  bucket: string
  draft_text: string
  edited_text: string | null
  source: string
  status: string
  approved_at: string | null
  sent_at: string | null
  error: string | null
}

/**
 * The review page's data: one run, its scores, and its draft notes joined by
 * employee. ?run=<id> pins a historical run; without it the latest is returned.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const supabaseAdmin = getSupabaseAdmin()
  const runId = new URL(request.url).searchParams.get("run")

  const runQuery = supabaseAdmin
    .from("pulse_runs" as never)
    .select("id, cycle_key, run_date, window_start, window_end, config, report_sent_at, report_recipients, status")

  const { data: runData } = runId
    ? await runQuery.eq("id", runId).maybeSingle()
    : await runQuery.order("cycle_key", { ascending: false }).limit(1).maybeSingle()

  const run = runData as RunRow | null

  const [config, recipients] = await Promise.all([loadPulseConfig(), loadPulseRecipients()])

  if (!run) {
    return NextResponse.json({ run: null, people: [], config, recipients, runs: [] })
  }

  const [scoresResult, notesResult, employeesResult, runsResult] = await Promise.all([
    supabaseAdmin.from("pulse_scores" as never).select("*").eq("run_id", run.id),
    supabaseAdmin.from("pulse_notes" as never).select("*").eq("run_id", run.id),
    supabaseAdmin.from("employees").select("id, name, email, role"),
    supabaseAdmin
      .from("pulse_runs" as never)
      .select("id, cycle_key, report_sent_at")
      .order("cycle_key", { ascending: false })
      .limit(12),
  ])

  const scores = (scoresResult.data ?? []) as ScoreRow[]
  const notes = (notesResult.data ?? []) as NoteRow[]
  const employees = (employeesResult.data ?? []) as { id: string; name: string; email: string | null }[]

  const nameById = new Map(employees.map((e) => [e.id, e]))
  const noteByEmployee = new Map(notes.map((n) => [n.employee_id, n]))

  const people = scores
    .map((s) => {
      const employee = nameById.get(s.employee_id)
      const note = noteByEmployee.get(s.employee_id)
      return {
        employeeId: s.employee_id,
        name: employee?.name ?? "unknown",
        email: employee?.email ?? null,
        cohort: s.cohort,
        bucket: s.bucket,
        composite: s.composite === null ? null : Number(s.composite),
        prevComposite: s.prev_composite === null ? null : Number(s.prev_composite),
        components: s.components ?? {},
        reviewCount: s.review_count,
        distinctReviewers: s.distinct_reviewers ?? 0,
        lowestReview: s.lowest_review,
        reviewScores: s.review_scores ?? [],
        coverageExpected: s.coverage_expected,
        coverageReceived: s.coverage_received,
        selfReviewFiled: s.self_review_filed,
        probationEndDate: s.probation_end_date,
        probationOverdue: s.probation_overdue,
        note: note
          ? {
              id: note.id,
              text: note.edited_text ?? note.draft_text,
              source: note.source,
              status: note.status,
              sentAt: note.sent_at,
              error: note.error,
            }
          : null,
      }
    })
    // Lowest first: the people who need attention are at the top of the page,
    // the same order the report reads in.
    .sort((a, b) => (a.composite ?? -1) - (b.composite ?? -1))

  return NextResponse.json({
    run: {
      id: run.id,
      cycleKey: run.cycle_key,
      runDate: run.run_date,
      windowStart: run.window_start,
      windowEnd: run.window_end,
      reportSentAt: run.report_sent_at,
      reportRecipients: run.report_recipients ?? [],
      status: run.status,
    },
    people,
    config,
    recipients,
    runs: runsResult.data ?? [],
  })
}
