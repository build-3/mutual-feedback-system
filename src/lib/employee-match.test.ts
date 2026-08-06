import { describe, expect, it } from "vitest"

import {
  employeeMatchScore,
  filterAndRankEmployees,
  matchedOnEmail,
} from "./employee-match"

const arjun = { name: "T Arjun", email: "at@build3.org" }
const varun = { name: "Varun Chawla", email: "vc@build3.org" }
const nat = { name: "Natalie Brooks", email: "natalie@build3.org" }
const matt = { name: "Matt Kate", email: "mkate@build3.org" }
const noEmail = { name: "Legacy Person", email: null }

const roster = [arjun, varun, nat, matt, noEmail]

describe("the cases this exists for", () => {
  it('finds arjun by "at"', () => {
    expect(filterAndRankEmployees(roster, "at")[0]).toBe(arjun)
  })

  it('finds varun by "vc"', () => {
    expect(filterAndRankEmployees(roster, "vc")).toEqual([varun])
  })

  it("ranks the email match above people whose names merely contain the query", () => {
    // "at" appears in Natalie and Matt Kate. Without ranking, at@build3.org gets
    // buried — which is the whole reason scoring exists.
    const ranked = filterAndRankEmployees(roster, "at")
    expect(ranked[0]).toBe(arjun)
    expect(ranked).toContain(nat)
    expect(ranked).toContain(matt)
  })
})

describe("no domain false positives", () => {
  it("does not return the whole roster for the domain", () => {
    expect(filterAndRankEmployees(roster, "build3")).toEqual([])
  })

  it("does not match on the tld", () => {
    expect(filterAndRankEmployees(roster, "org")).toEqual([])
  })

  it("still matches a full pasted address", () => {
    expect(filterAndRankEmployees(roster, "vc@build3.org")).toEqual([varun])
  })
})

describe("name matching is unchanged", () => {
  it("matches a name substring", () => {
    expect(filterAndRankEmployees(roster, "chawla")).toEqual([varun])
  })

  it("matches case-insensitively", () => {
    expect(filterAndRankEmployees(roster, "VARUN")).toEqual([varun])
  })

  it("prefers a word-start match over a mid-word one", () => {
    const ranked = filterAndRankEmployees([nat, { name: "Anat Cohen" }], "nat")
    expect(ranked[0]).toBe(nat)
  })

  it("handles employees with no email at all", () => {
    expect(employeeMatchScore(noEmail, "legacy")).toBeGreaterThan(0)
    expect(employeeMatchScore(noEmail, "at")).toBe(0)
  })
})

describe("edge cases", () => {
  it("returns the list untouched for an empty query", () => {
    expect(filterAndRankEmployees(roster, "   ")).toEqual(roster)
  })

  it("trims the query", () => {
    expect(filterAndRankEmployees(roster, "  vc  ")).toEqual([varun])
  })

  it("reports whether the match came from the email", () => {
    expect(matchedOnEmail(arjun, "at")).toBe(true)
    expect(matchedOnEmail(varun, "chawla")).toBe(false)
  })

  it("sorts equal scores alphabetically", () => {
    const ranked = filterAndRankEmployees(
      [{ name: "Zoe Adams" }, { name: "Adam Zeta" }],
      "a"
    )
    expect(ranked.map((e) => e.name)).toEqual(["Adam Zeta", "Zoe Adams"])
  })
})
