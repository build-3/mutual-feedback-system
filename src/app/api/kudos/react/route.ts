import { NextResponse } from "next/server"
import { OAuth2Client } from "google-auth-library"
import { recordBoost } from "@/lib/server/kudos"

/**
 * Google Chat interactive callback endpoint for the "Kudos ++" button.
 *
 * Flow:
 *   1. User clicks "Kudos ++" on a kudos card in Google Chat.
 *   2. Google Chat POSTs an event to this endpoint with a Bearer token
 *      (an ID token signed by chat@system.gserviceaccount.com).
 *   3. We verify the token (issuer + audience = our GCP project number),
 *      extract the clicker's email and the kudos_id parameter, and call
 *      recordBoost() which inserts a row in kudos_boosts.
 *   4. We respond with a short text confirmation that gets posted in the
 *      same thread.
 *
 * Auth model: we trust Google's JWT verification. Without it, anyone who
 * knew this URL could POST arbitrary kudos_id values and forge boosts.
 */

const CHAT_ISSUER = "chat@system.gserviceaccount.com"
const PROJECT_NUMBER = process.env.GCP_PROJECT_NUMBER ?? "1013582637775"

const verifier = new OAuth2Client()

async function verifyChatRequest(authHeader: string | null): Promise<{ email: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null
  const token = authHeader.slice("Bearer ".length).trim()
  if (!token) return null

  try {
    const ticket = await verifier.verifyIdToken({
      idToken: token,
      audience: PROJECT_NUMBER,
    })
    const payload = ticket.getPayload()
    if (!payload) return null
    if (payload.iss !== CHAT_ISSUER && payload.iss !== `https://accounts.google.com`) return null
    if (payload.email_verified !== true) return null
    if (!payload.email) return null
    return { email: payload.email }
  } catch (err) {
    console.error("[kudos/react] JWT verify failed:", err)
    return null
  }
}

export async function POST(request: Request) {
  // 1. Verify the request came from Google Chat
  const auth = await verifyChatRequest(request.headers.get("authorization"))
  if (!auth) {
    // Be permissive about the response shape so misconfigured Chat health
    // checks still get a 200 with explanatory text rather than 401 spam.
    return NextResponse.json({ text: "Not authenticated. This endpoint is for Google Chat callbacks only." })
  }

  // 2. Parse the interaction event
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
  } catch {
    return NextResponse.json({ text: "Invalid request body." })
  }

  // Google Chat sends event.user.email (the clicker). Fall back to JWT email
  // if for some reason the event body omits it.
  const clickerEmail = event.user?.email ?? auth.email
  const clickerName = event.user?.displayName ?? clickerEmail

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
