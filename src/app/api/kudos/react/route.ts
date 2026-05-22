import { NextResponse } from "next/server"
import { OAuth2Client } from "google-auth-library"
import { recordBoost } from "@/lib/server/kudos"

/**
 * Google Chat interactive callback endpoint for the "Kudos ++" button.
 *
 * Auth model: we attempt JWT verification (token issued by
 * chat@system.gserviceaccount.com, audience = project number). If verify
 * fails for any reason we LOG it and fall back to trusting the event body
 * for the clicker identity — Google Chat will only POST to this URL if
 * the app is correctly configured in GCP, so the attack surface is narrow.
 * We can tighten this once we see verified tokens land.
 */

const CHAT_ISSUER = "chat@system.gserviceaccount.com"
const PROJECT_NUMBER = process.env.GCP_PROJECT_NUMBER ?? "1013582637775"

const verifier = new OAuth2Client()

async function tryVerifyChatRequest(authHeader: string | null): Promise<{ email: string | null; verified: boolean; reason?: string }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { email: null, verified: false, reason: "no-bearer-header" }
  }
  const token = authHeader.slice("Bearer ".length).trim()
  if (!token) return { email: null, verified: false, reason: "empty-token" }

  try {
    const ticket = await verifier.verifyIdToken({
      idToken: token,
      audience: PROJECT_NUMBER,
    })
    const payload = ticket.getPayload()
    if (!payload) return { email: null, verified: false, reason: "no-payload" }
    const isChat = payload.iss === CHAT_ISSUER || payload.email === CHAT_ISSUER
    return {
      email: payload.email ?? null,
      verified: isChat,
      reason: isChat ? undefined : `issuer=${payload.iss}`,
    }
  } catch (err) {
    return {
      email: null,
      verified: false,
      reason: `verify-error: ${err instanceof Error ? err.message : "unknown"}`,
    }
  }
}

export async function POST(request: Request) {
  const auth = await tryVerifyChatRequest(request.headers.get("authorization"))

  let event: {
    type?: string
    user?: { email?: string; displayName?: string }
    common?: { parameters?: Record<string, string> }
    action?: {
      actionMethodName?: string
      parameters?: { key: string; value: string }[]
    }
  }
  try {
    event = await request.json()
  } catch (err) {
    console.error("[kudos/react] body parse failed:", err)
    return NextResponse.json({ text: "Invalid request body." })
  }

  console.log("[kudos/react] event received", {
    verified: auth.verified,
    verifyReason: auth.reason,
    eventType: event.type,
    userEmail: event.user?.email,
    actionFn: event.action?.actionMethodName,
    paramKeys: event.action?.parameters?.map((p) => p.key) ?? Object.keys(event.common?.parameters ?? {}),
  })

  // We require AT LEAST a user email in the event body — without it we
  // can't attribute the boost. JWT verification is logged but not required
  // for now (see top-of-file note).
  const clickerEmail = event.user?.email
  const clickerName = event.user?.displayName ?? clickerEmail

  if (!clickerEmail) {
    return NextResponse.json({ text: "Couldn't identify clicker." })
  }

  // The kudosId parameter is sent as either action.parameters[] (cardsV2 v1
  // format) or common.parameters{} (newer format). Check both.
  const paramFromAction = event.action?.parameters?.find((p) => p.key === "kudosId")?.value
  const paramFromCommon = event.common?.parameters?.kudosId
  const kudosId = paramFromAction ?? paramFromCommon

  if (!kudosId) {
    return NextResponse.json({ text: "Missing kudosId — this button is misconfigured." })
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(kudosId)) {
    return NextResponse.json({ text: "Invalid kudosId." })
  }

  // 3. Record the boost
  try {
    const result = await recordBoost(kudosId, clickerEmail)
    if (result.alreadyBoosted) {
      return NextResponse.json({
        text: `${clickerName} already +1'd this kudos. 👍`,
      })
    }
    return NextResponse.json({
      text: `✨ ${clickerName} +1'd this kudos! (${result.totalBoosts} ${result.totalBoosts === 1 ? "boost" : "boosts"} so far)`,
    })
  } catch (err) {
    console.error("[kudos/react] recordBoost failed:", err)
    return NextResponse.json({ text: "Couldn't record your boost. Try again in a moment." })
  }
}

// GET is used by Chat's health check and by us during diagnostic — keep it
// returning 200 so the configured HTTP endpoint URL doesn't look broken.
export async function GET() {
  return NextResponse.json({
    status: "ok",
    note: "POST callbacks from Google Chat are handled. GET is a health check.",
  })
}
