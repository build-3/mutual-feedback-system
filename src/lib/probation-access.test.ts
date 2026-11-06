import { describe, expect, it } from "vitest"

import {
  filterByScope,
  isProbationDecider,
  probationDeciders,
  probationScopeFor,
} from "./probation-access"

describe("deciders", () => {
  it("always include Varun, Arjun and Charlez", () => {
    expect(isProbationDecider("vc@build3.org", "")).toBe(true)
    expect(isProbationDecider("at@build3.org", "")).toBe(true)
    expect(isProbationDecider("ckj@build3.org", "")).toBe(true)
  })
  it("is case and whitespace tolerant", () => {
    expect(isProbationDecider("  CKJ@Build3.org ", "")).toBe(true)
  })
  it("rejects everyone else, and empty input", () => {
    expect(isProbationDecider("someone@build3.org", "")).toBe(false)
    expect(isProbationDecider("", "")).toBe(false)
    expect(isProbationDecider(null, "")).toBe(false)
    expect(isProbationDecider(undefined, "")).toBe(false)
  })
  it("extends from the env var without dropping the floor", () => {
    const env = "new@build3.org, Other@build3.org ,,"
    expect(isProbationDecider("new@build3.org", env)).toBe(true)
    expect(isProbationDecider("other@build3.org", env)).toBe(true)
    expect(isProbationDecider("vc@build3.org", env)).toBe(true)
    expect(probationDeciders(env)).toHaveLength(5)
  })
})

describe("scope", () => {
  const records = [
    { employee_id: "a", n: 1 },
    { employee_id: "b", n: 2 },
    { employee_id: "c", n: 3 },
  ]

  it("a decider sees everyone and can act", () => {
    const scope = probationScopeFor({
      viewerEmail: "vc@build3.org",
      sponsoredIds: [],
      env: "",
    })
    expect(scope.kind).toBe("all")
    expect(scope.canAct).toBe(true)
    expect(filterByScope(records, scope)).toHaveLength(3)
  })

  it("a sponsor sees only their own people and cannot act", () => {
    const scope = probationScopeFor({
      viewerEmail: "sponsor@build3.org",
      sponsoredIds: ["b"],
      env: "",
    })
    expect(scope.kind).toBe("own")
    expect(scope.canAct).toBe(false)
    expect(filterByScope(records, scope)).toEqual([{ employee_id: "b", n: 2 }])
  })

  it("someone who sponsors nobody gets nothing", () => {
    const scope = probationScopeFor({
      viewerEmail: "nobody@build3.org",
      sponsoredIds: [],
      env: "",
    })
    expect(scope.kind).toBe("none")
    expect(filterByScope(records, scope)).toEqual([])
  })

  it("a decider who also sponsors keeps full scope", () => {
    const scope = probationScopeFor({
      viewerEmail: "at@build3.org",
      sponsoredIds: ["a"],
      env: "",
    })
    expect(scope.kind).toBe("all")
  })
})
