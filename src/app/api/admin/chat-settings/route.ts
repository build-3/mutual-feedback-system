import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { sendTestMessage, isGoogleChatConfigured } from "@/lib/server/google-chat"

/** GET — return current chat notification status */
export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const supabaseAdmin = getSupabaseAdmin()
  const { data } = await supabaseAdmin
    .from("site_settings" as never)
    .select("value")
    .eq("key", "google_chat_enabled")
    .single()

  const row = data as { value: string } | null
  const enabled = row?.value === "true"
  const configured = isGoogleChatConfigured()

  return NextResponse.json({ enabled, configured })
}

/** PATCH — toggle chat notifications on/off */
export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await request.json()
  const enabled = Boolean(body.enabled)

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from("site_settings" as never)
    .upsert(
      { key: "google_chat_enabled", value: String(enabled), updated_at: new Date().toISOString() } as never,
      { onConflict: "key" }
    )

  if (error) {
    return NextResponse.json({ error: "Failed to update setting." }, { status: 500 })
  }

  return NextResponse.json({ enabled })
}

/** POST — send a test message to verify Google Chat is working */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await request.json()
  const recipientEmail = body.recipientEmail as string | undefined

  if (!recipientEmail) {
    return NextResponse.json({ error: "recipientEmail is required." }, { status: 400 })
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(recipientEmail.trim())) {
    return NextResponse.json({ error: "recipientEmail must be a valid email address." }, { status: 400 })
  }

  if (!isGoogleChatConfigured()) {
    return NextResponse.json(
      { error: "Google Chat is not configured. Check env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_CHAT_SENDER_EMAIL." },
      { status: 503 }
    )
  }

  try {
    const sent = await sendTestMessage(recipientEmail)
    if (sent) {
      return NextResponse.json({ status: "sent" })
    }
    return NextResponse.json({ error: "Failed to send test message." }, { status: 500 })
  } catch (err) {
    console.error("[chat-test] Error:", err)
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
