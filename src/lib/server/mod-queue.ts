import "server-only"

import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { MOD_EMAILS } from "@/lib/server/require-admin"
import { cycleKeyOf } from "@/lib/cycles"

/**
 * Data for the /mod response console: every org-level (build3) feedback
 * submission, its answers, any replies, and whether it still needs one.
 *
 * Separate from buildInsightsPayload() on purpose — the console wants every
 * round by default and its own triage filters, not the insights page's
 * 3-month default.
 */

/** Free-text build3 keys a leadership reply can attach to. Mirrors the build3
 *  entries in RESPONDABLE_KEYS (src/components/insights/FeedbackTimeline.tsx). */
const RESPONDABLE_BUILD3_KEYS = new Set([
  "policies_unclear",
  "tools_resources",
  "trust_battery_detail",
])

/** Answers that say "nothing to report" don't need a reply and shouldn't
 *  count against the triage state. Same list the data audit used. */
const NON_SUBSTANTIVE = new Set([
  "", "na", "n/a", "-", ".", "none", "nothing", "no", "nope", "yes", "all good",
])

function isSubstantive(value: string | null): boolean {
  return !NON_SUBSTANTIVE.has((value ?? "").trim().toLowerCase())
}

export type TriageStatus = "unanswered" | "partial" | "done"

export type ModQueueItem = {
  submission: {
    id: string
    submitted_by_id: string
    feedback_for_id: string | null
    feedback_type: string
    created_at: string
    notified_at: string | null
  }
  submitterName: string
  answers: {
    id: string
    question_key: string
    question_text: string
    answer_value: string
  }[]
  /**
   * Round bucket: the CycleKey (YYYY-MM-DD of the cycle's opening 2nd Tuesday)
   * that created_at falls in. Was the YYYY-MM prefix of the raw timestamp, which
   * bucketed by UTC month — so an IST submission before 05:30 on the 1st landed
   * in the previous bucket, and a round spanning a month boundary was split.
   */
  period: string
  status: TriageStatus
  /** Substantive respondable answers, and how many already have a reply. */
  needsReply: number
  replied: number
}

type Row = { id: string; submitted_by_id: string; feedback_for_id: string | null; feedback_type: string; created_at: string }

/** Paged read — Supabase caps a single select at 1000 rows. */
async function fetchAll<T>(table: string, columns: string): Promise<{ data: T[]; error: unknown }> {
  const supabase = getSupabaseAdmin()
  const out: T[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1)
    if (error) return { data: [], error }
    const rows = (data ?? []) as unknown as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return { data: out, error: null }
}

export async function buildModQueue() {
  const supabase = getSupabaseAdmin()

  const [subsRes, empRes] = await Promise.all([
    supabase
      .from("feedback_submissions")
      .select("id, submitted_by_id, feedback_for_id, feedback_type, created_at")
      .eq("feedback_type", "build3")
      .order("created_at", { ascending: false }),
    supabase.from("employees").select("id, name, email"),
  ])

  if (subsRes.error || empRes.error) {
    return { error: subsRes.error ?? empRes.error }
  }

  const subs = (subsRes.data ?? []) as Row[]
  const employees = (empRes.data ?? []) as { id: string; name: string; email: string | null }[]
  const nameById = new Map(employees.map(e => [e.id, e.name]))
  const emailById = new Map(employees.map(e => [e.id, (e.email ?? "").toLowerCase()]))

  if (subs.length === 0) {
    return { data: { items: [] as ModQueueItem[], responsesByAnswer: {}, counts: { unanswered: 0, partial: 0, done: 0 }, periods: [] as string[] } }
  }

  const subIds = new Set(subs.map(s => s.id))

  const answersRes = await fetchAll<{ id: string; submission_id: string; question_key: string; question_text: string; answer_value: string }>(
    "feedback_answers",
    "id, submission_id, question_key, question_text, answer_value"
  )
  if (answersRes.error) return { error: answersRes.error }
  const answers = answersRes.data.filter(a => subIds.has(a.submission_id))

  const answerIds = new Set(answers.map(a => a.id))
  const respRes = await fetchAll<{ id: string; answer_id: string; responder_id: string; response_text: string; created_at: string }>(
    "feedback_responses",
    "id, answer_id, responder_id, response_text, created_at"
  )
  if (respRes.error) return { error: respRes.error }
  const responses = respRes.data.filter(r => answerIds.has(r.answer_id))

  // Every submission here is build3, so any leadership reply on it speaks as
  // the org. MOD_EMAILS lives in a server-only module, so this flag has to be
  // computed here rather than in the client component that renders it.
  const responsesByAnswer: Record<string, unknown[]> = {}
  for (const r of responses) {
    const email = emailById.get(r.responder_id) ?? ""
    const list = responsesByAnswer[r.answer_id] ?? []
    list.push({
      ...r,
      responderName: nameById.get(r.responder_id) || "Unknown",
      asFoundation: MOD_EMAILS.includes(email),
    })
    responsesByAnswer[r.answer_id] = list
  }

  const answeredIds = new Set(responses.map(r => r.answer_id))
  const answersBySub = new Map<string, typeof answers>()
  for (const a of answers) {
    const list = answersBySub.get(a.submission_id) ?? []
    list.push(a)
    answersBySub.set(a.submission_id, list)
  }

  const counts = { unanswered: 0, partial: 0, done: 0 }
  const periods = new Set<string>()

  const items: ModQueueItem[] = subs.map(s => {
    const subAnswers = answersBySub.get(s.id) ?? []
    const target = subAnswers.filter(
      a => RESPONDABLE_BUILD3_KEYS.has(a.question_key) && isSubstantive(a.answer_value)
    )
    const replied = target.filter(a => answeredIds.has(a.id)).length
    const status: TriageStatus =
      target.length === 0 ? "done" : replied === 0 ? "unanswered" : replied < target.length ? "partial" : "done"
    counts[status]++
    const period = cycleKeyOf(s.created_at)
    periods.add(period)

    return {
      submission: {
        id: s.id,
        submitted_by_id: s.submitted_by_id,
        feedback_for_id: s.feedback_for_id,
        feedback_type: s.feedback_type,
        created_at: s.created_at,
        notified_at: null,
      },
      submitterName: nameById.get(s.submitted_by_id) || "Unknown",
      answers: subAnswers,
      period,
      status,
      needsReply: target.length,
      replied,
    }
  })

  return {
    data: {
      items,
      responsesByAnswer,
      counts,
      periods: Array.from(periods).sort().reverse(),
    },
  }
}
