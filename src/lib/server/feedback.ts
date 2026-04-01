import "server-only"

import type { PostgrestError } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
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
  submitterVerified = false,
}: {
  submittedById: string
  feedbackForId: string | null
  feedbackType: FeedbackType
  answers: FeedbackAnswerInput[]
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

  const normalizedAnswers = answers.map((answer) => ({
    question_key: normalizeText(answer.question_key, "question_key", 100),
    question_text: normalizeText(answer.question_text, "question_text", 300),
    answer_value: normalizeText(answer.answer_value, "answer_value", 4000),
  }))

  const supabaseAdmin = getSupabaseAdmin()

  // Single RPC call: insert submission + all answers in one DB round-trip
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
    "submit_feedback_with_answers",
    {
      p_submitted_by_id: submittedById,
      p_feedback_for_id: normalizedFeedbackForId,
      p_feedback_type: feedbackType,
      p_answers: normalizedAnswers,
    }
  )

  if (rpcError || !rpcResult) {
    throw new Error(
      rpcError ? mapSupabaseError(rpcError) : "Failed to create submission"
    )
  }

  const submissionId = rpcResult as string

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
  const message = `Hello ${recipientName} - you got feedback from ${submitterName}.\n\nCheck it out: https://build3.online/insights?employee=${typedSubmission.feedback_for_id}`

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
}: {
  answerId: string
  responderId: string
  responseText: string
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
    .select("id, submitted_by_id, feedback_for_id, feedback_type")
    .eq("id", typedAnswer.submission_id)
    .single()

  if (submissionError || !submission) {
    throw new Error("submission not found")
  }

  const typedSubmission = submission as FeedbackSubmission

  const isAllowedResponder =
    responderId === typedSubmission.submitted_by_id ||
    responderId === typedSubmission.feedback_for_id

  if (!isAllowedResponder) {
    throw new Error("responder must be one of the feedback participants")
  }

  const { data: response, error: insertError } = await supabaseAdmin
    .from("feedback_responses")
    .insert({
      answer_id: answerId,
      responder_id: responderId,
      response_text: normalizedResponseText,
    })
    .select()
    .single()

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
    },
  }
}

/**
 * Send notification for a feedback response — meant to be called via waitUntil().
 */
export async function sendResponseNotification({
  responderId,
  submittedById,
  feedbackForId,
  responseText,
}: {
  responderId: string
  submittedById: string
  feedbackForId: string | null
  responseText: string
}) {
  // Check DB toggle
  const enabled = await isNotificationsEnabled()
  if (!enabled) return

  const notifyId =
    responderId === feedbackForId ? submittedById : feedbackForId

  if (!notifyId) return

  const details = await loadEmployeeDetails()
  const responderDetail = details.get(responderId)
  const recipientDetail = details.get(notifyId)

  const responderName = responderDetail?.name || "Someone"
  const recipientEmail = recipientDetail?.email

  if (!recipientEmail) return

  const preview =
    responseText.length > 100
      ? responseText.slice(0, 100) + "..."
      : responseText

  await sendDirectMessage(
    recipientEmail,
    `${responderName} replied to feedback:\n\n"${preview}"\n\nSee the full thread: https://build3.online/insights?employee=${notifyId}`
  )
}
