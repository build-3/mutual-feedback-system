import { NextResponse } from "next/server"
import {
  hasServerSupabaseConfig,
  SERVER_SETUP_ERROR,
} from "@/lib/server/supabase-admin"
import { requireAuth } from "@/lib/server/require-admin"
import { sendNotificationForSubmission } from "@/lib/server/feedback"

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

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
    return NextResponse.json(
      { error: "notification failed" },
      { status: 500 }
    )
  }
}
