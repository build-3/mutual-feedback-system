import { describe, expect, it } from "vitest"

import {
  buildLeaderboard,
  computeStreaks,
  needsFeedback,
  submissionCounts,
  type LeaderboardPerson,
  type ReviewEvent,
} from "./leaderboard"

const people: LeaderboardPerson[] = [
  { id: "a", name: "Ada", cohort: "full_timer" },
  { id: "b", name: "Bo", cohort: "full_timer" },
  { id: "c", name: "Cy", cohort: "probation" },
  { id: "d", name: "Di", cohort: "probation" },
]

function review(giverId: string, subjectId: string, createdAt = "2026-09-01T00:00:00.000Z"): ReviewEvent {
  return { giverId, subjectId, createdAt }
}

function build(reviews: ReviewEvent[], over: Partial<Parameters<typeof buildLeaderboard>[0]> = {}) {
  return buildLeaderboard({
    people,
    reviews,
    reflectionsFiled: new Set<string>(),
    streaks: new Map<string, number>(),
    ...over,
  })
}

const rowFor = (rows: ReturnType<typeof build>, id: string) => rows.find((r) => r.employeeId === id)!

describe("submissionCounts — the anti-gaming rule", () => {
  it("counts a review carrying written feedback", () => {
    expect(
      submissionCounts([
        { question_key: "trust_battery", answer_value: "80" },
        { question_key: "constructive_feedback", answer_value: "follow-through tailed off mid-sprint" },
      ])
    ).toBe(true)
  })

  it("rejects a ghost form with no answers at all", () => {
    expect(submissionCounts([])).toBe(false)
  })

  it("rejects a form whose only written answer is junk", () => {
    // Rule 2 alone. Sliders answered, prose says nothing.
    expect(
      submissionCounts([
        { question_key: "trust_battery", answer_value: "80" },
        { question_key: "purpose_alignment", answer_value: "4" },
        { question_key: "constructive_feedback", answer_value: "na" },
      ])
    ).toBe(false)
  })

  it("rejects a slider-only submission", () => {
    // Rule 1 alone would pass this; it has answer rows but nothing written.
    expect(
      submissionCounts([
        { question_key: "trust_battery", answer_value: "90" },
        { question_key: "teal_wholeness", answer_value: "5" },
      ])
    ).toBe(false)
  })

  it("ignores the selected indices of a values answer and reads its prose", () => {
    // "v2:<indices>|||<prose>" — picking values is a selection, not writing.
    expect(
      submissionCounts([{ question_key: "value_strength", answer_value: "v2:0,2|||" }])
    ).toBe(false)
    expect(
      submissionCounts([
        { question_key: "value_strength", answer_value: "v2:0,2|||carried the migration end to end" },
      ])
    ).toBe(true)
  })

  it("treats junk case- and whitespace-insensitively", () => {
    for (const junk of ["  NA ", "None", "N/A", "all good", "-"]) {
      expect(
        submissionCounts([{ question_key: "constructive_feedback", answer_value: junk }])
      ).toBe(false)
    }
  })
})

describe("buildLeaderboard — the ranked metric", () => {
  it("counts distinct teammates, not submissions", () => {
    // Three reviews, all of the same person: one teammate reviewed, not three.
    const rows = build([review("a", "b"), review("a", "b"), review("a", "b")])
    expect(rowFor(rows, "a").reviewed).toBe(1)
    expect(rowFor(rows, "a").submissions).toBe(3)
  })

  it("ranks on distinct teammates, so repetition cannot win", () => {
    const rows = build([
      review("a", "b"), review("a", "b"), review("a", "b"), review("a", "b"),
      review("b", "a"), review("b", "c"),
    ])
    expect(rowFor(rows, "b").rank).toBe(1)
    expect(rowFor(rows, "a").rank).toBeGreaterThan(1)
  })

  it("includes everyone, including people with nothing", () => {
    const rows = build([review("a", "b")])
    expect(rows).toHaveLength(people.length)
    expect(rowFor(rows, "d").reviewed).toBe(0)
  })

  it("gives tied scores the same rank and skips the next position", () => {
    // a and b both review one person; c and d review nobody.
    const rows = build([review("a", "c"), review("b", "c")])
    expect(rowFor(rows, "a").rank).toBe(1)
    expect(rowFor(rows, "b").rank).toBe(1)
    expect(rowFor(rows, "c").rank).toBe(3)
    expect(rowFor(rows, "d").rank).toBe(3)
  })

  it("breaks ties on streak before submission count", () => {
    const rows = build([review("a", "c"), review("b", "c")], {
      streaks: new Map([["b", 4], ["a", 1]]),
    })
    expect(rows[0].employeeId).toBe("b")
  })

  it("reports reachable as the roster minus yourself", () => {
    expect(rowFor(build([]), "a").reachable).toBe(3)
  })
})

describe("buildLeaderboard — what must not count", () => {
  it("ignores a self-review", () => {
    expect(rowFor(build([review("a", "a")]), "a").reviewed).toBe(0)
  })

  it("ignores a review given to someone off the roster", () => {
    expect(rowFor(build([review("a", "gone")]), "a").reviewed).toBe(0)
  })

  it("ignores a review given by someone off the roster", () => {
    // A departed teammate's old review must not inflate the recipient's
    // received count against a denominator that can no longer move.
    expect(rowFor(build([review("gone", "b")]), "b").received).toBe(0)
  })
})

describe("buildLeaderboard — received", () => {
  it("counts distinct people who reviewed them, not submissions", () => {
    const rows = build([review("a", "c"), review("a", "c"), review("b", "c")])
    expect(rowFor(rows, "c").received).toBe(2)
  })

  it("never affects rank", () => {
    // c is reviewed by everyone and reviews nobody: still last.
    const rows = build([review("a", "c"), review("b", "c"), review("d", "c")])
    expect(rowFor(rows, "c").reviewed).toBe(0)
    expect(rowFor(rows, "c").rank).toBe(rows[rows.length - 1].rank)
  })
})

describe("computeStreaks", () => {
  const cycles = ["2026-09-08", "2026-08-11", "2026-07-14", "2026-06-09"]

  it("counts consecutive cycles back from the most recent", () => {
    const byCycle = new Map([
      ["2026-09-08", new Set(["a"])],
      ["2026-08-11", new Set(["a"])],
      ["2026-07-14", new Set(["a"])],
    ])
    expect(computeStreaks(byCycle, cycles, ["a"]).get("a")).toBe(3)
  })

  it("breaks on a gap", () => {
    const byCycle = new Map([
      ["2026-09-08", new Set(["a"])],
      ["2026-07-14", new Set(["a"])],
      ["2026-06-09", new Set(["a"])],
    ])
    expect(computeStreaks(byCycle, cycles, ["a"]).get("a")).toBe(1)
  })

  it("is zero when the current cycle is empty, however long the history", () => {
    // A streak you keep while doing nothing is not a streak.
    const byCycle = new Map([
      ["2026-08-11", new Set(["a"])],
      ["2026-07-14", new Set(["a"])],
    ])
    expect(computeStreaks(byCycle, cycles, ["a"]).get("a")).toBe(0)
  })

  it("is zero for someone who has never given", () => {
    expect(computeStreaks(new Map(), cycles, ["d"]).get("d")).toBe(0)
  })
})

describe("needsFeedback", () => {
  it("lists the people nobody has reviewed", () => {
    const rows = build([review("a", "b")])
    expect(needsFeedback(rows).map((r) => r.employeeId)).toEqual(["a", "c", "d"])
  })

  it("is empty when everyone has been reviewed", () => {
    const rows = build([
      review("a", "b"), review("b", "a"), review("c", "d"), review("d", "c"),
    ])
    expect(needsFeedback(rows)).toHaveLength(0)
  })
})
