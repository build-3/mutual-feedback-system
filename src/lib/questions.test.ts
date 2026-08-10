import { describe, expect, it } from "vitest"

import {
  BUILD3_QUESTIONS,
  FULL_TIMER_QUESTIONS,
  INTERN_QUESTIONS,
  CONDITIONAL_DETAIL_PARENTS,
  MIN_ANSWER_LENGTHS,
  TRUST_DETAIL_MIN_LENGTH,
  TRUST_DETAIL_REQUIRED_BELOW,
  requiredDetailLength,
  validateFollowupDetail,
  type Question,
} from "./questions"

const trustBatteryIn = (questions: Question[]) =>
  questions.find((q) => q.key === "trust_battery")!

describe("the trust battery minimum is wired to every path", () => {
  it.each([
    ["intern", INTERN_QUESTIONS],
    ["full_timer", FULL_TIMER_QUESTIONS],
    ["build3", BUILD3_QUESTIONS],
  ] as const)("applies to %s", (_path, questions) => {
    const question = trustBatteryIn(questions)
    expect(question.type).toBe("slider_with_followup")
    expect(question.followup?.minDetailLength).toBe(TRUST_DETAIL_MIN_LENGTH)
  })

  it("exposes it to the server via the derived map", () => {
    // Derived from the question definitions, so it can't drift from them.
    expect(MIN_ANSWER_LENGTHS.trust_battery_detail).toBe(TRUST_DETAIL_MIN_LENGTH)
  })

  it("does not blanket-apply a minimum to unrelated keys", () => {
    expect(MIN_ANSWER_LENGTHS.constructive_feedback).toBeUndefined()
    expect(MIN_ANSWER_LENGTHS.policies_unclear).toBeUndefined()
  })
})

describe("validateFollowupDetail", () => {
  const question = trustBatteryIn(BUILD3_QUESTIONS)

  it("rejects empty, missing, and whitespace-only answers", () => {
    for (const value of [undefined, "", "   ", "\n\t "]) {
      expect(validateFollowupDetail(question, value)).not.toBeNull()
    }
  })

  it("rejects a short answer", () => {
    expect(validateFollowupDetail(question, "too short")).not.toBeNull()
  })

  it("counts trimmed length, so padding does not satisfy it", () => {
    const padded = `${" ".repeat(40)}nope${" ".repeat(40)}`
    expect(padded.length).toBeGreaterThan(TRUST_DETAIL_MIN_LENGTH)
    expect(validateFollowupDetail(question, padded)).not.toBeNull()
  })

  it("accepts exactly the minimum", () => {
    const exact = "a".repeat(TRUST_DETAIL_MIN_LENGTH)
    expect(validateFollowupDetail(question, exact)).toBeNull()
  })

  it("accepts a real answer", () => {
    expect(
      validateFollowupDetail(question, "onboarding docs were hard to find in week one")
    ).toBeNull()
  })

  it("mentions the required length so the message is actionable", () => {
    expect(validateFollowupDetail(question, "x")).toContain(
      String(TRUST_DETAIL_MIN_LENGTH)
    )
  })

  it("passes any value for a question that declares no minimum", () => {
    const noMin: Question = {
      key: "x",
      text: "x",
      type: "slider_with_followup",
      followup: {
        detailKey: "x_detail",
        threshold: 90,
        lowPrompt: "low",
        highPrompt: "high",
      },
    }
    expect(validateFollowupDetail(noMin, "")).toBeNull()
    expect(validateFollowupDetail(noMin, undefined)).toBeNull()
  })
})

describe("the trust battery minimum only bites below the cutoff", () => {
  const question = trustBatteryIn(BUILD3_QUESTIONS)

  it("requires the sentence for every score below the cutoff", () => {
    for (const score of [0, 1, 30, 50, 70, 84]) {
      expect(requiredDetailLength(question, score), String(score)).toBe(
        TRUST_DETAIL_MIN_LENGTH
      )
      expect(validateFollowupDetail(question, "too short", score)).not.toBeNull()
    }
  })

  it("is optional at and above the cutoff", () => {
    for (const score of [TRUST_DETAIL_REQUIRED_BELOW, 90, 100]) {
      expect(requiredDetailLength(question, score), String(score)).toBe(0)
      expect(validateFollowupDetail(question, "", score)).toBeNull()
    }
  })

  it("puts the boundary exactly at the cutoff", () => {
    expect(requiredDetailLength(question, TRUST_DETAIL_REQUIRED_BELOW - 1)).toBe(
      TRUST_DETAIL_MIN_LENGTH
    )
    expect(requiredDetailLength(question, TRUST_DETAIL_REQUIRED_BELOW)).toBe(0)
  })

  it("stays required when the score is missing or unparseable", () => {
    // Failing open would let a bad number switch the rule off silently.
    for (const bad of [undefined, null, NaN]) {
      expect(requiredDetailLength(question, bad as number)).toBe(
        TRUST_DETAIL_MIN_LENGTH
      )
    }
  })

  it("hands the server the same rule instead of a flat minimum", () => {
    // Without this the server enforced 20 characters at every score and would
    // reject a terse reply the client had just accepted at 95.
    const parent = CONDITIONAL_DETAIL_PARENTS.trust_battery_detail
    expect(parent).toBeDefined()
    expect(parent.key).toBe("trust_battery")
    expect(requiredDetailLength(parent, 95)).toBe(0)
    expect(requiredDetailLength(parent, 40)).toBe(TRUST_DETAIL_MIN_LENGTH)
  })
})

describe("teal principles carry a definition for the info button", () => {
  const EXPECTED: Record<string, string> = {
    teal_self_management:
      "Enabling autonomous decision-making with accountability.",
    teal_wholeness:
      "Bringing your authentic self to work instead of wearing a professional mask.",
    teal_evolutionary_purpose:
      "Continuously adapting to fulfill the organization's evolving purpose.",
  }

  it.each([
    ["intern", INTERN_QUESTIONS],
    ["full_timer", FULL_TIMER_QUESTIONS],
  ] as const)("is wired on the %s path", (_path, questions) => {
    const teal = questions.find((q) => q.key === "teal_concepts")!
    expect(teal.matrixItems).toHaveLength(3)
    for (const item of teal.matrixItems!) {
      expect(EXPECTED[item.key], item.key).toBeDefined()
      expect(item.definition, item.key).toBe(EXPECTED[item.key])
      // The behavioural description stays: it says what to look for in this
      // person, where the definition explains the principle itself.
      expect(item.description, item.key).toBeTruthy()
    }
  })
})
