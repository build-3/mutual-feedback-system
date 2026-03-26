import { NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { consumeRateLimit, getRequestIp } from "@/lib/server/rate-limit"
import { hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { submitFeedback, sendNotificationForSubmission } from "@/lib/server/feedback"
import type { FeedbackType } from "@/lib/types"

export async function POST(request: Request) {
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    )
  }

  const ip = getRequestIp(request)
  const rateLimit = consumeRateLimit({
    bucket: "feedback-submit",
    key: ip,
    limit: 10,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait a minute and try again." },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const result = await submitFeedback({
      submittedById: body.submittedById,
      feedbackForId: body.feedbackForId ?? null,
      feedbackType: body.feedbackType as FeedbackType,
      answers: body.answers,
    })

    // Fire notification in background — Vercel keeps the function alive via waitUntil
    if (result.feedbackForId) {
      waitUntil(
        sendNotificationForSubmission(result.submissionId).catch((err) =>
          console.error("[notify] Background notification failed:", err)
        )
      )
    }

    return NextResponse.json({ status: "saved", submissionId: result.submissionId })
  } catch (error) {
    console.error("Feedback submit error:", error)
    const rawMessage =
      error instanceof Error ? error.message : ""

    // Only expose validation-level messages to public callers;
    // hide anything that might contain DB internals
    const SAFE_PREFIXES = [
      "submittedById",
      "feedbackForId",
      "feedbackType",
      "question_key",
      "question_text",
      "answer_value",
      "your answer",
      "answers",
      "Use the self",
    ]
    const isSafe = SAFE_PREFIXES.some((p) => rawMessage.startsWith(p))
    const message = isSafe ? rawMessage : "Failed to submit feedback"

    return NextResponse.json({ error: message }, { status: 400 })
  }
}
