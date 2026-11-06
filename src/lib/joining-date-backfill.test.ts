import { describe, expect, it } from "vitest"

import { parseBackfillCsv, planBackfill, type BackfillEmployee, type BackfillProbation } from "./joining-date-backfill"

const now = new Date("2026-11-06T10:00:00Z")

const employees: BackfillEmployee[] = [
  { id: "e1", name: "Nikita Tibrewal", email: "nikita@build3.org" },
  { id: "e2", name: "Shashwath R", email: "shashwath@build3.org" },
  { id: "e3", name: "Twin One", email: "twin@build3.org" },
  { id: "e4", name: "Twin Two", email: "twin@build3.org" },
  { id: "e5", name: "No Probation", email: "nop@build3.org" },
]

const probations: BackfillProbation[] = [
  { id: "p1", employeeId: "e1", startDate: "2026-09-16", endDate: "2026-12-16", durationMonths: 3, status: "active" },
  { id: "p2", employeeId: "e2", startDate: "2026-08-01", endDate: "2027-02-01", durationMonths: 6, status: "extended" },
  { id: "p3", employeeId: "e3", startDate: "2026-08-01", endDate: "2026-11-01", durationMonths: 3, status: "active" },
]

const plan = (inputs: { email: string; name: string; joinedOn: string }[]) =>
  planBackfill({ inputs, employees, probations, now })

describe("planBackfill", () => {
  it("changes the start and recomputes the end from the stored period", () => {
    const [item] = plan([{ email: "nikita@build3.org", name: "Nikita Tibrewal", joinedOn: "2026-02-10" }])
    expect(item).toMatchObject({
      kind: "change",
      probationId: "p1",
      oldStart: "2026-09-16",
      newStart: "2026-02-10",
      newEnd: "2026-05-10",
    })
  })

  it("uses six months for an extended probation", () => {
    const [item] = plan([{ email: "shashwath@build3.org", name: "Shashwath R", joinedOn: "2026-03-01" }])
    expect(item).toMatchObject({ kind: "change", newEnd: "2026-09-01" })
  })

  it("matches case and spacing tolerantly", () => {
    const [item] = plan([{ email: " NIKITA@build3.org", name: "  nikita   TIBREWAL ", joinedOn: "2026-02-10" }])
    expect(item.kind).toBe("change")
  })

  it("does not apply when the email matches but the name does not", () => {
    const [item] = plan([{ email: "nikita@build3.org", name: "Somebody Else", joinedOn: "2026-02-10" }])
    expect(item).toMatchObject({ kind: "problem" })
    expect((item as { reason: string }).reason).toContain("Nikita Tibrewal")
  })

  it("does not match by name alone", () => {
    const [item] = plan([{ email: "wrong@build3.org", name: "Nikita Tibrewal", joinedOn: "2026-02-10" }])
    expect(item).toMatchObject({ kind: "problem", reason: "no one on the roster has this email" })
  })

  it("refuses an email shared by two roster rows", () => {
    const [item] = plan([{ email: "twin@build3.org", name: "Twin One", joinedOn: "2026-02-10" }])
    expect(item).toMatchObject({ kind: "problem" })
  })

  it("reports a person with no open probation", () => {
    const [item] = plan([{ email: "nop@build3.org", name: "No Probation", joinedOn: "2026-02-10" }])
    expect(item).toMatchObject({ kind: "problem" })
  })

  it("refuses a bad date and says what it got", () => {
    const [item] = plan([{ email: "nikita@build3.org", name: "Nikita Tibrewal", joinedOn: "10/02/2026" }])
    expect(item).toMatchObject({ kind: "problem" })
    expect((item as { reason: string }).reason).toContain("10/02/2026")
  })

  it("flags a duplicate email in the file instead of applying twice", () => {
    const items = plan([
      { email: "nikita@build3.org", name: "Nikita Tibrewal", joinedOn: "2026-02-10" },
      { email: "nikita@build3.org", name: "Nikita Tibrewal", joinedOn: "2026-03-10" },
    ])
    expect(items[0].kind).toBe("change")
    expect(items[1]).toMatchObject({ kind: "problem" })
  })

  it("reports no-ops as unchanged", () => {
    const [item] = plan([{ email: "nikita@build3.org", name: "Nikita Tibrewal", joinedOn: "2026-09-16" }])
    expect(item.kind).toBe("unchanged")
  })
})

describe("parseBackfillCsv", () => {
  it("reads a header in any column order", () => {
    const { rows, error } = parseBackfillCsv("name,joined_on,email\nNikita Tibrewal,2026-02-10,nikita@build3.org\n")
    expect(error).toBeUndefined()
    expect(rows).toEqual([{ email: "nikita@build3.org", name: "Nikita Tibrewal", joinedOn: "2026-02-10" }])
  })
  it("tolerates a BOM, CRLF and blank lines", () => {
    const { rows } = parseBackfillCsv("\uFEFFemail,name,joining_date\r\n\r\na@b.org,A B,2026-01-01\r\n")
    expect(rows).toHaveLength(1)
  })
  it("errors on a missing column rather than guessing", () => {
    expect(parseBackfillCsv("email,name\na@b.org,A").error).toBeDefined()
    expect(parseBackfillCsv("").error).toBeDefined()
  })
})
