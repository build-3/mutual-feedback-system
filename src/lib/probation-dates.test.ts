import { describe, expect, it } from "vitest"

import {
  addMonthsIso,
  checkJoiningDate,
  daysBetweenIso,
  isValidIsoDate,
} from "./probation-dates"

describe("isValidIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true)
    expect(isValidIsoDate("2028-02-29")).toBe(true)
  })
  it("rejects impossible dates and wrong shapes", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false)
    expect(isValidIsoDate("2027-02-29")).toBe(false)
    expect(isValidIsoDate("2026-13-01")).toBe(false)
    expect(isValidIsoDate("15/03/2026")).toBe(false)
    expect(isValidIsoDate("2026-3-1")).toBe(false)
    expect(isValidIsoDate("")).toBe(false)
    expect(isValidIsoDate(null)).toBe(false)
    expect(isValidIsoDate(20260301)).toBe(false)
  })
})

describe("addMonthsIso", () => {
  it("adds three months", () => {
    expect(addMonthsIso("2026-01-15", 3)).toBe("2026-04-15")
  })
  it("adds six months across a year end", () => {
    expect(addMonthsIso("2026-09-10", 6)).toBe("2027-03-10")
  })
  it("clamps to the last day of a shorter month", () => {
    expect(addMonthsIso("2026-11-30", 3)).toBe("2027-02-28")
    expect(addMonthsIso("2027-11-30", 3)).toBe("2028-02-29")
    expect(addMonthsIso("2026-08-31", 3)).toBe("2026-11-30")
  })
  it("never returns a day earlier than the calendar says, whatever the host timezone", () => {
    // The old helper went through local midnight and toISOString(), which is
    // one day early on a host east of UTC. This is the case the sweep guards.
    expect(addMonthsIso("2026-03-01", 3)).toBe("2026-06-01")
  })
  it("throws on a bad date instead of guessing", () => {
    expect(() => addMonthsIso("nope", 3)).toThrow()
  })
})

describe("checkJoiningDate", () => {
  const now = new Date("2026-11-06T10:00:00Z")
  it("accepts a past date", () => {
    expect(checkJoiningDate("2026-07-15", now)).toEqual({ ok: true, date: "2026-07-15" })
  })
  it("accepts a date a few days ahead", () => {
    expect(checkJoiningDate("2026-11-10", now).ok).toBe(true)
  })
  it("rejects a date too far ahead", () => {
    expect(checkJoiningDate("2027-03-01", now).ok).toBe(false)
  })
  it("rejects a date before 2015", () => {
    expect(checkJoiningDate("2009-01-01", now).ok).toBe(false)
  })
  it("rejects garbage", () => {
    expect(checkJoiningDate("yesterday", now).ok).toBe(false)
  })
})

describe("daysBetweenIso", () => {
  it("counts whole days, signed", () => {
    expect(daysBetweenIso("2026-11-01", "2026-11-06")).toBe(5)
    expect(daysBetweenIso("2026-11-06", "2026-11-01")).toBe(-5)
    expect(daysBetweenIso("2026-11-06", "2026-11-06")).toBe(0)
  })
})
