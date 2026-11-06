/**
 * Planning for the one-time joining-date backfill.
 *
 * Probation clocks currently start on the day someone first opened the
 * platform. Bikram holds the real joining dates; this turns his list into a
 * plan. It never guesses: a row is applied only when the email AND the full name
 * both match exactly one active person, and everything else is reported back.
 * Pure, so the rules are tested without a database.
 */

import { addMonthsIso, checkJoiningDate } from "./probation-dates"

export type BackfillInput = { email: string; name: string; joinedOn: string }

export type BackfillEmployee = { id: string; name: string; email: string | null }

export type BackfillProbation = {
  id: string
  employeeId: string
  startDate: string
  endDate: string
  durationMonths: number
  status: string
}

export type BackfillItem =
  | {
      kind: "change"
      probationId: string
      employeeId: string
      name: string
      email: string
      oldStart: string
      newStart: string
      oldEnd: string
      newEnd: string
    }
  | { kind: "unchanged"; name: string; email: string; date: string }
  | { kind: "problem"; name: string; email: string; reason: string }

export function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
}

export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase()
}

export function planBackfill({
  inputs,
  employees,
  probations,
  now = new Date(),
}: {
  inputs: BackfillInput[]
  employees: BackfillEmployee[]
  probations: BackfillProbation[]
  now?: Date
}): BackfillItem[] {
  const byEmail = new Map<string, BackfillEmployee[]>()
  for (const e of employees) {
    if (!e.email) continue
    const key = normalizeEmailKey(e.email)
    byEmail.set(key, [...(byEmail.get(key) ?? []), e])
  }

  const seen = new Set<string>()
  const items: BackfillItem[] = []

  for (const input of inputs) {
    const email = normalizeEmailKey(input.email)
    const name = input.name.trim()
    const problem = (reason: string): BackfillItem => ({ kind: "problem", name, email, reason })

    if (!email || !name) {
      items.push(problem("row is missing an email or a name"))
      continue
    }
    if (seen.has(email)) {
      items.push(problem("email appears more than once in the file"))
      continue
    }
    seen.add(email)

    const checked = checkJoiningDate(input.joinedOn, now)
    if (!checked.ok) {
      items.push(problem(`${checked.error} (got "${input.joinedOn}")`))
      continue
    }

    const matches = byEmail.get(email) ?? []
    if (matches.length === 0) {
      items.push(problem("no one on the roster has this email"))
      continue
    }
    if (matches.length > 1) {
      items.push(problem("more than one roster row has this email"))
      continue
    }
    const employee = matches[0]
    if (normalizeName(employee.name) !== normalizeName(name)) {
      items.push(
        problem(`email matches "${employee.name}" but the file says "${name}"; not applied, check by hand`)
      )
      continue
    }

    const open = probations.filter(
      (p) => p.employeeId === employee.id && (p.status === "active" || p.status === "extended")
    )
    if (open.length === 0) {
      items.push(problem("matched, but they have no open probation to correct"))
      continue
    }
    const probation = open[0]

    const newStart = checked.date
    const newEnd = addMonthsIso(newStart, probation.durationMonths)
    if (probation.startDate === newStart && probation.endDate === newEnd) {
      items.push({ kind: "unchanged", name: employee.name, email, date: newStart })
      continue
    }
    items.push({
      kind: "change",
      probationId: probation.id,
      employeeId: employee.id,
      name: employee.name,
      email,
      oldStart: probation.startDate,
      newStart,
      oldEnd: probation.endDate,
      newEnd,
    })
  }

  return items
}

/**
 * Parse a simple CSV with a header row containing email, name and one of
 * joined_on / joining_date / joined. No quoted commas: it is a hand-made list.
 */
export function parseBackfillCsv(text: string): { rows: BackfillInput[]; error?: string } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return { rows: [], error: "the file is empty" }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const iEmail = header.indexOf("email")
  const iName = header.indexOf("name")
  const iDate = header.findIndex((h) => ["joined_on", "joining_date", "joined"].includes(h))
  if (iEmail < 0 || iName < 0 || iDate < 0) {
    return {
      rows: [],
      error: "header must contain email, name and joined_on (or joining_date / joined)",
    }
  }

  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim())
    return { email: cells[iEmail] ?? "", name: cells[iName] ?? "", joinedOn: cells[iDate] ?? "" }
  })
  return { rows }
}
