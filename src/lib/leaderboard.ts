/**
 * Feedback leaderboard — the ranking logic.
 *
 * Pure functions only: no I/O, no Supabase, no clock reads beyond what a caller
 * passes in, so the whole model is unit-testable and a disputed position can be
 * replayed from stored inputs.
 *
 * What it ranks, and why that and not the obvious thing: a person's score for a
 * cycle is the number of DISTINCT teammates they gave a substantive review to.
 * Raw submission count was the first instinct and is the wrong sort key here —
 * five people already produce 45% of all feedback, so a raw-count board hands
 * them the top five places permanently, and a leaderboard with a foregone
 * outcome motivates nobody after the second month. Distinct-people is bounded by
 * the roster, cannot be farmed by reviewing one person repeatedly, and resets
 * every cycle, so somebody who joined last month can win it.
 *
 * See docs/LEADERBOARD-SPEC.md.
 */

import { VALUES_WITH_TEXT_KEYS, extractValuesText } from "./insights-helpers"

/**
 * Which cut of the roster a person belongs to. Deliberately not the same thing
 * as employees.role: the DB says 'intern' but nothing user-facing does.
 */
export type LeaderboardCohort = "full_timer" | "probation"

/**
 * Keys whose answers carry prose. A review counts only if one of them does.
 *
 * Exported so the database read can filter on them: submissionCounts ignores
 * every other key, and fetching them was three quarters of the query.
 */
export const TEXT_KEYS = new Set([
  "constructive_feedback",
  "value_strength",
  "value_improvement",
  "trust_battery_detail",
  "adhoc_positive",
  "adhoc_improve",
])

/**
 * Answers that say "nothing to report". Mirrors the set in mod-queue.ts — kept
 * as one exported constant there rather than a second copy here.
 */
export { NON_SUBSTANTIVE, isSubstantiveAnswer } from "./substantive"

import { isSubstantiveAnswer } from "./substantive"

/** Shortest a written answer can be and still count as having said something. */
const MIN_TEXT_LENGTH = 2

export type AnswerLike = { question_key: string; answer_value: string }

/**
 * Whether a submission counts toward the board.
 *
 * Two independent rules, both required. The codebase already holds two
 * unrelated notions of "substantive" and each is insufficient alone:
 *
 *   1. not a ghost form — it has at least one answer row (period-gate's rule)
 *   2. not junk — at least one written answer that isn't "na" / "none" / "-"
 *
 * Rule 1 alone lets a form answered entirely with "na" score. Rule 2 alone lets
 * a slider-only submission through. This is the main anti-gaming measure, and
 * it is why the board cannot be padded with empty forms.
 */
export function submissionCounts(answers: AnswerLike[]): boolean {
  if (answers.length === 0) return false

  for (const answer of answers) {
    if (!TEXT_KEYS.has(answer.question_key)) continue

    // values_with_text stores "v2:<indices>|||<prose>" — the indices alone are
    // a selection, not something written, so compare on the prose part.
    const raw = VALUES_WITH_TEXT_KEYS.has(answer.question_key)
      ? extractValuesText(answer.answer_value)
      : answer.answer_value

    const trimmed = (raw ?? "").trim()
    if (trimmed.length >= MIN_TEXT_LENGTH && isSubstantiveAnswer(trimmed)) return true
  }

  return false
}

/** One counted review: person A reviewed person B at a time. */
export type ReviewEvent = {
  giverId: string
  subjectId: string
  createdAt: string
}

export type LeaderboardPerson = {
  id: string
  name: string
  cohort: LeaderboardCohort
}

export type LeaderboardRow = {
  employeeId: string
  name: string
  cohort: LeaderboardCohort
  /** The ranked number: distinct teammates given a counted review. */
  reviewed: number
  /** Counted submissions filed. Shown beside `reviewed`, never ranked on. */
  submissions: number
  /** Teammates they could have reviewed — the roster minus themselves. */
  reachable: number
  /** Distinct teammates who reviewed THEM. Displayed, never ranked. */
  received: number
  /** Consecutive cycles ending at this one with at least one review given. */
  streak: number
  /** Whether they filed their own self + studio reflections this cycle. */
  reflectionsFiled: boolean
  /** 1-based. Ties share a position; the next position skips accordingly. */
  rank: number
}

export type BuildInput = {
  people: LeaderboardPerson[]
  /** Already filtered to counted submissions inside the window. */
  reviews: ReviewEvent[]
  /** Ids who filed both their self and studio reflections this cycle. */
  reflectionsFiled: Set<string>
  /** Consecutive-cycle streak per person, from `computeStreaks`. */
  streaks: Map<string, number>
}

/**
 * Build the ranked board.
 *
 * Everyone on the roster appears, including people with nothing — a board that
 * hides the zeroes cannot show you the gap it exists to close.
 */
export function buildLeaderboard(input: BuildInput): LeaderboardRow[] {
  const { people, reviews, reflectionsFiled, streaks } = input
  const onRoster = new Set(people.map((p) => p.id))

  const givenTo = new Map<string, Set<string>>()
  const givenCount = new Map<string, number>()
  const receivedFrom = new Map<string, Set<string>>()

  for (const review of reviews) {
    // A review of, or by, somebody off the roster counts for nobody: it would
    // inflate one side of a comparison whose other side cannot move.
    if (!onRoster.has(review.giverId) || !onRoster.has(review.subjectId)) continue
    // Self-review is not an act of reviewing a colleague.
    if (review.giverId === review.subjectId) continue

    const subjects = givenTo.get(review.giverId) ?? new Set<string>()
    subjects.add(review.subjectId)
    givenTo.set(review.giverId, subjects)

    givenCount.set(review.giverId, (givenCount.get(review.giverId) ?? 0) + 1)

    const givers = receivedFrom.get(review.subjectId) ?? new Set<string>()
    givers.add(review.giverId)
    receivedFrom.set(review.subjectId, givers)
  }

  const rows = people.map((person) => ({
    employeeId: person.id,
    name: person.name,
    cohort: person.cohort,
    reviewed: givenTo.get(person.id)?.size ?? 0,
    submissions: givenCount.get(person.id) ?? 0,
    reachable: Math.max(0, people.length - 1),
    received: receivedFrom.get(person.id)?.size ?? 0,
    streak: streaks.get(person.id) ?? 0,
    reflectionsFiled: reflectionsFiled.has(person.id),
    rank: 0,
  }))

  // Sort by the ranked metric, then by the tiebreakers that reward consistency
  // over a single burst, then by name so the order is stable between runs.
  rows.sort(
    (a, b) =>
      b.reviewed - a.reviewed ||
      b.streak - a.streak ||
      b.submissions - a.submissions ||
      a.name.localeCompare(b.name)
  )

  // Standard competition ranking: equal scores share a position and the next
  // distinct score skips. Two people on 9 are both 1st, and the next is 3rd.
  let rank = 0
  let lastScore: number | null = null
  rows.forEach((row, index) => {
    if (lastScore === null || row.reviewed !== lastScore) {
      rank = index + 1
      lastScore = row.reviewed
    }
    row.rank = rank
  })

  return rows
}

/**
 * Consecutive cycles, ending with the most recent, in which a person gave at
 * least one counted review.
 *
 * `cycleKeysNewestFirst` must be contiguous and newest-first. A gap breaks the
 * streak; the current cycle being empty breaks it immediately, which is the
 * point — a streak you can keep while doing nothing is not a streak.
 */
export function computeStreaks(
  giversByCycle: Map<string, Set<string>>,
  cycleKeysNewestFirst: string[],
  personIds: string[]
): Map<string, number> {
  const out = new Map<string, number>()

  for (const personId of personIds) {
    let streak = 0
    for (const key of cycleKeysNewestFirst) {
      if (giversByCycle.get(key)?.has(personId)) streak += 1
      else break
    }
    out.set(personId, streak)
  }

  return out
}

/**
 * Teammates nobody has reviewed in the window.
 *
 * This is the board's most useful output and the reason "received" is shown but
 * never ranked. Nobody controls how many colleagues review them, so ranking on
 * it would publicly penalise people for other people's inaction — and the
 * bottom of that ranking is, by construction, exactly the people the pulse
 * report already flags as unmeasured. Inverted into a prompt, the same numbers
 * become the reason for everyone else to act.
 */
export function needsFeedback(rows: LeaderboardRow[], threshold = 1): LeaderboardRow[] {
  return rows
    .filter((row) => row.received < threshold)
    .sort((a, b) => a.received - b.received || a.name.localeCompare(b.name))
}
