import { describe, expect, it } from "vitest"

import { TRUST_DETAIL_REQUIRED_BELOW } from "./questions"
import {
  SPONSOR_ALERT_CONFIG,
  buildNoSponsorText,
  buildSponsorAlertText,
  classifyFeedbackSignal,
  readTrust,
} from "./sponsor-alert"

const a = (key: string, value: string) => ({ question_key: key, answer_value: value })

describe("the alert line", () => {
  it("is the form's own line, not a new number", () => {
    expect(SPONSOR_ALERT_CONFIG.trustBelow).toBe(TRUST_DETAIL_REQUIRED_BELOW)
  })
})

describe("readTrust", () => {
  it("reads the trust battery", () => {
    expect(readTrust([a("teal_concepts", "x"), a("trust_battery", "72")])).toBe(72)
  })
  it("returns null when absent or not a number", () => {
    expect(readTrust([a("teal_concepts", "x")])).toBeNull()
    expect(readTrust([a("trust_battery", "high")])).toBeNull()
    expect(readTrust([])).toBeNull()
  })
})

describe("classifyFeedbackSignal", () => {
  it("flags a trust score below the line", () => {
    const s = classifyFeedbackSignal([a("trust_battery", "60")])
    expect(s.negative).toBe(true)
    if (s.negative) expect(s.trust).toBe(60)
  })
  it("does not flag the line itself or above", () => {
    expect(classifyFeedbackSignal([a("trust_battery", "85")]).negative).toBe(false)
    expect(classifyFeedbackSignal([a("trust_battery", "100")]).negative).toBe(false)
  })
  it("never flags when there is no trust score, rather than guessing", () => {
    expect(classifyFeedbackSignal([a("anything_else", "0")]).negative).toBe(false)
  })
  it("honours a different line", () => {
    expect(classifyFeedbackSignal([a("trust_battery", "70")], { trustBelow: 60 }).negative).toBe(false)
    expect(classifyFeedbackSignal([a("trust_battery", "50")], { trustBelow: 60 }).negative).toBe(true)
  })
})

describe("copy", () => {
  it("addresses the sponsor and links the candidate's insights", () => {
    const text = buildSponsorAlertText({
      sponsorName: "Varun",
      candidateName: "Nikita",
      reason: "a trust score of 60%",
      url: "https://x/insights?employee=1",
    })
    expect(text).toContain("Hello Varun")
    expect(text).toContain("Nikita")
    expect(text).toContain("https://x/insights?employee=1")
  })
  it("the no-sponsor message says nobody owns the conversation", () => {
    const text = buildNoSponsorText({ candidateName: "Nikita", reason: "r", url: "u" })
    expect(text).toContain("no sponsor is recorded")
  })
  it("uses no em dashes", () => {
    const all =
      buildSponsorAlertText({ sponsorName: "a", candidateName: "b", reason: "c", url: "d" }) +
      buildNoSponsorText({ candidateName: "b", reason: "c", url: "d" })
    expect(all).not.toContain("—")
  })
})
