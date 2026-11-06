/**
 * Who may see and act on probation records.
 *
 * This replaces three hard-coded copies of `["vc@build3.org", "at@build3.org"]`
 * (ProbationSection, promote route, extend route). One rule, one place.
 *
 * Two levels:
 *  - deciders: see everyone, can promote / extend / correct a joining date.
 *  - sponsors: see only the people whose `employees.sponsor_id` is them, and
 *    read only. The probation conversation belongs to the sponsor, but whether
 *    a sponsor may also press promote / extend is an open question, so the
 *    default is the safe one.
 *
 * The decider list lives in code as a floor and is extended by the
 * PROBATION_DECIDER_EMAILS env var (comma separated), so adding a person is a
 * config change rather than a deploy of new source.
 */

/** Always deciders. ckj is Charlez, added after the 30 Oct call. */
export const BASE_PROBATION_DECIDERS = [
  "vc@build3.org",
  "at@build3.org",
  "ckj@build3.org",
] as const

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

export function probationDeciders(env: string | undefined): string[] {
  const extra = (env ?? "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean)
  return Array.from(new Set([...BASE_PROBATION_DECIDERS, ...extra]))
}

export function isProbationDecider(
  email: string | null | undefined,
  env: string | undefined = process.env.PROBATION_DECIDER_EMAILS
): boolean {
  const e = normalizeEmail(email)
  return e !== "" && probationDeciders(env).includes(e)
}

export type ProbationScope =
  | { kind: "all"; canAct: true }
  | { kind: "own"; canAct: false; employeeIds: Set<string> }
  | { kind: "none"; canAct: false }

/**
 * What a viewer may see. `sponsoredIds` are the employee ids whose sponsor_id is
 * the viewer; an empty set means the viewer sponsors nobody and gets nothing.
 */
export function probationScopeFor({
  viewerEmail,
  sponsoredIds,
  env,
}: {
  viewerEmail: string | null | undefined
  sponsoredIds: Iterable<string>
  env?: string | undefined
}): ProbationScope {
  if (isProbationDecider(viewerEmail, env ?? process.env.PROBATION_DECIDER_EMAILS)) {
    return { kind: "all", canAct: true }
  }
  const ids = new Set(sponsoredIds)
  if (ids.size === 0) return { kind: "none", canAct: false }
  return { kind: "own", canAct: false, employeeIds: ids }
}

/** Keep only the records the scope allows. */
export function filterByScope<T extends { employee_id: string }>(
  records: T[],
  scope: ProbationScope
): T[] {
  if (scope.kind === "all") return records
  if (scope.kind === "none") return []
  return records.filter((r) => scope.employeeIds.has(r.employee_id))
}
