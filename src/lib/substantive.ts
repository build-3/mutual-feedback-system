/**
 * "Did this answer actually say anything?" — one definition, two callers.
 *
 * Lived privately in mod-queue.ts until the leaderboard needed the same rule.
 * Copying the set would have left two definitions of a real answer free to
 * drift apart, which is the failure the cycle-window consolidation was done to
 * prevent, so it moved here instead.
 */

/** Answers that mean "nothing to report". The list the data audit used. */
export const NON_SUBSTANTIVE = new Set([
  "", "na", "n/a", "-", ".", "none", "nothing", "no", "nope", "yes", "all good",
])

export function isSubstantiveAnswer(value: string | null): boolean {
  return !NON_SUBSTANTIVE.has((value ?? "").trim().toLowerCase())
}
