import { NextResponse } from "next/server"
import {
  getBasicAuthChallengeHeaders,
  isAuthorizedRequest,
} from "@/lib/server/basic-auth"
import {
  hasServerSupabaseConfig,
  SERVER_SETUP_ERROR,
} from "@/lib/server/supabase-admin"
import { sendNotificationForSubmission } from "@/lib/server/feedback"

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request.headers.get("authorization"))) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: getBasicAuthChallengeHeaders(),
    })
  }

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json({ error: SERVER_SETUP_ERROR }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { submissionId } = body

    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 }
      )
    }

    const result = await sendNotificationForSubmission(submissionId)
    return NextResponse.json(result)
  } catch (err) {
    console.error("Google Chat notification error:", err)
    const errorMessage = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json(
      { error: "notification failed", detail: errorMessage },
      { status: 500 }
    )
  }
}
