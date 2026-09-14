import { describe, expect, it } from "vitest"

import {
  DEFAULT_PULSE_CONFIG,
  aggregateReviews,
  bucketFor,
  buildReviewInput,
  dedupeByReviewerCycle,
  normalise1to5,
  normaliseContribution,
  normaliseTrust,
  scoreReview,
  strongestComponent,
  weakestComponents,
  type ReviewInput,
} from "./pulse-scoring"

/** A review with every component present, overridable per test. */
function review(over: Partial<ReviewInput> = {}): ReviewInput {
  return {
    submissionId: "s1",
    reviewerId: "r1",
    createdAt: "2026-09-01T00:00:00.000Z",
    trustBattery: 85,
    teal: [4, 4, 4],
    purpose: 4,
    contribution: 3,
    backing: null,
    ...over,
  }
}

describe("normalisers", () => {
  it("maps the 1-5 scale onto its full 0-100 range", () => {
    expect(normalise1to5(1)).toBe(0)
    expect(normalise1to5(3)).toBe(50)
    expect(normalise1to5(5)).toBe(100)
  })

  it("maps the 1-4 contribution ladder onto its full range", () => {
    expect(normaliseContribution(1)).toBe(0)
    expect(normaliseContribution(4)).toBe(100)
    expect(normaliseContribution(3)).toBeCloseTo(66.67, 1)
  })

  it("clamps values stored outside their scale rather than propagating them", () => {
    expect(normaliseTrust(140)).toBe(100)
    expect(normaliseTrust(-10)).toBe(0)
    expect(normalise1to5(9)).toBe(100)
  })
})

describe("scoreReview — the calibration table from the spec", () => {
  it("scores the doing-well profile at 77", () => {
    const s = scoreReview(review({ trustBattery: 85, teal: [4, 4, 4], contribution: 3, purpose: 4 }))
    expect(s!.composite).toBeCloseTo(77.1, 0)
  })

  it("scores the on-the-fence profile at 66", () => {
    const s = scoreReview(review({ trustBattery: 72, teal: [3.3, 3.3, 3.3], contribution: 3, purpose: 3.5 }))
    expect(s!.composite).toBeCloseTo(65.7, 0)
  })

  it("scores the needs-a-conversation profile at 45", () => {
    const s = scoreReview(review({ trustBattery: 55, teal: [2.5, 2.5, 2.5], contribution: 2, purpose: 3 }))
    expect(s!.composite).toBeCloseTo(44.8, 0)
  })
})

describe("scoreReview — missing components", () => {
  it("renormalises the remaining weights to sum to 1", () => {
    const s = scoreReview(review({ backing: null }))!
    const total = s.components.reduce((sum, c) => sum + c.weight, 0)
    expect(total).toBeCloseTo(1, 10)
  })

  it("does not treat an absent component as a zero", () => {
    // Full-timers never have a backing component. If it were scored as 0 it
    // would drag every full-timer down by a fixed ~10 points.
    const withBacking = scoreReview(review({ backing: 5 }))!
    const withoutBacking = scoreReview(review({ backing: null }))!
    // Backing at 5 normalises to 100, above the rest, so it should pull UP.
    expect(withBacking.composite).toBeGreaterThan(withoutBacking.composite)
    // And the absence must not be worse than the lowest possible presence.
    const worstBacking = scoreReview(review({ backing: 1 }))!
    expect(withoutBacking.composite).toBeGreaterThan(worstBacking.composite)
  })

  it("averages only the teal sub-scores that were answered", () => {
    const partial = scoreReview(review({ teal: [4, null, null] }))!
    const full = scoreReview(review({ teal: [4, 4, 4] }))!
    expect(partial.composite).toBeCloseTo(full.composite, 10)
  })

  it("returns null when nothing usable was answered", () => {
    expect(
      scoreReview(review({ trustBattery: null, teal: [null, null, null], purpose: null, contribution: null, backing: null }))
    ).toBeNull()
  })

  it("returns null rather than NaN when every applicable weight is zero", () => {
    const zeroed = { trust_battery: 0, teal: 0, contribution: 0, purpose: 0, backing: 0 }
    expect(scoreReview(review(), zeroed)).toBeNull()
  })
})

describe("aggregateReviews", () => {
  const scored = [
    scoreReview(review({ submissionId: "a", reviewerId: "r1", trustBattery: 90 }))!,
    scoreReview(review({ submissionId: "b", reviewerId: "r2", trustBattery: 50 }))!,
  ]

  it("weights every reviewer equally", () => {
    const agg = aggregateReviews(scored)!
    expect(agg.composite).toBeCloseTo((scored[0].composite + scored[1].composite) / 2, 10)
    expect(agg.count).toBe(2)
  })

  it("keeps the spread so disagreement stays visible", () => {
    const agg = aggregateReviews(scored)!
    expect(agg.min).toBeLessThan(agg.max)
    expect(agg.min).toBeCloseTo(Math.min(scored[0].composite, scored[1].composite), 10)
  })

  it("averages each component only over the reviews that carried it", () => {
    const mixed = [
      scoreReview(review({ submissionId: "a", backing: 5 }))!,
      scoreReview(review({ submissionId: "b", backing: null }))!,
    ]
    const agg = aggregateReviews(mixed)!
    expect(agg.componentAverages.backing).toBe(100)
  })

  it("returns null for no reviews", () => {
    expect(aggregateReviews([])).toBeNull()
  })
})

describe("bucketFor", () => {
  it("holds out anyone under min_reviews, whatever their score", () => {
    expect(bucketFor(95, "full_timer", 1)).toBe("not_enough_signal")
    expect(bucketFor(20, "full_timer", 0)).toBe("not_enough_signal")
    expect(bucketFor(null, "full_timer", 5)).toBe("not_enough_signal")
  })

  it("applies the full-timer cut lines", () => {
    expect(bucketFor(70, "full_timer", 3)).toBe("doing_well")
    expect(bucketFor(69.9, "full_timer", 3)).toBe("on_the_fence")
    expect(bucketFor(55, "full_timer", 3)).toBe("on_the_fence")
    expect(bucketFor(54.9, "full_timer", 3)).toBe("needs_conversation")
  })

  it("applies the lower probation cut lines", () => {
    // 60 is on the fence for a full-timer but doing fine on probation.
    expect(bucketFor(60, "full_timer", 3)).toBe("on_the_fence")
    expect(bucketFor(60, "probation", 3)).toBe("on_the_fence")
    expect(bucketFor(65, "probation", 3)).toBe("doing_well")
    expect(bucketFor(65, "full_timer", 3)).toBe("on_the_fence")
    expect(bucketFor(52, "probation", 3)).toBe("on_the_fence")
    expect(bucketFor(52, "full_timer", 3)).toBe("needs_conversation")
  })

  it("honours a lowered min_reviews from config", () => {
    const loose = { ...DEFAULT_PULSE_CONFIG, min_reviews: 1 }
    expect(bucketFor(80, "full_timer", 1, loose)).toBe("doing_well")
  })
})

describe("weakest / strongest components", () => {
  const agg = aggregateReviews([
    scoreReview(review({ trustBattery: 40, teal: [5, 5, 5], purpose: 2, contribution: 4 }))!,
  ])!

  it("names the lowest components for the note", () => {
    const weak = weakestComponents(agg, 2).map((w) => w.key)
    expect(weak).toEqual(["purpose", "trust_battery"])
  })

  it("names the highest component for the doing-well note", () => {
    expect(strongestComponent(agg)!.key).toBe("teal")
  })
})

describe("buildReviewInput", () => {
  const submission = { id: "s1", submitted_by_id: "r1", created_at: "2026-09-01T00:00:00.000Z" }

  it("reads the EAV answer rows into numeric parts", () => {
    const input = buildReviewInput(submission, [
      { question_key: "trust_battery", answer_value: "78" },
      { question_key: "teal_self_management", answer_value: "4" },
      { question_key: "teal_wholeness", answer_value: "3" },
      { question_key: "teal_evolutionary_purpose", answer_value: "5" },
      { question_key: "purpose_alignment", answer_value: "4" },
      { question_key: "contribution_level", answer_value: "C" },
    ])
    expect(input.trustBattery).toBe(78)
    expect(input.teal).toEqual([4, 3, 5])
    expect(input.contribution).toBe(3)
  })

  it("tolerates the label form of contribution_level that older rows carry", () => {
    const input = buildReviewInput(submission, [
      { question_key: "contribution_level", answer_value: "independent contributor" },
    ])
    expect(input.contribution).toBe(3)
  })

  it("leaves unanswered questions null rather than defaulting them", () => {
    const input = buildReviewInput(submission, [])
    expect(input.trustBattery).toBeNull()
    expect(input.purpose).toBeNull()
    expect(input.contribution).toBeNull()
    expect(input.teal).toEqual([null, null, null])
  })

  it("prefers a probation backing_score over recommend_rating", () => {
    const answers = [{ question_key: "recommend_rating", answer_value: "2" }]
    expect(buildReviewInput(submission, answers, 5).backing).toBe(5)
    expect(buildReviewInput(submission, answers, null).backing).toBe(2)
  })
})

describe("dedupeByReviewerCycle", () => {
  // One reviewer, same cycle, submitted twice — the double-POST case.
  const cycleKeyOf = () => "2026-09-08"

  it("keeps only the most recent submission per reviewer per cycle", () => {
    const kept = dedupeByReviewerCycle(
      [
        review({ submissionId: "old", createdAt: "2026-09-01T00:00:00.000Z" }),
        review({ submissionId: "new", createdAt: "2026-09-05T00:00:00.000Z" }),
      ],
      cycleKeyOf
    )
    expect(kept).toHaveLength(1)
    expect(kept[0].submissionId).toBe("new")
  })

  it("keeps different reviewers apart", () => {
    const kept = dedupeByReviewerCycle(
      [review({ reviewerId: "r1" }), review({ reviewerId: "r2" })],
      cycleKeyOf
    )
    expect(kept).toHaveLength(2)
  })

  it("keeps the same reviewer across different cycles", () => {
    let call = 0
    const alternating = () => (call++ === 0 ? "2026-08-11" : "2026-09-08")
    const kept = dedupeByReviewerCycle([review({ submissionId: "a" }), review({ submissionId: "b" })], alternating)
    expect(kept).toHaveLength(2)
  })
})

describe("config defaults", () => {
  it("excludes the studio's own Chat sender account by default", () => {
    // foundation@build3.org sits on the roster as an employee row so it can
    // appear in pickers, and carries an active probation record.
    expect(DEFAULT_PULSE_CONFIG.exclude_emails).toContain("foundation@build3.org")
  })

  it("has weights that sum to 1 before any renormalisation", () => {
    const total = Object.values(DEFAULT_PULSE_CONFIG.weights).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 10)
  })

  it("keeps the probation cut lines below the full-timer ones", () => {
    const { full_timer, probation } = DEFAULT_PULSE_CONFIG.cut_lines
    expect(probation.doing_well).toBeLessThan(full_timer.doing_well)
    expect(probation.on_the_fence).toBeLessThan(full_timer.on_the_fence)
  })
})
