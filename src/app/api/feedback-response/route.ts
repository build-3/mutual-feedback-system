import { NextResponse } from "next/server"
import { saveFeedbackResponse } from "@/lib/server/feedback"
import {
  consumeRateLimit,
  getRequestIp,
} from "@/lib/server/rate-limit"
import { hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { requireAuth } from "@/lib/server/require-admin"

export async function POST(request: Request) {
  const ip = getRequestIp(request)
  const rateLimit = consumeRateLimit({
    bucket: "feedback-response",
    key: ip,
    limit: 20,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "too many responses. slow down." },
      { status: 429 }
    )
  }

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    )
  }

  // C4 fix: bind responderId to session user's employee record
  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (!auth.employee) {
    return NextResponse.json(
      { error: "Your account is not linked to an employee record." },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { answerId, responseText } = body

    if (!answerId || !responseText?.trim()) {
      return NextResponse.json(
        { error: "answerId and responseText are required." },
        { status: 400 }
      )
    }

    // Always use the session user's employee ID — ignore any body.responderId
    const response = await saveFeedbackResponse({
      answerId,
      responderId: auth.employee.id,
      responseText,
    })

    return NextResponse.json({ status: "saved", response })
  } catch (err) {
    console.error("Feedback response error:", err)
    const rawMessage = err instanceof Error ? err.message : ""

    // H3 fix: only expose safe validation messages, not raw DB errors
    const SAFE_MESSAGES = [
      "answer not found",
      "submission not found",
      "responderId",
      "answerId",
      "responseText",
      "responder must be",
    ]
    const isSafe = SAFE_MESSAGES.some((p) => rawMessage.startsWith(p))
    const message = isSafe ? rawMessage : "Failed to save response."

    return NextResponse.json({ error: message }, { status: 400 })
  }
}
