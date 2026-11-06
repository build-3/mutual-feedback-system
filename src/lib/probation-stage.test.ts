import { describe, expect, it } from "vitest"

import { CONFIRMED_VISIBLE_DAYS, probationMonth, probationStage } from "./probation-stage"

const today = "2026-11-06"
const open = { status: "active", promotedAt: null, today }

describe("probationStage", () => {
  it("is under probation when the end is far off", () => {
    expect(probationStage({ ...open, endDate: "2027-01-20" })).toBe("under_probation")
  })
  it("is eligible for review inside the final 30 days", () => {
    expect(probationStage({ ...open, endDate: "2026-12-06" })).toBe("eligible_for_review")
    expect(probationStage({ ...open, endDate: "2026-12-07" })).toBe("under_probation")
  })
  it("stays eligible after the end date rather than disappearing", () => {
    expect(probationStage({ ...open, endDate: "2026-09-16" })).toBe("eligible_for_review")
  })
  it("treats an extended probation the same way", () => {
    expect(probationStage({ ...open, status: "extended", endDate: "2026-11-20" })).toBe("eligible_for_review")
  })
  it("shows a recently confirmed person as full time", () => {
    expect(
      probationStage({ status: "promoted", endDate: "2026-09-01", promotedAt: "2026-10-20T10:00:00Z", today })
    ).toBe("full_time")
  })
  it("drops a confirmed person after the visible window", () => {
    const old = new Date(Date.parse(`${today}T00:00:00Z`) - (CONFIRMED_VISIBLE_DAYS + 1) * 86_400_000)
      .toISOString()
    expect(probationStage({ status: "promoted", endDate: "2026-01-01", promotedAt: old, today })).toBeNull()
  })
  it("ignores unknown statuses", () => {
    expect(probationStage({ ...open, status: "weird", endDate: "2026-12-01" })).toBeNull()
  })
})

describe("probationMonth", () => {
  it("is month 1 on day one", () => {
    expect(probationMonth({ startDate: "2026-11-06", today, durationMonths: 3 })).toEqual({ month: 1, of: 3 })
  })
  it("advances roughly monthly", () => {
    expect(probationMonth({ startDate: "2026-09-06", today, durationMonths: 3 })).toEqual({ month: 3, of: 3 })
    expect(probationMonth({ startDate: "2026-10-01", today, durationMonths: 3 })).toEqual({ month: 2, of: 3 })
  })
  it("is capped at the period when overdue", () => {
    expect(probationMonth({ startDate: "2026-01-01", today, durationMonths: 3 })).toEqual({ month: 3, of: 3 })
  })
  it("never goes below month 1 for a start date in the future", () => {
    expect(probationMonth({ startDate: "2026-11-20", today, durationMonths: 3 })).toEqual({ month: 1, of: 3 })
  })
})
