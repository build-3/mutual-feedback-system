import { describe, expect, it } from "vitest"

import { validateAssignment, type AssignEmployee } from "./probation-assignment"

const mk = (id: string, role: string, is_active = true): AssignEmployee => ({
  id,
  name: id,
  role,
  is_active,
})

const people = new Map<string, AssignEmployee>(
  [
    mk("cand", "intern"),
    mk("ft", "full_timer"),
    mk("adm", "admin"),
    mk("other-intern", "intern"),
    mk("gone", "full_timer", false),
  ].map((p) => [p.id, p])
)

const check = (
  request: Parameters<typeof validateAssignment>[0]["request"],
  hasOpenProbation = true
) => validateAssignment({ request, people, hasOpenProbation })

describe("validateAssignment", () => {
  it("sets a full-timer as sponsor", () => {
    expect(check({ employeeId: "cand", sponsorId: "ft" })).toEqual({
      ok: true,
      update: { sponsor_id: "ft" },
    })
  })

  it("lets an admin sponsor", () => {
    expect(check({ employeeId: "cand", sponsorId: "adm" }).ok).toBe(true)
  })

  it("lets any active teammate sponsor, including someone on probation", () => {
    expect(check({ employeeId: "cand", sponsorId: "other-intern" })).toEqual({
      ok: true,
      update: { sponsor_id: "other-intern" },
    })
  })

  it("refuses self as sponsor or buddy", () => {
    expect(check({ employeeId: "cand", sponsorId: "cand" }).ok).toBe(false)
    expect(check({ employeeId: "cand", buddyId: "cand" }).ok).toBe(false)
  })

  it("refuses an inactive or unknown sponsor", () => {
    expect(check({ employeeId: "cand", sponsorId: "gone" }).ok).toBe(false)
    expect(check({ employeeId: "cand", sponsorId: "nobody" }).ok).toBe(false)
  })

  it("lets a buddy be anyone active, including someone on probation", () => {
    expect(check({ employeeId: "cand", buddyId: "other-intern" })).toEqual({
      ok: true,
      update: { buddy_id: "other-intern" },
    })
  })

  it("clears with null and leaves alone with undefined", () => {
    expect(check({ employeeId: "cand", sponsorId: null })).toEqual({
      ok: true,
      update: { sponsor_id: null },
    })
    expect(check({ employeeId: "cand", buddyId: "ft" })).toEqual({
      ok: true,
      update: { buddy_id: "ft" },
    })
  })

  it("sets both at once", () => {
    expect(check({ employeeId: "cand", sponsorId: "ft", buddyId: "adm" })).toEqual({
      ok: true,
      update: { sponsor_id: "ft", buddy_id: "adm" },
    })
  })

  it("refuses when there is nothing to change", () => {
    expect(check({ employeeId: "cand" }).ok).toBe(false)
  })

  it("refuses someone with no open probation", () => {
    expect(check({ employeeId: "cand", sponsorId: "ft" }, false).ok).toBe(false)
  })

  it("refuses an unknown or inactive candidate", () => {
    expect(check({ employeeId: "nobody", sponsorId: "ft" }).ok).toBe(false)
    expect(check({ employeeId: "gone", sponsorId: "ft" }).ok).toBe(false)
  })
})
