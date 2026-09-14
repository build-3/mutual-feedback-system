/**
 * Pulse scoring — the judgement layer over collected feedback.
 *
 * Pure functions only: no I/O, no Supabase, no clock reads beyond what a caller
 * passes in. Everything that decides where a person lands lives here so it can
 * be unit-tested without a database, and so a disputed bucket can be replayed
 * from stored inputs months later.
 *
 * The model, in one line: normalise every signal to 0-100, take a weighted
 * average per reviewer, average across reviewers, then cut the result against
 * per-cohort thresholds.
 *
 * See docs/PULSE-SPEC.md for the rationale behind the weights and cut lines.
 */

import { contributionToNumber, parseNumericAnswer } from "./insights-helpers"

// ── Shape ───────────────────────────────────────────────────────────────

/**
 * Which set of cut lines applies. Deliberately not the same thing as
 * employees.role: the DB role is 'intern', but nothing user-facing says that
 * word, and an admin is scored on the full-timer lines like everyone else.
 */
export type Cohort = "full_timer" | "probation"

export type Bucket =
  | "doing_well"
  | "on_the_fence"
  | "needs_conversation"
  | "not_enough_signal"

/** Component keys, in report order. */
export const COMPONENT_KEYS = [
  "trust_battery",
  "teal",
  "contribution",
  "purpose",
  "backing",
] as const

export type ComponentKey = (typeof COMPONENT_KEYS)[number]

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  trust_battery: "trust battery",
  teal: "teal principles",
  contribution: "contribution level",
  purpose: "purpose alignment",
  backing: "backing for the next step",
}

export type PulseWeights = Record<ComponentKey, number>

export type CutLines = {
  /** Composite at or above this is "doing well". */
  doing_well: number
  /** Composite at or above this (but below doing_well) is "on the fence". */
  on_the_fence: number
}

export type PulseConfig = {
  weights: PulseWeights
  cut_lines: Record<Cohort, CutLines>
  /** Below this many reviews in the window, a person is held out as unmeasured. */
  min_reviews: number
  /** How many closed cycles the scoring window spans. */
  window_cycles: number
  /** Whether written feedback may be sent to the model for summarisation. */
  send_verbatim_to_llm: boolean
  /**
   * Addresses on the roster that are not people. Scoring a shared or service
   * account produces a meaningless bucket and, worse, a note addressed to an
   * inbox several people read.
   */
  exclude_emails: string[]
}

/**
 * Starting calibration, not a finding. Tuned against real data in a dry run
 * before anything is ever sent — see docs/PULSE-SPEC.md §11.
 *
 * trust_battery carries the most weight because it is the one signal the form
 * already treats as load-bearing: TRUST_DETAIL_REQUIRED_BELOW makes a written
 * explanation mandatory below 85, so a low trust score always arrives with
 * stated reasons attached.
 */
export const DEFAULT_PULSE_CONFIG: PulseConfig = {
  weights: {
    trust_battery: 0.35,
    teal: 0.25,
    contribution: 0.2,
    purpose: 0.1,
    backing: 0.1,
  },
  cut_lines: {
    // The contribution ladder runs finding their feet -> reliable support ->
    // independent contributor -> leader. Someone eight weeks into their
    // probation period sitting at "reliable support" is on track; a full-timer
    // at the same level is not. One shared line would put most of the probation
    // cohort in the bottom bucket by construction.
    full_timer: { doing_well: 70, on_the_fence: 55 },
    probation: { doing_well: 65, on_the_fence: 50 },
  },
  min_reviews: 2,
  window_cycles: 3,
  send_verbatim_to_llm: true,
  // The studio's own Chat sender account, which sits on the roster as an
  // employee row so it can appear in pickers.
  exclude_emails: ["foundation@build3.org"],
}

/** One reviewer's submission, reduced to its numeric parts. */
export type ReviewInput = {
  submissionId: string
  reviewerId: string
  createdAt: string
  /** 0-100 as collected. */
  trustBattery: number | null
  /** The three teal sub-scores, 1-5 each. Nulls are skipped, not zeroed. */
  teal: (number | null)[]
  /** 1-5 stars. */
  purpose: number | null
  /** 1-4, from the A/B/C/D ladder. */
  contribution: number | null
  /** 1-5 — probation_reviews.backing_score, else recommend_rating. */
  backing: number | null
}

export type ScoredComponent = {
  key: ComponentKey
  /** The value as collected, before normalisation — kept for the audit trail. */
  raw: number
  /** 0-100. */
  normalised: number
  /** The weight actually applied, after renormalising over present components. */
  weight: number
}

export type ScoredReview = {
  submissionId: string
  reviewerId: string
  createdAt: string
  composite: number
  components: ScoredComponent[]
}

export type PersonScore = {
  composite: number
  min: number
  max: number
  count: number
  /** Average normalised value per component, across the reviews that had it. */
  componentAverages: Partial<Record<ComponentKey, number>>
  reviews: ScoredReview[]
}

// ── Normalisers ─────────────────────────────────────────────────────────

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

/** A 1-5 rating onto 0-100. 1 maps to 0, 5 maps to 100. */
export function normalise1to5(value: number): number {
  return clamp(((value - 1) / 4) * 100, 0, 100)
}

/** The 1-4 contribution ladder onto 0-100. */
export function normaliseContribution(value: number): number {
  return clamp(((value - 1) / 3) * 100, 0, 100)
}

/** Trust battery is already 0-100; only guard against out-of-range stored data. */
export function normaliseTrust(value: number): number {
  return clamp(value, 0, 100)
}

/** Mean of the present teal sub-scores, or null if none were answered. */
function tealMean(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (present.length === 0) return null
  return present.reduce((sum, v) => sum + v, 0) / present.length
}

// ── Scoring ─────────────────────────────────────────────────────────────

/**
 * Score one reviewer's submission.
 *
 * Missing components renormalise, they never score zero. Treating a skipped
 * question as a 0 would punish an incomplete form rather than measure the
 * person — and full-timers have no backing component at all, so the zero
 * treatment would drag every full-timer down by a fixed 10 points.
 *
 * Returns null when nothing usable was answered, so callers can drop the
 * submission rather than average in a meaningless number.
 */
export function scoreReview(
  review: ReviewInput,
  weights: PulseWeights = DEFAULT_PULSE_CONFIG.weights
): ScoredReview | null {
  const teal = tealMean(review.teal)

  const present: { key: ComponentKey; raw: number; normalised: number }[] = []

  if (review.trustBattery !== null && Number.isFinite(review.trustBattery)) {
    present.push({
      key: "trust_battery",
      raw: review.trustBattery,
      normalised: normaliseTrust(review.trustBattery),
    })
  }
  if (teal !== null) {
    present.push({ key: "teal", raw: teal, normalised: normalise1to5(teal) })
  }
  if (review.contribution !== null && Number.isFinite(review.contribution)) {
    present.push({
      key: "contribution",
      raw: review.contribution,
      normalised: normaliseContribution(review.contribution),
    })
  }
  if (review.purpose !== null && Number.isFinite(review.purpose)) {
    present.push({
      key: "purpose",
      raw: review.purpose,
      normalised: normalise1to5(review.purpose),
    })
  }
  if (review.backing !== null && Number.isFinite(review.backing)) {
    present.push({
      key: "backing",
      raw: review.backing,
      normalised: normalise1to5(review.backing),
    })
  }

  if (present.length === 0) return null

  const weightSum = present.reduce((sum, c) => sum + weights[c.key], 0)
  // Every configured weight being zero would make this a division by zero and
  // every composite NaN — which would silently pass every threshold comparison
  // as false and empty the report while looking like a clean run.
  if (weightSum <= 0) return null

  const components: ScoredComponent[] = present.map((c) => ({
    key: c.key,
    raw: c.raw,
    normalised: c.normalised,
    weight: weights[c.key] / weightSum,
  }))

  const composite = components.reduce((sum, c) => sum + c.normalised * c.weight, 0)

  return {
    submissionId: review.submissionId,
    reviewerId: review.reviewerId,
    createdAt: review.createdAt,
    composite,
    components,
  }
}

/**
 * Collapse a person's reviews into one score, weighting each reviewer equally.
 *
 * min and max come back alongside the mean because the report prints the
 * individual review scores rather than the mean alone: three reviews of
 * 82, 79, 41 is disagreement between reviewers, and averaging it to 67 hides
 * exactly the thing worth looking at.
 */
export function aggregateReviews(scored: ScoredReview[]): PersonScore | null {
  if (scored.length === 0) return null

  const composites = scored.map((s) => s.composite)
  const sums = new Map<ComponentKey, { total: number; count: number }>()

  for (const review of scored) {
    for (const c of review.components) {
      const entry = sums.get(c.key) ?? { total: 0, count: 0 }
      entry.total += c.normalised
      entry.count += 1
      sums.set(c.key, entry)
    }
  }

  const componentAverages: Partial<Record<ComponentKey, number>> = {}
  for (const [key, { total, count }] of Array.from(sums.entries())) {
    componentAverages[key] = total / count
  }

  return {
    composite: composites.reduce((sum, c) => sum + c, 0) / composites.length,
    min: Math.min(...composites),
    max: Math.max(...composites),
    count: scored.length,
    componentAverages,
    reviews: scored,
  }
}

/**
 * Where a person lands.
 *
 * The review-count gate runs first and wins: someone with one review is not
 * doing well or badly, they are unmeasured, and saying so is more useful than
 * a bucket drawn from a single data point.
 */
export function bucketFor(
  composite: number | null,
  cohort: Cohort,
  reviewCount: number,
  config: PulseConfig = DEFAULT_PULSE_CONFIG
): Bucket {
  if (composite === null || reviewCount < config.min_reviews) {
    return "not_enough_signal"
  }
  const lines = config.cut_lines[cohort]
  if (composite >= lines.doing_well) return "doing_well"
  if (composite >= lines.on_the_fence) return "on_the_fence"
  return "needs_conversation"
}

/** The component a person is weakest on, for the note and the report. */
export function weakestComponents(
  score: PersonScore,
  limit = 2
): { key: ComponentKey; value: number }[] {
  return Object.entries(score.componentAverages)
    .map(([key, value]) => ({ key: key as ComponentKey, value: value as number }))
    .sort((a, b) => a.value - b.value)
    .slice(0, limit)
}

/** The component a person is strongest on — the doing-well note leads with it. */
export function strongestComponent(
  score: PersonScore
): { key: ComponentKey; value: number } | null {
  const sorted = Object.entries(score.componentAverages)
    .map(([key, value]) => ({ key: key as ComponentKey, value: value as number }))
    .sort((a, b) => b.value - a.value)
  return sorted[0] ?? null
}

// ── Building ReviewInputs from stored answers ───────────────────────────

const TEAL_KEYS = [
  "teal_self_management",
  "teal_wholeness",
  "teal_evolutionary_purpose",
] as const

type AnswerRow = { question_key: string; answer_value: string }

/**
 * Reduce one submission's answer rows to the numeric parts scoring needs.
 *
 * Scores are stored EAV-style as strings in feedback_answers.answer_value, so
 * every read goes through parseNumericAnswer; contribution_level is an A/B/C/D
 * key and goes through the existing contributionToNumber, which also tolerates
 * the label form ("independent contributor") that older rows carry.
 *
 * `backingScore` is passed in rather than read from answers because it lives in
 * a different table (probation_reviews) keyed by probation, not submission.
 */
export function buildReviewInput(
  submission: { id: string; submitted_by_id: string; created_at: string },
  answers: AnswerRow[],
  backingScore: number | null = null
): ReviewInput {
  const byKey = new Map(answers.map((a) => [a.question_key, a.answer_value]))
  const num = (key: string): number | null => {
    const raw = byKey.get(key)
    return raw === undefined ? null : parseNumericAnswer(raw)
  }

  const contributionRaw = byKey.get("contribution_level")

  // probation_reviews.backing_score is the more deliberate signal — a reviewer
  // sat down specifically to answer it — so it wins over recommend_rating when
  // both exist for the same person.
  const backing = backingScore ?? num("recommend_rating")

  return {
    submissionId: submission.id,
    reviewerId: submission.submitted_by_id,
    createdAt: submission.created_at,
    trustBattery: num("trust_battery"),
    teal: TEAL_KEYS.map((k) => num(k)),
    purpose: num("purpose_alignment"),
    contribution:
      contributionRaw === undefined ? null : contributionToNumber(contributionRaw),
    backing,
  }
}

/**
 * Keep one review per reviewer per cycle, most recent wins.
 *
 * submitFeedback() has no period check (see the docstring in period-gate.ts),
 * so a double POST can put the same reviewer in the window twice and quietly
 * double their weight in the average.
 */
export function dedupeByReviewerCycle(
  reviews: ReviewInput[],
  cycleKeyOf: (createdAtIso: string) => string
): ReviewInput[] {
  const latest = new Map<string, ReviewInput>()
  for (const review of reviews) {
    const key = `${review.reviewerId}::${cycleKeyOf(review.createdAt)}`
    const existing = latest.get(key)
    if (!existing || review.createdAt > existing.createdAt) {
      latest.set(key, review)
    }
  }
  return Array.from(latest.values())
}
