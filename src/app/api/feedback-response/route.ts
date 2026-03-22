import { NextResponse } from "next/server"
import {
  getBasicAuthChallengeHeaders,
  isAuthorizedRequest,
} from "@/lib/server/basic-auth"
import { saveFeedbackResponse } from "@/lib/server/feedback"
import {
  consumeRateLimit,
  getRequestIp,
} from "@/lib/server/rate-limit"
import {
  hasServerSupabaseConfig,
  SERVER_SETUP_ERROR,
} from "@/lib/server/supabase-admin"

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request.headers.get("authorization"))) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: getBasicAuthChallengeHeaders(),
    })
  }

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
    return NextResponse.json({ error: SERVER_SETUP_ERROR }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { answerId, responderId, responseText } = body

    if (!answerId || !responderId || !responseText?.trim()) {
      return NextResponse.json(
        { error: "answerId, responderId, and responseText are required" },
        { status: 400 }
      )
    }

    const response = await saveFeedbackResponse({
      answerId,
      responderId,
      responseText,
    })

    return NextResponse.json({ status: "saved", response })
  } catch (err) {
    console.error("Feedback response error:", err)
    const errorMessage = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json(
      { error: "failed", detail: errorMessage },
      { status: 400 }
    )
  }
}
