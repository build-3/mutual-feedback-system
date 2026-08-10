import type { FeedbackType } from "@/lib/types"

/**
 * Who is allowed to reply to a feedback answer.
 *
 * Pure and deliberately outside the server-only modules so the matrix can be
 * unit-tested without a database — this is a privilege boundary, and the failure
 * mode of getting it wrong is silent over-permission rather than a crash.
 *
 * Three ways in:
 *  - a participant (the author, or the person the feedback is about)
 *  - an admin, on anything
 *  - an org moderator (MOD_EMAILS, the /mod console), on `build3` submissions ONLY
 *
 * That last case is scoped on purpose. The org-feedback moderator is not
 * necessarily an admin — br@ is an intern — so the right granted is exactly
 * "reply to feedback addressed to the studio" and nothing else. Widening it to
 * peer or self feedback would let a moderator into private one-to-one threads
 * they were never party to.
 */
export function canRespondToFeedback({
  responderId,
  submittedById,
  feedbackForId,
  feedbackType,
  isAdmin = false,
  isOrgModerator = false,
}: {
  responderId: string
  submittedById: string
  feedbackForId: string | null
  feedbackType: FeedbackType | string
  isAdmin?: boolean
  isOrgModerator?: boolean
}): boolean {
  if (responderId === submittedById) return true
  if (feedbackForId != null && responderId === feedbackForId) return true
  if (isAdmin) return true
  if (isOrgModerator && feedbackType === "build3") return true
  return false
}

/**
 * Whether a reply is published in the org's voice instead of the responder's own.
 *
 * Pure and testable on purpose: the previous version lived in a server-only
 * module, could not be unit-tested, and shipped a bug — a moderator who was also
 * the author had their own comment on their own thread relabelled as an official
 * studio statement. `isModerator` is resolved from MOD_EMAILS by the server-side
 * wrapper, so the allowlist itself never leaves the server.
 */
export function isOrgVoice({
  feedbackType,
  isModerator,
  responderId,
  submittedById,
}: {
  feedbackType: string | null | undefined
  isModerator: boolean
  /** Omit both ids only when the caller genuinely cannot know them. */
  responderId?: string | null
  submittedById?: string | null
}): boolean {
  if (feedbackType !== "build3") return false
  if (!isModerator) return false
  // The author speaks for themselves in their own thread, moderator or not.
  if (responderId != null && submittedById != null && responderId === submittedById) {
    return false
  }
  return true
}

/** Whether this responder is a non-participant acting in an official capacity. */
export function isNonParticipantReply({
  responderId,
  submittedById,
  feedbackForId,
}: {
  responderId: string
  submittedById: string
  feedbackForId: string | null
}): boolean {
  if (responderId === submittedById) return false
  if (feedbackForId != null && responderId === feedbackForId) return false
  return true
}
