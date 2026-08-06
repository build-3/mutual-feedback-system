/**
 * Employee search matching — one implementation, used everywhere.
 *
 * People at build3 search by the local part of the email as often as by name:
 * Arjun is at@build3.org, Varun Chawla is vc@build3.org, so they type "at" or
 * "vc" and expect the right person. Before this, all three search sites matched
 * on name only (and the search API didn't even select the email column), so
 * those queries returned nothing.
 *
 * Lives in one module because the bug was three independent copies of
 * `name.toLowerCase().includes(q)` drifting apart.
 */

export type MatchableEmployee = {
  name: string
  email?: string | null
}

/**
 * Relevance score. 0 means no match.
 *
 *   4  the query IS the local part, or the whole email
 *   3  the query is a prefix of the local part      ("at" → at@build3.org)
 *   2  a word in the name starts with the query     ("var" → Varun Chawla)
 *   1  the query appears anywhere in the name       ("run" → Varun)
 *
 * Deliberately NOT a substring match on the whole email address: that would make
 * "build3" return the entire roster and "org" return everyone. Prefix-on-local-part
 * covers the real case with no domain false positives.
 *
 * Ranking is load-bearing rather than polish — without it "at" buries
 * at@build3.org among everyone named Nat, Kate, or Matt.
 */
export function employeeMatchScore(employee: MatchableEmployee, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1

  const name = employee.name.toLowerCase()
  const email = (employee.email ?? "").toLowerCase()
  const localPart = email.split("@")[0] ?? ""

  if (localPart && localPart === q) return 4
  if (email && email === q) return 4
  if (localPart && localPart.startsWith(q)) return 3
  if (name.split(/\s+/).some((word) => word.startsWith(q))) return 2
  if (name.includes(q)) return 1
  return 0
}

/** True when the match came from the email rather than the name — the caller can
 *  then show the address, which explains why the row is in the results. */
export function matchedOnEmail(employee: MatchableEmployee, query: string): boolean {
  return employeeMatchScore(employee, query) >= 3
}

/**
 * Filter to matches and sort by relevance, falling back to name order within a
 * score so the list still reads alphabetically the way it always has.
 */
export function filterAndRankEmployees<T extends MatchableEmployee>(
  list: T[],
  query: string
): T[] {
  const q = query.trim()
  if (!q) return list

  return list
    .map((employee) => ({ employee, score: employeeMatchScore(employee, q) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.employee.name.localeCompare(b.employee.name)
    )
    .map((entry) => entry.employee)
}
