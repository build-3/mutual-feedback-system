import "server-only"

import type { PostgrestError } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { MIN_ANSWER_LENGTHS } from "@/lib/questions"
import {
  canRespondToFeedback,
  isNonParticipantReply,
  isOrgVoice,
} from "@/lib/feedback-permissions"
import { isOrgVoiceReply } from "@/lib/server/require-admin"
import { cycleKeyOf } from "@/lib/cycles"
import {
  sendDirectMessage,
  isNotificationsEnabled,
} from "@/lib/server/google-chat"
import type {
  FeedbackAnswer,
  FeedbackSubmission,
  FeedbackType,
} from "@/lib/types"

export type FeedbackAnswerInput = {
  question_key: string
  question_text: string
  answer_value: string
}

const FEEDBACK_TYPES = new Set<FeedbackType>([
  "intern",
  "build3",
  "full_timer",
  "self",
  "adhoc",
])


function assertUuid(value: string, fieldName: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    throw new Error(`${fieldName} must be a valid UUID`)
  }
}

const FRIENDLY_FIELD_NAMES: Record<string, string> = {
  question_key: "question key",
  question_text: "question text",
  answer_value: "your answer",
}

function normalizeText(value: string, fieldName: string, maxLength: number) {
  const trimmed = value.trim()
  const label = FRIENDLY_FIELD_NAMES[fieldName] ?? fieldName
  if (!trimmed) {
    throw new Error(`${label} cannot be empty`)
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less`)
  }
  return trimmed
}



// Cache employee IDs in memory — employees rarely change
let employeeIdCache: Set<string> | null = null
let employeeCacheExpiry = 0
const EMPLOYEE_CACHE_TTL_MS = 300_000 // 5 minutes
let employeeIdLoadPromise: Promise<Set<string>> | null = null

async function loadEmployeeIds(): Promise<Set<string>> {
  const now = Date.now()
  if (employeeIdCache && now < employeeCacheExpiry) {
    return employeeIdCache
  }
  if (employeeIdLoadPromise) return employeeIdLoadPromise

  employeeIdLoadPromise = (async () => {
    try {
      const supabaseAdmin = getSupabaseAdmin()
      const { data, error } = await supabaseAdmin
        .from("employees")
        .select("id")
      if (error || !data) {
        throw new Error("Failed to load employees")
      }
      employeeIdCache = new Set(data.map((e) => e.id))
      employeeCacheExpiry = now + EMPLOYEE_CACHE_TTL_MS
      return employeeIdCache
    } finally {
      employeeIdLoadPromise = null
    }
  })()
  return employeeIdLoadPromise
}

// Cache employee name/email details in memory
let employeeDetailCache: Map<string, { name: string; email: string | null }> | null = null
let employeeDetailCacheExpiry = 0
const EMPLOYEE_DETAIL_CACHE_TTL_MS = 300_000
let employeeDetailLoadPromise: Promise<Map<string, { name: string; email: string | null }>> | null = null

async function loadEmployeeDetails(): Promise<Map<string, { name: string; email: string | null }>> {
  const now = Date.now()
  if (employeeDetailCache && now < employeeDetailCacheExpiry) {
    return employeeDetailCache
  }
  if (employeeDetailLoadPromise) return employeeDetailLoadPromise

  employeeDetailLoadPromise = (async () => {
    try {
      const supabaseAdmin = getSupabaseAdmin()
      const { data, error } = await supabaseAdmin.from("employees").select("id, name, email")
      if (error || !data) throw new Error("Failed to load employee details")
      const cache = new Map(data.map((e) => [e.id, { name: e.name, email: e.email ?? null }]))
      employeeDetailCache = cache
      employeeDetailCacheExpiry = now + EMPLOYEE_DETAIL_CACHE_TTL_MS
      return cache
    } finally {
      employeeDetailLoadPromise = null
    }
  })()
  return employeeDetailLoadPromise
}

async function ensureEmployeeExists(id: string, fieldName: string) {
  const ids = await loadEmployeeIds()
  if (!ids.has(id)) {
    throw new Error(`${fieldName} was not found`)
  }
}

function mapSupabaseError(error: PostgrestError | Error) {
  return "message" in error
    ? error.message
    : "Something went wrong while talking to Supabase"
}

export async function submitFeedback({
  submittedById,
  feedbackForId,
  feedbackType,
  answers,
  sessionId,
  submitterVerified = false,
}: {
  submittedById: string
  feedbackForId: string | null
  feedbackType: FeedbackType
  answers: FeedbackAnswerInput[]
  sessionId?: string | null
  submitterVerified?: boolean
}) {
  if (!FEEDBACK_TYPES.has(feedbackType)) {
    throw new Error("feedbackType is invalid")
  }

  assertUuid(submittedById, "submittedById")

  const normalizedFeedbackForId =
    feedbackType === "build3" || feedbackType === "self"
      ? null
      : feedbackForId

  if (normalizedFeedbackForId) {
    assertUuid(normalizedFeedbackForId, "feedbackForId")
    if (normalizedFeedbackForId === submittedById) {
      throw new Error("Use the self reflection path for self feedback")
    }
    // Skip submitter check if already verified by requireAuth
    if (submitterVerified) {
      await ensureEmployeeExists(normalizedFeedbackForId, "feedbackForId")
    } else {
      await Promise.all([
        ensureEmployeeExists(submittedById, "submittedById"),
        ensureEmployeeExists(normalizedFeedbackForId, "feedbackForId"),
      ])
    }
  } else if (feedbackType === "build3" || feedbackType === "self") {
    if (!submitterVerified) {
      await ensureEmployeeExists(submittedById, "submittedById")
    }
  } else {
    throw new Error("feedbackForId is required for this feedback type")
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error("answers must contain at least one response")
  }
  if (answers.length > 50) {
    throw new Error("answers exceeds maximum allowed count")
  }

  const normalizedAnswers = answers.map((answer) => {
    const row = {
      question_key: normalizeText(answer.question_key, "question_key", 100),
      question_text: normalizeText(answer.question_text, "question_text", 300),
      answer_value: normalizeText(answer.answer_value, "answer_value", 4000),
    }

    // Mirror the client's minimum-length rule so it can't be skipped by posting
    // straight at the API. MIN_ANSWER_LENGTHS is derived from the question
    // definitions, so this stays in step with the form automatically.
    //
    // The message must start with "your answer" — that is the friendly name for
    // answer_value, and feedback-submit's SAFE_PREFIXES allowlist only echoes
    // recognised prefixes back to the user. Anything else becomes a generic
    // "Failed to submit feedback".
    //
    // Note this catches a *short* answer, not a *missing* one: the client omits
    // the row entirely when the textarea is blank, and the server has no map of
    // which question keys a given feedback type requires.
    const min = MIN_ANSWER_LENGTHS[row.question_key] ?? 0
    if (min > 0 && row.answer_value.length < min) {
      throw new Error(`your answer must be at least ${min} characters`)
    }

    return row
  })

  const supabaseAdmin = getSupabaseAdmin()

  // Single RPC call: insert submission + all answers in one DB round-trip
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
    "submit_feedback_with_answers",
    {
      p_submitted_by_id: submittedById,
      p_feedback_for_id: normalizedFeedbackForId,
      p_feedback_type: feedbackType,
      p_answers: normalizedAnswers,
      p_session_id: sessionId ?? null,
    }
  )

  if (rpcError || !rpcResult) {
    throw new Error(
      rpcError ? mapSupabaseError(rpcError) : "Failed to create submission"
    )
  }

  const submissionId = rpcResult as string

  // Link submission to session assignment if applicable
  if (sessionId && normalizedFeedbackForId) {
    await supabaseAdmin
      .from("session_assignments")
      .update({ submission_id: submissionId })
      .eq("session_id", sessionId)
      .eq("intern_id", normalizedFeedbackForId)
      .eq("reviewer_id", submittedById)
      .is("submission_id", null)
  }

  return { submissionId, feedbackForId: normalizedFeedbackForId }
}

export async function sendNotificationForSubmission(submissionId: string) {
  assertUuid(submissionId, "submissionId")

  // Check DB toggle — skip if notifications are disabled
  const enabled = await isNotificationsEnabled()
  if (!enabled) {
    return { status: "skipped" as const, reason: "notifications disabled" }
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Check if already notified (without locking — we set notified_at AFTER send)
  const { data: submission, error: fetchError } = await supabaseAdmin
    .from("feedback_submissions")
    .select("id, submitted_by_id, feedback_for_id, feedback_type, notified_at")
    .eq("id", submissionId)
    .single()

  if (fetchError || !submission) {
    return { status: "skipped" as const, reason: "submission not found" }
  }

  const typedSubmission = submission as FeedbackSubmission

  if (typedSubmission.notified_at) {
    return { status: "skipped" as const, reason: "already notified" }
  }

  if (!typedSubmission.feedback_for_id) {
    return { status: "skipped" as const, reason: "no recipient" }
  }

  const details = await loadEmployeeDetails()
  const submitterDetail = details.get(typedSubmission.submitted_by_id)
  const recipientDetail = details.get(typedSubmission.feedback_for_id)

  if (!recipientDetail?.email) {
    return { status: "skipped" as const, reason: "recipient has no email" }
  }

  const submitterName = submitterDetail?.name || "Someone"
  const recipientName = recipientDetail.name || "there"
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mutualfeedback.build3.online"
  const message = `Hello ${recipientName} - you got feedback from ${submitterName}.\n\nCheck it out: ${appUrl}/insights?employee=${typedSubmission.feedback_for_id}`

  await sendDirectMessage(recipientDetail.email, message)

  // Mark as notified AFTER successful send
  const { error: updateError } = await supabaseAdmin
    .from("feedback_submissions")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", submissionId)

  if (updateError) {
    console.error("[notify] Failed to mark as notified:", updateError.message)
  }

  return { status: "sent" as const }
}

export async function saveFeedbackResponse({
  answerId,
  responderId,
  responseText,
  isAdmin = false,
  isOrgModerator = false,
  asOrg = false,
}: {
  answerId: string
  responderId: string
  responseText: string
  isAdmin?: boolean
  /** In MOD_EMAILS — grants replies on `build3` submissions only. */
  isOrgModerator?: boolean
  /**
   * The responder asked to publish in the org's voice. A request, not a grant:
   * it is intersected with isOrgVoice() below, so a caller cannot speak for the
   * studio by posting asOrg on a thread they have no standing in.
   */
  asOrg?: boolean
}) {
  assertUuid(answerId, "answerId")
  assertUuid(responderId, "responderId")

  const normalizedResponseText = normalizeText(
    responseText,
    "responseText",
    2000
  )
  const supabaseAdmin = getSupabaseAdmin()

  // Fetch answer and validate responder in parallel
  const [answerResult] = await Promise.all([
    supabaseAdmin
      .from("feedback_answers")
      .select("id, submission_id, question_key, question_text, answer_value")
      .eq("id", answerId)
      .single(),
    ensureEmployeeExists(responderId, "responderId"),
  ])

  if (answerResult.error || !answerResult.data) {
    throw new Error("answer not found")
  }

  const typedAnswer = answerResult.data as FeedbackAnswer

  const { data: submission, error: submissionError } = await supabaseAdmin
    .from("feedback_submissions")
    .select("id, submitted_by_id, feedback_for_id, feedback_type, created_at")
    .eq("id", typedAnswer.submission_id)
    .single()

  if (submissionError || !submission) {
    throw new Error("submission not found")
  }

  const typedSubmission = submission as FeedbackSubmission

  const participantArgs = {
    responderId,
    submittedById: typedSubmission.submitted_by_id,
    feedbackForId: typedSubmission.feedback_for_id,
  }

  if (
    !canRespondToFeedback({
      ...participantArgs,
      feedbackType: typedSubmission.feedback_type,
      isAdmin,
      isOrgModerator,
    })
  ) {
    throw new Error("responder must be one of the feedback participants")
  }

  const nonParticipant = isNonParticipantReply(participantArgs)

  // The request to speak as the org only counts if the responder actually may:
  // a moderator, on build3 feedback, that they did not write themselves.
  const publishAsOrg =
    asOrg === true &&
    isOrgVoice({
      feedbackType: typedSubmission.feedback_type,
      isModerator: isOrgModerator,
      responderId,
      submittedById: typedSubmission.submitted_by_id,
    })

  const row = {
    answer_id: answerId,
    responder_id: responderId,
    response_text: normalizedResponseText,
  }

  let { data: response, error: insertError } = await supabaseAdmin
    .from("feedback_responses")
    .insert({ ...row, as_org: publishAsOrg })
    .select()
    .single()

  // The as_org column ships in supabase/response-voice.sql, which is applied by
  // hand. If code reaches production first, a reply must still save rather than
  // 500 — it just falls back to the derived voice until the column exists.
  if (insertError && /as_org|column/i.test(insertError.message ?? "")) {
    console.warn(
      "[feedback-response] as_org column missing — saving without stored voice. Apply supabase/response-voice.sql."
    )
    const retry = await supabaseAdmin
      .from("feedback_responses")
      .insert(row)
      .select()
      .single()
    response = retry.data
    insertError = retry.error
  }

  if (insertError || !response) {
    throw new Error(
      insertError ? mapSupabaseError(insertError) : "failed to save response"
    )
  }

  return {
    response,
    // Return notification context so caller can fire-and-forget
    notificationContext: {
      responderId,
      submittedById: typedSubmission.submitted_by_id,
      feedbackForId: typedSubmission.feedback_for_id,
      responseText: normalizedResponseText,
      isAdmin: nonParticipant,
      // Needed to decide whether the DM speaks as the org or names the person.
      feedbackType: typedSubmission.feedback_type,
      // The voice actually stored, so the DM matches what the screen will show
      // instead of re-deriving it and possibly disagreeing.
      publishedAsOrg: publishAsOrg,
      // The thread lives in the cycle the SUBMISSION was made in, which is
      // usually earlier than the cycle containing the day the DM is read.
      submissionCreatedAt: typedSubmission.created_at,
    },
  }
}

/**
 * Send notification for a feedback response — fire-and-forget from the route.
 */
export async function sendResponseNotification({
  responderId,
  submittedById,
  feedbackForId,
  responseText,
  isAdmin = false,
  feedbackType,
  submissionCreatedAt,
  publishedAsOrg,
}: {
  responderId: string
  submittedById: string
  feedbackForId: string | null
  responseText: string
  isAdmin?: boolean
  feedbackType?: string | null
  submissionCreatedAt?: string | null
  /** The voice actually stored on the reply. Undefined = derive it. */
  publishedAsOrg?: boolean
}) {
  // Check DB toggle
  const enabled = await isNotificationsEnabled()
  if (!enabled) return

  const details = await loadEmployeeDetails()
  const responderDetail = details.get(responderId)
  const responderName = responderDetail?.name || "Someone"

  const preview =
    responseText.length > 100
      ? responseText.slice(0, 100) + "..."
      : responseText

  // When an admin (non-participant) responds, notify both participants
  const notifyIds: string[] = isAdmin
    ? [submittedById, feedbackForId].filter((id): id is string => !!id)
    : [responderId === feedbackForId ? submittedById : feedbackForId].filter(
        (id): id is string => !!id
      )

  // A moderator replying to org-level feedback speaks for the studio, not as
  // themselves — same rule the timeline uses to render "build3 foundation", so
  // the DM can no longer name someone the screen deliberately anonymises.
  // Prefer the stored decision so the DM cannot disagree with the screen. Falls
  // back to deriving it only for callers that predate the stored column.
  const asOrg =
    publishedAsOrg ??
    isOrgVoiceReply({
      feedbackType,
      responderEmail: responderDetail?.email,
      responderId,
      submittedById,
    })
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://mutualfeedback.build3.online"

  await Promise.all(
    notifyIds.map(async (notifyId) => {
      const recipientDetail = details.get(notifyId)
      const recipientEmail = recipientDetail?.email
      if (!recipientEmail) return

      // build3 submissions carry feedback_for_id = NULL (the target is the
      // studio), so the thread lives on the author's own profile. Point there
      // explicitly rather than leaning on a `?? notifyId` fallback.
      // Pin the cycle to the one holding the submission. /insights lands on the
      // cycle containing *today*, and a thread is almost always older than the
      // day its reply is read — without this the link opened on "nothing in this
      // cycle yet" for a thread sitting one cycle back.
      const profileId = asOrg ? submittedById : feedbackForId ?? notifyId
      const cycleParam = submissionCreatedAt
        ? `&cycle=${cycleKeyOf(submissionCreatedAt)}`
        : ""
      const threadUrl = `${appUrl}/insights?employee=${profileId}${cycleParam}`

      const opening = asOrg
        ? "the build3 mod has responded to your feedback about build3:"
        : `${responderName} replied to feedback:`

      await sendDirectMessage(
        recipientEmail,
        `${opening}\n\n"${preview}"\n\nSee the full thread: ${threadUrl}`
      )
    })
  )
}
