import "server-only"

import { google } from "googleapis"
import type { PostgrestError } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
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

const GOOGLE_CHAT_SCOPES = [
  "https://www.googleapis.com/auth/chat.messages.create",
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.messages",
]

let googleChatClientPromise: ReturnType<typeof getGoogleChatClientInner> | null = null

const NOTIFICATION_TIMEOUT_MS = 10_000 // 10 second timeout

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

/** Diagnose Google Chat config without sending a message. */
export async function diagnoseGoogleChat() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_PRIVATE_KEY ?? ""
  const cleanedKey = rawKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n")
  const senderEmail = process.env.GOOGLE_CHAT_SENDER_EMAIL

  const config = {
    hasServiceAccountEmail: !!serviceAccountEmail,
    serviceAccountEmail: serviceAccountEmail ? `${serviceAccountEmail.slice(0, 12)}...` : null,
    hasPrivateKey: !!cleanedKey,
    privateKeyLength: cleanedKey.length,
    rawKeyStartsWith: rawKey.slice(0, 27),
    cleanedKeyStartsWith: cleanedKey.slice(0, 27),
    hadWrappingQuotes: rawKey.startsWith('"') || rawKey.endsWith('"'),
    hasSenderEmail: !!senderEmail,
    senderEmail: senderEmail ?? null,
  }

  if (!serviceAccountEmail || !cleanedKey || !senderEmail) {
    return { status: "misconfigured" as const, config, error: "Missing env vars" }
  }

  try {
    const chat = await getGoogleChatClient()
    if (!chat) {
      return { status: "no_client" as const, config, error: "Client returned null" }
    }
    return { status: "ok" as const, config }
  } catch (err) {
    return {
      status: "auth_error" as const,
      config,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function getGoogleChatClientInner() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_PRIVATE_KEY ?? ""
  // Strip wrapping quotes (Vercel env vars sometimes get double-quoted)
  const privateKey = rawKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n") || undefined
  const senderEmail = process.env.GOOGLE_CHAT_SENDER_EMAIL

  if (!serviceAccountEmail || !privateKey || !senderEmail) {
    return null
  }

  const auth = new google.auth.JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: GOOGLE_CHAT_SCOPES,
    subject: senderEmail,
  })

  return google.chat({ version: "v1", auth })
}

async function getGoogleChatClient() {
  if (!googleChatClientPromise) {
    googleChatClientPromise = getGoogleChatClientInner().catch((err) => {
      googleChatClientPromise = null // Clear cache on failure
      throw err
    }).then((client) => {
      if (!client) googleChatClientPromise = null // Clear cache if null
      return client
    })
  }
  return googleChatClientPromise
}

async function sendDirectMessage(recipientEmail: string, messageText: string) {
  console.log(`[notify] Getting Google Chat client`)
  const chat = await getGoogleChatClient()
  if (!chat) {
    console.log(`[notify] Google Chat client not configured (missing credentials)`)
    return false
  }

  const timeout = <T>(promise: Promise<T>, label: string): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${NOTIFICATION_TIMEOUT_MS}ms`)), NOTIFICATION_TIMEOUT_MS)
      ),
    ])

  console.log(`[notify] Creating DM space for ${recipientEmail}`)
  const spaceResponse = await timeout(
    chat.spaces.setup({
      requestBody: {
        space: { spaceType: "DIRECT_MESSAGE" },
        memberships: [
          { member: { name: `users/${recipientEmail}`, type: "HUMAN" } },
        ],
      },
    }),
    "spaces.setup"
  )

  const spaceName = spaceResponse.data.name
  if (!spaceName) {
    throw new Error(`Could not create DM space for ${recipientEmail}`)
  }

  console.log(`[notify] Sending message to space ${spaceName}`)
  await timeout(
    chat.spaces.messages.create({
      parent: spaceName,
      requestBody: { text: messageText },
    }),
    "spaces.messages.create"
  )

  console.log(`[notify] Message sent successfully to ${recipientEmail}`)
  return true
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
}: {
  submittedById: string
  feedbackForId: string | null
  feedbackType: FeedbackType
  answers: FeedbackAnswerInput[]
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
    // Validate both employees in parallel
    await Promise.all([
      ensureEmployeeExists(submittedById, "submittedById"),
      ensureEmployeeExists(normalizedFeedbackForId, "feedbackForId"),
    ])
  } else if (feedbackType === "build3" || feedbackType === "self") {
    await ensureEmployeeExists(submittedById, "submittedById")
  } else {
    throw new Error("feedbackForId is required for this feedback type")
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error("answers must contain at least one response")
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

  // Await notification so Vercel doesn't kill the function before it completes.
  // Wrapped in try/catch so a notification failure never breaks the submission.
  if (normalizedFeedbackForId) {
    try {
      await sendNotificationForSubmission(submissionId)
    } catch (notifyError) {
      console.error("[notify] Notification failed (submission still saved):", notifyError)
    }
  }

  return { submissionId }
}

export async function sendNotificationForSubmission(submissionId: string) {
  assertUuid(submissionId, "submissionId")
  console.log(`[notify] Starting notification for submission ${submissionId}`)

  const supabaseAdmin = getSupabaseAdmin()

  // Check if already notified (without locking — we set notified_at AFTER send)
  const { data: submission, error: fetchError } = await supabaseAdmin
    .from("feedback_submissions")
    .select("*")
    .eq("id", submissionId)
    .single()

  if (fetchError || !submission) {
    console.log(`[notify] Submission ${submissionId} not found`)
    return { status: "skipped" as const, reason: "submission not found" }
  }

  const typedSubmission = submission as FeedbackSubmission

  if (typedSubmission.notified_at) {
    console.log(`[notify] Submission ${submissionId} already notified at ${typedSubmission.notified_at}`)
    return { status: "skipped" as const, reason: "already notified" }
  }

  if (!typedSubmission.feedback_for_id) {
    console.log(`[notify] Submission ${submissionId} has no recipient (self/build3 feedback)`)
    return { status: "skipped" as const, reason: "no recipient" }
  }

  const details = await loadEmployeeDetails()
  const submitterDetail = details.get(typedSubmission.submitted_by_id)
  const recipientDetail = details.get(typedSubmission.feedback_for_id)

  if (!recipientDetail?.email) {
    console.log(`[notify] Recipient ${typedSubmission.feedback_for_id} has no email`)
    return { status: "skipped" as const, reason: "recipient has no email" }
  }

  const submitterName = submitterDetail?.name || "Someone"
  const recipientName = recipientDetail.name || "there"
  const message = `Hello ${recipientName} - you got feedback from ${submitterName}.\n\nCheck it out: https://build3.online/insights?employee=${typedSubmission.feedback_for_id}`

  console.log(`[notify] Sending to ${recipientDetail.email}`)
  await sendDirectMessage(recipientDetail.email, message)

  // Mark as notified AFTER successful send
  const { error: updateError } = await supabaseAdmin
    .from("feedback_submissions")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", submissionId)

  if (updateError) {
    console.error(`[notify] Failed to mark submission ${submissionId} as notified:`, updateError)
  }

  console.log(`[notify] Done — notified ${recipientDetail.email} for submission ${submissionId}`)
  return { status: "sent" as const, to: recipientDetail.email }
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

  const { data: answer, error: answerError } = await supabaseAdmin
    .from("feedback_answers")
    .select("*")
    .eq("id", answerId)
    .single()

  if (answerError || !answer) {
    throw new Error("answer not found")
  }

  const typedAnswer = answer as FeedbackAnswer

  const { data: submission, error: submissionError } = await supabaseAdmin
    .from("feedback_submissions")
    .select("*")
    .eq("id", typedAnswer.submission_id)
    .single()

  if (submissionError || !submission) {
    throw new Error("submission not found")
  }

  const typedSubmission = submission as FeedbackSubmission
  await ensureEmployeeExists(responderId, "responderId")

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

  const notifyId =
    responderId === typedSubmission.feedback_for_id
      ? typedSubmission.submitted_by_id
      : typedSubmission.feedback_for_id

  if (notifyId) {
    const details = await loadEmployeeDetails()
    const responderDetail = details.get(responderId)
    const recipientDetail = details.get(notifyId)

    const responderName = responderDetail?.name || "Someone"
    const recipientEmail = recipientDetail?.email

    if (recipientEmail) {
      const preview =
        normalizedResponseText.length > 100
          ? normalizedResponseText.slice(0, 100) + "..."
          : normalizedResponseText

      try {
        console.log(`[notify] Sending response notification to ${recipientEmail}`)
        await sendDirectMessage(
          recipientEmail,
          `${responderName} replied to feedback:\n\n"${preview}"\n\nSee the full thread: https://build3.online/insights?employee=${notifyId}`
        )
        console.log(`[notify] Response notification sent to ${recipientEmail}`)
      } catch (error) {
        console.error("[notify] Response notification failed:", error)
      }
    }
  }

  return response
}
