import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import {
  DEFAULT_PULSE_CONFIG,
  aggregateReviews,
  bucketFor,
  buildReviewInput,
  dedupeByReviewerCycle,
  scoreReview,
  strongestComponent,
  weakestComponents,
  COMPONENT_LABELS,
  type Bucket,
  type Cohort,
  type ComponentKey,
  type PulseConfig,
  type ScoredReview,
} from "@/lib/pulse-scoring"
import {
  closedCycleAt,
  cycleKeyOf,
  istDateKey,
  istParts,
  shiftCycle,
} from "@/lib/cycles"
import { selectedValueTitles } from "@/lib/insights-helpers"
import { BUILD3_VALUES } from "@/lib/questions"

// ── Config ──────────────────────────────────────────────────────────────

const CONFIG_KEY = "pulse_config"
const RECIPIENTS_KEY = "pulse_recipients"

/**
 * Config merged over the defaults, so a partial row in site_settings (or a key
 * added in a later release) can never leave a field undefined and turn every
 * comparison against it into a silent false.
 */
export async function loadPulseConfig(): Promise<PulseConfig> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings" as never)
      .select("value")
      .eq("key", CONFIG_KEY)
      .single()
    const row = data as { value: string } | null
    if (!row?.value) return DEFAULT_PULSE_CONFIG
    const stored = JSON.parse(row.value) as Partial<PulseConfig>
    return {
      ...DEFAULT_PULSE_CONFIG,
      ...stored,
      weights: { ...DEFAULT_PULSE_CONFIG.weights, ...(stored.weights ?? {}) },
      cut_lines: {
        full_timer: {
          ...DEFAULT_PULSE_CONFIG.cut_lines.full_timer,
          ...(stored.cut_lines?.full_timer ?? {}),
        },
        probation: {
          ...DEFAULT_PULSE_CONFIG.cut_lines.probation,
          ...(stored.cut_lines?.probation ?? {}),
        },
      },
    }
  } catch {
    return DEFAULT_PULSE_CONFIG
  }
}

/**
 * Who the report goes to. Empty by default and on any read failure — a report
 * naming people's performance should fail closed, unlike the birthday-card
 * notification switch it sits beside.
 */
export async function loadPulseRecipients(): Promise<string[]> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings" as never)
      .select("value")
      .eq("key", RECIPIENTS_KEY)
      .single()
    const row = data as { value: string } | null
    if (!row?.value) return []
    const parsed = JSON.parse(row.value)
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string") : []
  } catch {
    return []
  }
}

// ── Shape ───────────────────────────────────────────────────────────────

export type PulsePerson = {
  employeeId: string
  name: string
  email: string | null
  cohort: Cohort
  bucket: Bucket
  composite: number | null
  reviewScores: number[]
  reviewCount: number
  componentAverages: Partial<Record<ComponentKey, number>>
  weakest: { key: ComponentKey; value: number }[]
  strongest: { key: ComponentKey; value: number } | null
  /** How many active reviewers could have reviewed them. */
  coverageExpected: number
  coverageReceived: number
  /** Whether they filed their own self + build3 reflections this cycle. */
  selfReviewFiled: boolean
  probationEndDate: string | null
  /** Probation end date already past while the record is still open. */
  probationOverdue: boolean
  /**
   * Values raised by reviewers, with the number of DISTINCT reviewers who
   * raised each. The note layer gates on this count; the report shows it.
   */
  improvementThemes: { value: string; reviewers: number }[]
  strengthThemes: { value: string; reviewers: number }[]
  /** Written feedback, for the note drafter only. Never sent to the subject. */
  constructiveFeedback: string[]
}

export type PulseRunResult = {
  cycleKey: string
  cycleLabel: string
  windowStartIso: string
  windowEndIso: string
  windowLabel: string
  config: PulseConfig
  people: PulsePerson[]
  totals: Record<Bucket, number>
  reviewsInWindow: number
  scoredCount: number
}

const EMPTY_TOTALS = (): Record<Bucket, number> => ({
  doing_well: 0,
  on_the_fence: 0,
  needs_conversation: 0,
  not_enough_signal: 0,
})

// ── The run ─────────────────────────────────────────────────────────────

/**
 * Score everyone and sort them into buckets.
 *
 * Pure read. Persistence and delivery are separate steps, so this can be called
 * from the dry-run path without any risk of writing or sending anything.
 */
export async function buildPulseRun(at: number = Date.now()): Promise<PulseRunResult> {
  const supabaseAdmin = getSupabaseAdmin()
  const config = await loadPulseConfig()

  // The cycle that just closed, plus the (window_cycles - 1) before it.
  const closed = closedCycleAt(at)
  const first = shiftCycle(closed, -(Math.max(1, config.window_cycles) - 1))
  const window = { startIso: first.startIso, endIso: closed.endIso }

  const [employeesResult, probationsResult, submissionsResult] = await Promise.all([
    supabaseAdmin
      .from("employees")
      .select("id, name, email, role, is_active")
      .eq("is_active", true),
    supabaseAdmin
      .from("probation_tracking")
      .select("id, employee_id, end_date, status")
      .in("status", ["active", "extended"]),
    supabaseAdmin
      .from("feedback_submissions")
      .select("id, submitted_by_id, feedback_for_id, feedback_type, created_at")
      .in("feedback_type", ["intern", "full_timer"])
      .not("feedback_for_id", "is", null)
      .gte("created_at", window.startIso)
      .lt("created_at", window.endIso),
  ])

  const employees = employeesResult.data ?? []
  const probations = probationsResult.data ?? []
  const submissions = submissionsResult.data ?? []

  const excluded = new Set(
    config.exclude_emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  )
  const scorable = employees.filter(
    (e) => !excluded.has((e.email ?? "").trim().toLowerCase())
  )

  const activeIds = new Set(scorable.map((e) => e.id))
  const probationByEmployee = new Map(probations.map((p) => [p.employee_id, p]))

  // Reviews whose subject has since left the roster are dropped here rather
  // than filtered later: a departed teammate is not scored, not notified, and
  // not counted in anyone's denominator.
  const relevant = submissions.filter(
    (s) => s.feedback_for_id && activeIds.has(s.feedback_for_id) && activeIds.has(s.submitted_by_id)
  )

  const submissionIds = relevant.map((s) => s.id)

  const [answersResult, probationReviewsResult, selfResult] = await Promise.all([
    submissionIds.length > 0
      ? supabaseAdmin
          .from("feedback_answers")
          .select("submission_id, question_key, answer_value")
          .in("submission_id", submissionIds)
      : Promise.resolve({ data: [] as { submission_id: string; question_key: string; answer_value: string }[] }),
    probations.length > 0
      ? supabaseAdmin
          .from("probation_reviews")
          .select("probation_id, reviewer_id, backing_score, created_at")
          .in("probation_id", probations.map((p) => p.id))
      : Promise.resolve({ data: [] as { probation_id: string; reviewer_id: string; backing_score: number; created_at: string }[] }),
    supabaseAdmin
      .from("feedback_submissions")
      .select("submitted_by_id, feedback_type")
      .in("feedback_type", ["self", "build3"])
      .gte("created_at", closed.startIso)
      .lt("created_at", closed.endIso),
  ])

  const answers = answersResult.data ?? []
  const probationReviews = probationReviewsResult.data ?? []
  const selfSubmissions = selfResult.data ?? []

  const answersBySubmission = new Map<string, { question_key: string; answer_value: string }[]>()
  for (const a of answers) {
    const group = answersBySubmission.get(a.submission_id) ?? []
    group.push({ question_key: a.question_key, answer_value: a.answer_value })
    answersBySubmission.set(a.submission_id, group)
  }

  // backing_score lives in probation_reviews, keyed by probation and reviewer
  // rather than by submission, so it is looked up per (subject, reviewer) pair.
  const backingByPair = new Map<string, number>()
  for (const r of probationReviews) {
    const probation = probations.find((p) => p.id === r.probation_id)
    if (!probation) continue
    const key = `${probation.employee_id}::${r.reviewer_id}`
    const existing = backingByPair.get(key)
    if (existing === undefined) backingByPair.set(key, r.backing_score)
  }

  const selfFiled = new Set(selfSubmissions.map((s) => s.submitted_by_id))

  // Anyone on the roster who could review: the same pool generateSessionAssignments
  // draws from, so coverage denominators match what the reminder cron asks for.
  const reviewerPool = scorable.filter((e) => e.role === "full_timer" || e.role === "admin")

  const byTarget = new Map<string, typeof relevant>()
  for (const s of relevant) {
    const group = byTarget.get(s.feedback_for_id!) ?? []
    group.push(s)
    byTarget.set(s.feedback_for_id!, group)
  }

  const today = istParts(at)
  const todayIst = istDateKey(today.year, today.month, today.day)

  const people: PulsePerson[] = []
  const totals = EMPTY_TOTALS()

  for (const employee of scorable) {
    const probation = probationByEmployee.get(employee.id)
    const cohort: Cohort = probation || employee.role === "intern" ? "probation" : "full_timer"

    const theirSubmissions = byTarget.get(employee.id) ?? []

    const inputs = theirSubmissions.map((s) =>
      buildReviewInput(
        { id: s.id, submitted_by_id: s.submitted_by_id, created_at: s.created_at },
        answersBySubmission.get(s.id) ?? [],
        backingByPair.get(`${employee.id}::${s.submitted_by_id}`) ?? null
      )
    )

    const deduped = dedupeByReviewerCycle(inputs, cycleKeyOf)
    const scored = deduped
      .map((input) => scoreReview(input, config.weights))
      .filter((s): s is ScoredReview => s !== null)

    const aggregate = aggregateReviews(scored)
    const composite = aggregate?.composite ?? null
    const reviewCount = aggregate?.count ?? 0
    const bucket = bucketFor(composite, cohort, reviewCount, config)
    totals[bucket] += 1

    const keptSubmissionIds = new Set(scored.map((s) => s.submissionId))
    const themeRows = theirSubmissions.filter((s) => keptSubmissionIds.has(s.id))

    people.push({
      employeeId: employee.id,
      name: employee.name,
      email: employee.email ?? null,
      cohort,
      bucket,
      composite,
      reviewScores: scored.map((s) => Math.round(s.composite)),
      reviewCount,
      componentAverages: aggregate?.componentAverages ?? {},
      weakest: aggregate ? weakestComponents(aggregate, 2) : [],
      strongest: aggregate ? strongestComponent(aggregate) : null,
      coverageExpected: reviewerPool.filter((r) => r.id !== employee.id).length,
      coverageReceived: reviewCount,
      selfReviewFiled: selfFiled.has(employee.id),
      probationEndDate: probation?.end_date ?? null,
      // A probation whose end date has passed while the record is still
      // active is a decision nobody made. The scoring can't make it, but the
      // report can stop it going unnoticed for another month.
      probationOverdue: Boolean(probation && probation.end_date < todayIst),
      improvementThemes: countThemes(themeRows, answersBySubmission, "value_improvement"),
      strengthThemes: countThemes(themeRows, answersBySubmission, "value_strength"),
      constructiveFeedback: collectText(themeRows, answersBySubmission, "constructive_feedback"),
    })
  }

  people.sort((a, b) => (a.composite ?? -1) - (b.composite ?? -1))

  return {
    cycleKey: closed.key,
    cycleLabel: closed.label,
    windowStartIso: window.startIso,
    windowEndIso: window.endIso,
    windowLabel:
      config.window_cycles === 1 ? "1 cycle" : `last ${config.window_cycles} cycles`,
    config,
    people,
    totals,
    reviewsInWindow: relevant.length,
    scoredCount: people.filter((p) => p.bucket !== "not_enough_signal").length,
  }
}

/**
 * Distinct-reviewer counts per value, not raw mentions.
 *
 * The note layer gates themes at two or more reviewers; counting mentions
 * instead would let one reviewer who picked the same value twice clear a gate
 * that exists specifically to stop a single reviewer being identifiable.
 */
function countThemes(
  submissions: { id: string; submitted_by_id: string }[],
  answersBySubmission: Map<string, { question_key: string; answer_value: string }[]>,
  key: string
): { value: string; reviewers: number }[] {
  const reviewersByValue = new Map<string, Set<string>>()
  for (const s of submissions) {
    for (const a of answersBySubmission.get(s.id) ?? []) {
      if (a.question_key !== key) continue
      for (const title of selectedValueTitles(a.answer_value, BUILD3_VALUES)) {
        const set = reviewersByValue.get(title) ?? new Set<string>()
        set.add(s.submitted_by_id)
        reviewersByValue.set(title, set)
      }
    }
  }
  return Array.from(reviewersByValue.entries())
    .map(([value, reviewers]) => ({ value, reviewers: reviewers.size }))
    .sort((a, b) => b.reviewers - a.reviewers)
}

/** Non-empty answers for a key. Order is not tied to reviewer identity. */
function collectText(
  submissions: { id: string }[],
  answersBySubmission: Map<string, { question_key: string; answer_value: string }[]>,
  key: string
): string[] {
  const out: string[] = []
  for (const s of submissions) {
    for (const a of answersBySubmission.get(s.id) ?? []) {
      if (a.question_key === key && a.answer_value.trim().length > 0) {
        out.push(a.answer_value.trim())
      }
    }
  }
  return out
}

// ── The report ──────────────────────────────────────────────────────────

const BUCKET_HEADINGS: Record<Bucket, string> = {
  needs_conversation: "🔴 needs a conversation",
  on_the_fence: "🟠 on the fence",
  doing_well: "🟢 doing well",
  not_enough_signal: "⚪ not enough signal",
}

/** Most urgent first — the report is read top-down and acted on from the top. */
const BUCKET_ORDER: Bucket[] = [
  "needs_conversation",
  "on_the_fence",
  "doing_well",
  "not_enough_signal",
]

const COHORT_LABELS: Record<Cohort, string> = {
  full_timer: "full-timers",
  probation: "teammates in their probation period",
}

/** Trailing probation marker, kept on the person's own line to stay scannable. */
function probationTag(person: PulsePerson): string {
  if (!person.probationEndDate) return ""
  return person.probationOverdue
    ? `  ⏰ probation ended ${person.probationEndDate} — still open`
    : `  [probation ends ${person.probationEndDate}]`
}

function movement(person: PulsePerson, previous: Map<string, number>): string {
  if (person.composite === null) return ""
  const prior = previous.get(person.employeeId)
  if (prior === undefined) return " (first read)"
  const delta = Math.round(person.composite - prior)
  if (delta === 0) return ` (was ${Math.round(prior)}, →)`
  return ` (was ${Math.round(prior)}, ${delta > 0 ? "↑" : "↓"}${Math.abs(delta)})`
}

/**
 * The leadership DM.
 *
 * Google Chat plain text: *bold* and _italic_ work, but a <url|label> link
 * renders literally in a DM, so URLs go in bare. Same convention as
 * feedback-announce-once and session-reminder.
 */
export function buildReportText(
  run: PulseRunResult,
  options: { appUrl: string; runId?: string; previousScores?: Map<string, number>; pendingNotes?: number }
): string {
  const previous = options.previousScores ?? new Map<string, number>()
  const lines: string[] = []

  lines.push(`📊 *build3 pulse — cycle ${run.cycleLabel}*`)
  lines.push(
    `${run.people.length} teammates scored · window: ${run.windowLabel} · ${run.reviewsInWindow} reviews`
  )

  // Surfaced above the buckets because it is the one item here that is overdue
  // rather than merely current, and it is invisible everywhere else.
  const overdue = run.people.filter((p) => p.probationOverdue)
  if (overdue.length > 0) {
    lines.push("")
    lines.push(`*⏰ probation ended, still open — ${overdue.length}*`)
    lines.push(
      overdue.map((p) => `${p.name} (${p.probationEndDate})`).join(", ")
    )
    lines.push("_promote, extend, or close these._")
  }

  for (const cohort of ["full_timer", "probation"] as Cohort[]) {
    const inCohort = run.people.filter((p) => p.cohort === cohort)
    if (inCohort.length === 0) continue

    // Only head the sections when both exist — a single-cohort report reads
    // better without a heading that has nothing to distinguish itself from.
    const bothPresent = run.people.some((p) => p.cohort !== cohort)
    if (bothPresent) {
      lines.push("")
      lines.push(`━━ ${COHORT_LABELS[cohort]} ━━`)
    }

    for (const bucket of BUCKET_ORDER) {
      const group = inCohort.filter((p) => p.bucket === bucket)
      if (group.length === 0) continue

      lines.push("")
      lines.push(`*${BUCKET_HEADINGS[bucket]} — ${group.length}*`)

      if (bucket === "doing_well") {
        // Names only. Nothing here needs acting on, and detail would bury the
        // two buckets above it that do.
        lines.push(group.map((p) => p.name).join(", "))
        continue
      }

      for (const person of group) {
        if (bucket === "not_enough_signal") {
          const short = Math.max(0, run.config.min_reviews - person.reviewCount)
          lines.push(
            `• ${person.name} — ${person.reviewCount} review${person.reviewCount === 1 ? "" : "s"}` +
              (short > 0 ? ` (needs ${short} more)` : "") +
              probationTag(person)
          )
        } else {
          lines.push(
            `• ${person.name} — ${Math.round(person.composite ?? 0)}${movement(person, previous)} · ` +
              `${person.reviewCount} reviews: ${person.reviewScores.join(", ")}`
          )
          const weak = person.weakest
            .map((w) => `${COMPONENT_LABELS[w.key]} ${Math.round(w.value)}`)
            .join(" · ")
          if (weak) lines.push(`  weakest: ${weak}`)
          const theme = person.improvementThemes.find((t) => t.reviewers >= 2)
          if (theme) {
            lines.push(
              `  ${theme.reviewers} reviewers flagged the same value: ${theme.value}`
            )
          }
          const tag = probationTag(person)
          if (tag) lines.push(` ${tag}`)
        }
      }
    }
  }

  if (options.runId) {
    lines.push("")
    const count = options.pendingNotes ?? 0
    lines.push(
      count === 1
        ? "1 note is drafted and waiting for you."
        : `${count} notes are drafted and waiting for you.`
    )
    lines.push("Read, edit, and send them here:")
    lines.push(`${options.appUrl}/admin?tab=pulse&run=${options.runId}`)
  } else {
    lines.push("")
    lines.push("_preview — nothing was saved and no notes were drafted._")
  }

  return lines.join("\n")
}

// ── Persistence ─────────────────────────────────────────────────────────

export type PersistedRun = {
  runId: string
  /** False when a run for this cycle already existed and was reused. */
  created: boolean
  previousScores: Map<string, number>
}

/**
 * Composite scores from the most recent run before `cycleKey`, keyed by
 * employee. Drives the movement arrows, and is stored on the new run so the
 * delta survives a later config change.
 */
export async function loadPreviousScores(cycleKey: string): Promise<Map<string, number>> {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: prior } = await supabaseAdmin
    .from("pulse_runs" as never)
    .select("id")
    .lt("cycle_key", cycleKey)
    .order("cycle_key", { ascending: false })
    .limit(1)

  const priorRunId = ((prior ?? []) as { id: string }[])[0]?.id
  if (!priorRunId) return new Map()

  const { data: scores } = await supabaseAdmin
    .from("pulse_scores" as never)
    .select("employee_id, composite")
    .eq("run_id", priorRunId)

  const out = new Map<string, number>()
  for (const row of (scores ?? []) as { employee_id: string; composite: number | null }[]) {
    if (row.composite !== null) out.set(row.employee_id, Number(row.composite))
  }
  return out
}

/**
 * Write the run and its scores.
 *
 * Idempotent on cycle_key: a second call for the same cycle returns the
 * existing run untouched rather than producing a second report and a second
 * set of draft notes. The unique index is what actually enforces this — the
 * lookup below is the fast path, not the guarantee.
 */
export async function persistRun(
  run: PulseRunResult,
  previousScores: Map<string, number>
): Promise<PersistedRun> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: existing } = await supabaseAdmin
    .from("pulse_runs" as never)
    .select("id")
    .eq("cycle_key", run.cycleKey)
    .maybeSingle()

  const existingRun = existing as { id: string } | null
  if (existingRun?.id) {
    return { runId: existingRun.id, created: false, previousScores }
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("pulse_runs" as never)
    .insert({
      cycle_key: run.cycleKey,
      window_start: run.windowStartIso,
      window_end: run.windowEndIso,
      config: run.config,
      status: "built",
    } as never)
    .select("id")
    .single()

  const newRun = inserted as { id: string } | null
  if (error || !newRun) {
    // A concurrent run won the unique index. Fall back to reading theirs
    // rather than failing — two schedulers firing at once must not produce
    // two reports.
    const { data: raced } = await supabaseAdmin
      .from("pulse_runs" as never)
      .select("id")
      .eq("cycle_key", run.cycleKey)
      .maybeSingle()
    const racedRun = raced as { id: string } | null
    if (racedRun?.id) return { runId: racedRun.id, created: false, previousScores }
    throw new Error(`Failed to create pulse run: ${error?.message ?? "unknown"}`)
  }

  const rows = run.people.map((person) => ({
    run_id: newRun.id,
    employee_id: person.employeeId,
    cohort: person.cohort,
    bucket: person.bucket,
    composite: person.composite,
    components: person.componentAverages,
    review_count: person.reviewCount,
    review_scores: person.reviewScores,
    coverage_expected: person.coverageExpected,
    coverage_received: person.coverageReceived,
    self_review_filed: person.selfReviewFiled,
    probation_end_date: person.probationEndDate,
    probation_overdue: person.probationOverdue,
    prev_composite: previousScores.get(person.employeeId) ?? null,
  }))

  if (rows.length > 0) {
    const { error: scoreError } = await supabaseAdmin.from("pulse_scores" as never).insert(rows as never)
    if (scoreError) {
      throw new Error(`Failed to write pulse scores: ${scoreError.message}`)
    }
  }

  return { runId: newRun.id, created: true, previousScores }
}

/**
 * Write one draft note per person, all in `draft` status.
 *
 * Skips anyone already holding a note for this run, so a retry after a partial
 * failure tops up rather than duplicating. Nothing here sends anything.
 */
export async function persistNotes(
  runId: string,
  notes: { employeeId: string; bucket: Bucket; text: string; source: "llm" | "template" }[]
): Promise<number> {
  if (notes.length === 0) return 0
  const supabaseAdmin = getSupabaseAdmin()

  const { data: existing } = await supabaseAdmin
    .from("pulse_notes" as never)
    .select("employee_id")
    .eq("run_id", runId)

  const have = new Set(
    ((existing ?? []) as { employee_id: string }[]).map((n) => n.employee_id)
  )
  const rows = notes
    .filter((n) => !have.has(n.employeeId))
    .map((n) => ({
      run_id: runId,
      employee_id: n.employeeId,
      bucket: n.bucket,
      draft_text: n.text,
      source: n.source,
      status: "draft" as const,
    }))

  if (rows.length === 0) return 0
  const { error } = await supabaseAdmin.from("pulse_notes" as never).insert(rows as never)
  if (error) throw new Error(`Failed to write pulse notes: ${error.message}`)
  return rows.length
}

/** Record that the report went out, and to whom. */
export async function markReported(runId: string, recipients: string[]): Promise<void> {
  await getSupabaseAdmin()
    .from("pulse_runs" as never)
    .update({
      report_sent_at: new Date().toISOString(),
      report_recipients: recipients,
      status: "reported",
    } as never)
    .eq("id", runId)
}
