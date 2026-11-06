import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import { fetchPagedByIds } from "./paged-query"

const MODEL = process.env.PULSE_LLM_MODEL ?? "gpt-4o-mini"
const TIMEOUT_MS = 25_000
/** Enough for a few months of probation; keeps the request small and cheap. */
const MAX_ANSWERS = 80
const MAX_ANSWER_CHARS = 500

const SYSTEM_PROMPT = [
  "You summarise the written feedback colleagues have given one person during their probation,",
  "for the person's sponsor and for leadership, who will use it in a probation conversation.",
  "Write 4 to 6 short bullet points covering: what they do well, what to improve, and any theme",
  "several people raised. Plain, kind, specific language.",
  "Rules you must follow: never name or hint at who said something; do not quote feedback",
  "verbatim; do not mention a point only one person made unless it is serious; do not invent",
  "anything that is not in the feedback; do not use em dashes; if there is too little feedback",
  "to say anything useful, say so in one sentence.",
].join(" ")

export type ProbationSummary = {
  summary: string
  basedOn: { reviews: number; answers: number }
}

/**
 * Summarise one probationer's feedback. Reviewer names never leave this
 * function: the model is sent the question and the answer, nothing else. Nothing
 * is stored; each call is a fresh read of the data.
 */
export async function summarizeProbationFeedback(
  probationId: string
): Promise<ProbationSummary | { error: string; httpStatus: number }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { error: "AI summaries are not configured on this server.", httpStatus: 503 }
  }

  const sb = getSupabaseAdmin()
  const { data: record } = await sb
    .from("probation_tracking")
    .select("employee_id, start_date, status, promoted_at")
    .eq("id", probationId)
    .single()
  if (!record) return { error: "Probation record not found.", httpStatus: 404 }

  type Sub = { id: string; created_at: string }
  const subs = await fetchPagedByIds<Sub>(
    (ids) =>
      sb
        .from("feedback_submissions")
        .select("id, created_at")
        .eq("feedback_type", "intern")
        .in("feedback_for_id", ids)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }),
    [record.employee_id as string]
  )
  const startMs = Date.parse(`${record.start_date}T00:00:00Z`)
  const endMs =
    record.status === "promoted" && record.promoted_at
      ? Date.parse(record.promoted_at as string)
      : Number.POSITIVE_INFINITY
  const inWindow = subs.filter((s) => {
    const ms = Date.parse(s.created_at)
    return ms >= startMs && ms <= endMs
  })
  if (inWindow.length === 0) {
    return { summary: "No feedback has been given during this probation yet.", basedOn: { reviews: 0, answers: 0 } }
  }

  type Ans = { question_text: string; answer_value: string }
  const answers = await fetchPagedByIds<Ans & { id: string }>(
    (ids) =>
      sb
        .from("feedback_answers")
        .select("id, submission_id, question_text, answer_value")
        .in("submission_id", ids)
        .order("id", { ascending: true }),
    inWindow.map((s) => s.id)
  )

  const usable = answers
    .map((a) => ({ q: a.question_text.trim(), a: a.answer_value.trim() }))
    .filter((x) => x.a.length > 0)
    .slice(0, MAX_ANSWERS)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Feedback from ${inWindow.length} review(s). Each line is a question and an answer.\n\n` +
              usable.map((x) => `Q: ${x.q}\nA: ${x.a.slice(0, MAX_ANSWER_CHARS)}`).join("\n\n"),
          },
        ],
      }),
    })
    if (!res.ok) {
      console.error("[probation-summary] model call failed:", res.status)
      return { error: "The summary service failed. Try again in a minute.", httpStatus: 502 }
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = json.choices?.[0]?.message?.content?.trim()
    if (!text) return { error: "The summary service returned nothing.", httpStatus: 502 }
    return { summary: text, basedOn: { reviews: inWindow.length, answers: usable.length } }
  } catch (err) {
    console.error("[probation-summary] model call error:", err instanceof Error ? err.message : err)
    return { error: "The summary service timed out. Try again.", httpStatus: 504 }
  } finally {
    clearTimeout(timeout)
  }
}
