import { describe, expect, it } from "vitest"
import { sortAnswersByQuestionOrder } from "./answer-order"

const rows = (...keys: string[]) => keys.map((question_key) => ({ question_key }))
const keysOf = (rs: { question_key: string }[]) => rs.map((r) => r.question_key)

describe("sortAnswersByQuestionOrder", () => {
  it("restores the order the intern form asks in, however the rows arrive", () => {
    const shuffled = rows(
      "constructive_feedback",
      "trust_battery",
      "recommend_rating",
      "value_strength",
      "teal_wholeness",
      "contribution_level",
      "purpose_alignment",
      "teal_self_management",
      "trust_battery_detail",
      "teal_evolutionary_purpose",
      "value_improvement"
    )
    expect(keysOf(sortAnswersByQuestionOrder("intern", shuffled))).toEqual([
      "recommend_rating",
      "teal_self_management",
      "teal_wholeness",
      "teal_evolutionary_purpose",
      "purpose_alignment",
      "trust_battery",
      "trust_battery_detail",
      "contribution_level",
      "value_strength",
      "value_improvement",
      "constructive_feedback",
    ])
  })

  it("slots the new ecoāshrām answer and its follow-up where the form asks them", () => {
    const shuffled = rows(
      "constructive_feedback",
      "ecoashram_presence_detail",
      "trust_battery",
      "recommend_rating",
      "ecoashram_presence",
      "teal_wholeness"
    )
    expect(keysOf(sortAnswersByQuestionOrder("intern", shuffled))).toEqual([
      "recommend_rating",
      "teal_wholeness",
      "ecoashram_presence",
      "ecoashram_presence_detail",
      "trust_battery",
      "constructive_feedback",
    ])
    expect(keysOf(sortAnswersByQuestionOrder("full_timer", rows("trust_battery", "ecoashram_presence_detail", "ecoashram_presence")))).toEqual([
      "ecoashram_presence",
      "ecoashram_presence_detail",
      "trust_battery",
    ])
  })

  it("keeps an old purpose_alignment answer in the slot the replacement now holds", () => {
    // Submitted before the swap: purpose_alignment sat between teal and trust battery.
    const out = sortAnswersByQuestionOrder(
      "full_timer",
      rows("trust_battery", "purpose_alignment", "teal_wholeness", "constructive_feedback")
    )
    expect(keysOf(out)).toEqual(["teal_wholeness", "purpose_alignment", "trust_battery", "constructive_feedback"])
  })

  it("orders org feedback the way the build3 form asks", () => {
    const out = sortAnswersByQuestionOrder(
      "build3",
      rows("tools_resources", "trust_battery_detail", "nps_score", "policies_unclear", "purpose_alignment", "trust_battery")
    )
    expect(keysOf(out)).toEqual([
      "nps_score",
      "trust_battery",
      "trust_battery_detail",
      "purpose_alignment",
      "policies_unclear",
      "tools_resources",
    ])
  })

  it("puts retired keys after current ones, keeping their relative order", () => {
    const out = sortAnswersByQuestionOrder(
      "intern",
      rows("upcoming_projects", "constructive_feedback", "excellence_area", "recommend_rating")
    )
    expect(keysOf(out)).toEqual(["recommend_rating", "constructive_feedback", "upcoming_projects", "excellence_area"])
  })

  it("leaves an unknown feedback type untouched", () => {
    const input = rows("b", "a")
    expect(sortAnswersByQuestionOrder("mystery", input)).toBe(input)
  })
})
