import { describe, expect, it } from "vitest"

import {
  REVIEW_GAP_CONFIG,
  buildReviewGapNoSponsorText,
  buildReviewGapText,
  countFullTimeReviewers,
  decideReviewGap,
  describeDaysLeft,
  isFullTimeRole,
} from "./review-gap"

const base = { status: "active", fullTimeReviewers: 1, endDate: "2026-12-10", today: "2026-11-20" }

describe("config", () => {
  it("is 3 full-timers", () => {
    expect(REVIEW_GAP_CONFIG.minFullTimers).toBe(3)
  })
})

describe("isFullTimeRole", () => {
  it("counts full-timers and admins, not people on probation", () => {
    expect(isFullTimeRole("full_timer")).toBe(true)
    expect(isFullTimeRole("admin")).toBe(true)
    expect(isFullTimeRole("intern")).toBe(false)
    expect(isFullTimeRole(undefined)).toBe(false)
  })
})

describe("countFullTimeReviewers", () => {
  const roles = new Map([
    ["ft1", "full_timer"],
    ["ft2", "full_timer"],
    ["adm", "admin"],
    ["int", "intern"],
    ["cand", "intern"],
  ])
  const sub = (id: string) => ({ submitted_by_id: id })

  it("counts distinct people, not submissions", () => {
    expect(countFullTimeReviewers([sub("ft1"), sub("ft1"), sub("ft1")], roles)).toBe(1)
  })
  it("ignores reviewers who are on probation", () => {
    expect(countFullTimeReviewers([sub("int"), sub("ft1")], roles)).toBe(1)
  })
  it("counts an admin as full-time", () => {
    expect(countFullTimeReviewers([sub("adm"), sub("ft1"), sub("ft2")], roles)).toBe(3)
  })
  it("does not count a reviewer it cannot place", () => {
    expect(countFullTimeReviewers([sub("stranger")], roles)).toBe(0)
  })
  it("does not count the person reviewing themselves", () => {
    expect(countFullTimeReviewers([sub("ft1")], roles, "ft1")).toBe(0)
  })
  it("is zero with no submissions", () => {
    expect(countFullTimeReviewers([], roles)).toBe(0)
  })
})

describe("decideReviewGap", () => {
  it("alerts when fewer than 3 full-timers in the final 30 days", () => {
    expect(decideReviewGap(base)).toEqual({ alert: true, daysLeft: 20 })
  })
  it("does not alert at 3 or more", () => {
    expect(decideReviewGap({ ...base, fullTimeReviewers: 3 }).alert).toBe(false)
    expect(decideReviewGap({ ...base, fullTimeReviewers: 9 }).alert).toBe(false)
  })
  it("does not alert before the final 30 days", () => {
    expect(decideReviewGap({ ...base, today: "2026-10-01" }).alert).toBe(false)
  })
  it("alerts exactly 30 days out, not 31", () => {
    expect(decideReviewGap({ ...base, today: "2026-11-10" }).alert).toBe(true)
    expect(decideReviewGap({ ...base, today: "2026-11-09" }).alert).toBe(false)
  })
  it("keeps alerting after the end date", () => {
    expect(decideReviewGap({ ...base, today: "2026-12-20" })).toEqual({ alert: true, daysLeft: -10 })
  })
  it("treats zero as a gap", () => {
    expect(decideReviewGap({ ...base, fullTimeReviewers: 0 }).alert).toBe(true)
  })
  it("ignores a probation that is not open", () => {
    expect(decideReviewGap({ ...base, status: "promoted" }).alert).toBe(false)
  })
  it("covers extended probations", () => {
    expect(decideReviewGap({ ...base, status: "extended" }).alert).toBe(true)
  })
})

describe("copy", () => {
  it("describes days left in plain words", () => {
    expect(describeDaysLeft(20)).toBe("their probation ends in 20 days")
    expect(describeDaysLeft(1)).toBe("their probation ends in 1 day")
    expect(describeDaysLeft(0)).toBe("their probation ends today")
    expect(describeDaysLeft(-3)).toBe("their probation ended 3 days ago")
  })
  it("names the sponsor, the person and the full-time count", () => {
    const t = buildReviewGapText({
      sponsorName: "Varun",
      candidateName: "Nikita",
      fullTimeReviewers: 1,
      daysLeft: 20,
      url: "https://x/insights?employee=1",
    })
    expect(t).toContain("Hello Varun")
    expect(t).toContain("feedback from only 1 full-time teammate so far")
    expect(t).toContain("fewer than 3 full-time teammates")
  })
  it("says it plainly at zero", () => {
    const t = buildReviewGapText({ sponsorName: "a", candidateName: "b", fullTimeReviewers: 0, daysLeft: 5, url: "u" })
    expect(t).toContain("no feedback from a full-time teammate yet")
  })
  it("the no-sponsor text says nobody owns the conversation", () => {
    expect(
      buildReviewGapNoSponsorText({ candidateName: "b", fullTimeReviewers: 2, daysLeft: 5, url: "u" })
    ).toContain("no sponsor is recorded")
  })
  it("uses no em dashes", () => {
    const all =
      buildReviewGapText({ sponsorName: "a", candidateName: "b", fullTimeReviewers: 1, daysLeft: 5, url: "u" }) +
      buildReviewGapNoSponsorText({ candidateName: "b", fullTimeReviewers: 1, daysLeft: 5, url: "u" })
    expect(all).not.toContain("—")
  })
})
