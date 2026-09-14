import "server-only"

import { COMPONENT_LABELS, type Bucket, type PulseConfig } from "@/lib/pulse-scoring"
import type { PulsePerson } from "./pulse"

/**
 * Drafting the note each person receives.
 *
 * The model decides nothing. Bucket, composite, weakest components, coverage
 * gap and repeated themes are all computed in pulse-scoring before this module
 * is reached; the model only turns that structured result into prose. Every
 * draft is shown to a human before it can be sent.
 *
 * Three things are enforced in code rather than asked for in the prompt,
 * because a prompt is a request and this is a guarantee:
 *   - no reviewer's name appears in a note
 *   - a theme reaches the subject only when two or more reviewers raised it
 *   - no sentence of written feedback is passed through verbatim
 * A draft that fails any of them is discarded and the template is used.
 */

const MODEL = process.env.PULSE_LLM_MODEL ?? "gpt-4o-mini"
const TIMEOUT_MS = 20_000

/** Minimum distinct reviewers before a theme may be named to its subject. */
export const THEME_REVIEWER_MINIMUM = 2

export type NoteSource = "llm" | "template"

export type DraftedNote = {
  text: string
  source: NoteSource
  /** Set when the model was tried and rejected, for the admin UI to surface. */
  fallbackReason?: string
}

/** The deterministic facts a note may be built from. Nothing else reaches the model. */
type NoteFacts = {
  firstName: string
  bucket: Bucket
  reviewCount: number
  coverageExpected: number
  reviewsShort: number
  strongest: { label: string; value: number } | null
  weakest: { label: string; value: number }[]
  strengthThemes: string[]
  improvementThemes: string[]
  selfReviewFiled: boolean
  feedbackUrl: string
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim()
}

export function buildNoteFacts(
  person: PulsePerson,
  config: PulseConfig,
  appUrl: string
): NoteFacts {
  const gate = (themes: { value: string; reviewers: number }[]) =>
    themes
      .filter((t) => t.reviewers >= THEME_REVIEWER_MINIMUM)
      .slice(0, 2)
      .map((t) => t.value)

  return {
    firstName: firstNameOf(person.name),
    bucket: person.bucket,
    reviewCount: person.reviewCount,
    coverageExpected: person.coverageExpected,
    reviewsShort: Math.max(0, config.min_reviews - person.reviewCount),
    strongest: person.strongest
      ? { label: COMPONENT_LABELS[person.strongest.key], value: Math.round(person.strongest.value) }
      : null,
    weakest: person.weakest.map((w) => ({
      label: COMPONENT_LABELS[w.key],
      value: Math.round(w.value),
    })),
    strengthThemes: gate(person.strengthThemes),
    improvementThemes: gate(person.improvementThemes),
    selfReviewFiled: person.selfReviewFiled,
    feedbackUrl: `${appUrl}/feedback`,
  }
}

// ── Templates ───────────────────────────────────────────────────────────

/**
 * The deterministic draft. Used as the fallback, and as the model's worked
 * example of the shape and tone expected — so a failed API call degrades to
 * something sendable rather than to nothing.
 */
export function templateNote(facts: NoteFacts): string {
  const lines: string[] = []

  switch (facts.bucket) {
    case "doing_well": {
      lines.push(`hi ${facts.firstName} — a good read this cycle.`)
      lines.push("")
      if (facts.strongest) {
        lines.push(
          `across ${facts.reviewCount} teammate${facts.reviewCount === 1 ? "" : "s"}, ` +
            `your strongest signal was ${facts.strongest.label}.`
        )
      }
      if (facts.strengthThemes.length > 0) {
        lines.push(
          `more than one person named the same strength: ${facts.strengthThemes.join(" and ")}.`
        )
      }
      lines.push("")
      lines.push("nothing to action here. thanks for how you show up.")
      break
    }

    case "on_the_fence": {
      lines.push(`hi ${facts.firstName} — here's where you stand this cycle.`)
      lines.push("")
      lines.push(
        "your feedback puts you in the middle band: not a concern, but there's " +
          "clear room to move before the next session."
      )
      if (facts.weakest.length > 0) {
        lines.push("")
        lines.push(`the areas with the most room: ${facts.weakest.map((w) => w.label).join(" and ")}.`)
      }
      if (facts.improvementThemes.length > 0) {
        lines.push(
          `more than one person pointed at the same value: ${facts.improvementThemes.join(" and ")}.`
        )
      }
      lines.push("")
      lines.push(
        facts.reviewsShort > 0
          ? `one concrete thing: ask ${facts.reviewsShort} more teammate${facts.reviewsShort === 1 ? "" : "s"} for feedback before the next session — ${facts.feedbackUrl}`
          : "pick one of those and make it visible before the next session."
      )
      break
    }

    case "needs_conversation": {
      lines.push(`hi ${facts.firstName} — a short heads-up.`)
      lines.push("")
      lines.push(
        "this cycle's feedback shows a gap worth talking through properly, " +
          "rather than over chat."
      )
      if (facts.weakest.length > 0) {
        lines.push("")
        lines.push(`it centres on ${facts.weakest.map((w) => w.label).join(" and ")}.`)
      }
      lines.push("")
      lines.push(
        "arjun or bhavesh will reach out to set up a conversation. nothing is " +
          "decided — the point is to hear your side and agree what changes."
      )
      break
    }

    case "not_enough_signal": {
      lines.push(`hi ${facts.firstName} — a quick ask, not a judgement.`)
      lines.push("")
      lines.push(
        facts.reviewCount === 0
          ? "no one has left you feedback in this window, so the system can't say anything about how you're doing."
          : `only ${facts.reviewCount} teammate has left you feedback in this window, which isn't enough to say anything useful.`
      )
      lines.push("")
      lines.push(
        `ask ${Math.max(facts.reviewsShort, 2)} teammates to fill it in before the next session — ${facts.feedbackUrl}`
      )
      break
    }
  }

  return lines.join("\n")
}

// ── Safety filters ──────────────────────────────────────────────────────

/** Longest run of words from `source` that also appears in `text`. */
function longestSharedRun(text: string, source: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
  const a = norm(text)
  const b = norm(source)
  if (a.length === 0 || b.length === 0) return 0

  let best = 0
  // Small inputs (a note and one feedback answer), so the quadratic scan is fine
  // and avoids a suffix-automaton for a few hundred words.
  const prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = 0
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]
      prev[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : 0
      if (prev[j] > best) best = prev[j]
      diagonal = temp
    }
  }
  return best
}

/** A run this long is a quotation, not a coincidence of common phrasing. */
const VERBATIM_RUN_LIMIT = 7

export type SanitiseContext = {
  /** Every name on the roster, so a reviewer cannot be named. */
  rosterNames: string[]
  /** The subject's own name is always allowed through. */
  subjectName: string
  /**
   * Names the note is meant to mention: the leadership who will reach out.
   * Without this the anonymity filter rejects its own needs-a-conversation
   * template, because "arjun or bhavesh will reach out" names two people who
   * are also on the roster — and every model draft for that bucket would fall
   * back to the template it just rejected.
   */
  allowedNames?: string[]
  /** Written feedback the note must not quote. */
  verbatim: string[]
  maxWords?: number
}

/**
 * Returns the reason a draft must be rejected, or null when it is safe.
 */
export function rejectionReason(text: string, ctx: SanitiseContext): string | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) return "empty draft"

  const words = trimmed.split(/\s+/).length
  if (words > (ctx.maxWords ?? 160)) return `too long (${words} words)`

  const lower = ` ${trimmed.toLowerCase()} `
  const allowed = new Set<string>()
  for (const name of [ctx.subjectName, ...(ctx.allowedNames ?? [])]) {
    for (const part of name.toLowerCase().split(/\s+/)) {
      if (part.length > 1) allowed.add(part)
    }
  }

  for (const name of ctx.rosterNames) {
    for (const part of name.split(/\s+/)) {
      const token = part.toLowerCase()
      // Single initials and very short tokens collide with ordinary words.
      if (token.length < 3) continue
      if (allowed.has(token)) continue
      if (new RegExp(`[^a-z]${token}[^a-z]`).test(lower)) {
        return `names another teammate ("${part}")`
      }
    }
  }

  for (const source of ctx.verbatim) {
    if (longestSharedRun(trimmed, source) >= VERBATIM_RUN_LIMIT) {
      return "quotes written feedback verbatim"
    }
  }

  return null
}

// ── The model call ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You write short internal notes for build3, a small studio.

Voice: lowercase, warm, plain, direct. No corporate language, no praise
sandwiches, no exclamation marks. Short sentences. Speak to the person, not
about them.

Hard rules:
- Never name or hint at who gave feedback. You are not told, and you must not guess.
- Never invent a number, a score, a date, or an example. Use only the facts given.
- Never quote anyone's written feedback.
- Never state or imply a ranking against colleagues.
- Keep it under 120 words.

You are given a bucket that has already been decided. Do not argue with it,
soften it into a different one, or hedge it away. Write the note for that bucket.`

const BUCKET_BRIEF: Record<Bucket, string> = {
  doing_well:
    "Recognition only. Name the strongest signal concretely, reflect back what colleagues valued, and make NO ask. This person is doing well and should finish the note feeling seen.",
  on_the_fence:
    "Tell them plainly that they are in the middle band and there is room to move before the next session. Name the weakest areas in plain language. End with exactly one concrete, doable next step.",
  needs_conversation:
    "A heads-up, not a verdict, and softer than you think. Say there is a gap worth talking through in person, name at most two areas, and say Arjun or Bhavesh will reach out. Do not itemise, do not argue the case, do not imply the outcome is decided.",
  not_enough_signal:
    "No judgement at all — there simply isn't enough feedback to say anything. Make that clear so they don't read it as bad news, then ask them to collect more before the next session.",
}

async function callModel(
  facts: NoteFacts,
  apiKey: string,
  /**
   * Reviewers' written feedback, sent only when send_verbatim_to_llm is on.
   * It is what lets the on-the-fence note say something specific rather than
   * naming a component label — and it is the reason that flag exists, since
   * turning it on means this text leaves our infrastructure.
   */
  verbatim: string[]
): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              `Bucket: ${facts.bucket}`,
              `Brief: ${BUCKET_BRIEF[facts.bucket]}`,
              "",
              "Facts (the only things you may reference):",
              JSON.stringify(facts, null, 2),
              ...(verbatim.length > 0
                ? [
                    "",
                    "Written feedback from colleagues, for your understanding only.",
                    "Summarise the shared idea in your own words. Do not quote it,",
                    "do not repeat its phrasing, and do not reference a point only",
                    "one person made.",
                    ...verbatim.map((v, i) => `${i + 1}. ${v}`),
                  ]
                : []),
              "",
              "For reference, the plain template version of this note:",
              templateNote(facts),
            ].join("\n"),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "pulse_note",
            strict: true,
            schema: {
              type: "object",
              properties: { body: { type: "string" } },
              required: ["body"],
              additionalProperties: false,
            },
          },
        },
      }),
    }).finally(() => clearTimeout(timeout))

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      console.error("[pulse-notes] OpenAI error:", response.status, body.slice(0, 400))
      return null
    }

    const result = await response.json()
    const content = result?.choices?.[0]?.message?.content
    if (typeof content !== "string") return null
    const parsed = JSON.parse(content) as { body?: unknown }
    return typeof parsed.body === "string" ? parsed.body.trim() : null
  } catch (err: unknown) {
    console.error("[pulse-notes] draft failed:", err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Draft one person's note.
 *
 * Never throws and never returns nothing: a failed or rejected model draft
 * falls back to the template, so one bad API call cannot stall a run or leave a
 * person without a reviewable draft.
 */
export async function draftNote(
  person: PulsePerson,
  config: PulseConfig,
  ctx: { appUrl: string; rosterNames: string[]; leadershipNames?: string[] }
): Promise<DraftedNote> {
  const facts = buildNoteFacts(person, config, ctx.appUrl)
  const fallback = templateNote(facts)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { text: fallback, source: "template", fallbackReason: "no API key" }

  const sanitiseCtx: SanitiseContext = {
    rosterNames: ctx.rosterNames,
    subjectName: person.name,
    // The no-quotation check runs against ALL of this person's written
    // feedback regardless of what was sent, so a draft can never pass merely
    // because the text it echoed was withheld on this particular call.
    verbatim: person.constructiveFeedback,
    allowedNames: ctx.leadershipNames ?? [],
  }

  // Only the two buckets whose notes must say something specific get the
  // written feedback. Recognition and "we need more data" notes gain nothing
  // from it, so it is not sent for them.
  const wantsDetail = person.bucket === "on_the_fence" || person.bucket === "needs_conversation"
  const verbatim =
    config.send_verbatim_to_llm && wantsDetail ? person.constructiveFeedback : []

  const draft = await callModel(facts, apiKey, verbatim)
  if (draft === null) {
    return { text: fallback, source: "template", fallbackReason: "model unavailable" }
  }

  const reason = rejectionReason(draft, sanitiseCtx)
  if (reason) {
    console.warn(`[pulse-notes] rejected draft for ${person.name}: ${reason}`)
    return { text: fallback, source: "template", fallbackReason: reason }
  }

  return { text: draft, source: "llm" }
}
