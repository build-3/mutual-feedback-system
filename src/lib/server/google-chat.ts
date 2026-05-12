import "server-only"

import { JWT } from "google-auth-library"
import { getSupabaseAdmin } from "./supabase-admin"

// ── Config ──────────────────────────────────────────────────────────────
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""
const RAW_KEY = process.env.GOOGLE_PRIVATE_KEY ?? ""
const PRIVATE_KEY = RAW_KEY.replace(/^"|"$/g, "").replace(/\\n/g, "\n") || undefined
const SENDER_EMAIL = process.env.GOOGLE_CHAT_SENDER_EMAIL ?? ""
const CHAT_SCOPES = [
  "https://www.googleapis.com/auth/chat.messages.create",
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.messages",
]
const CHAT_API = "https://chat.googleapis.com/v1"
const TIMEOUT_MS = 10_000

export function isGoogleChatConfigured(): boolean {
  return Boolean(SERVICE_ACCOUNT_EMAIL && PRIVATE_KEY && SENDER_EMAIL)
}

// ── Auth clients (singletons) ───────────────────────────────────────────
let jwtClient: JWT | null = null
let jwtClientApp: JWT | null = null

function getJwtClient(): JWT {
  if (!jwtClient) {
    jwtClient = new JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: PRIVATE_KEY,
      scopes: CHAT_SCOPES,
      subject: SENDER_EMAIL,
    })
  }
  return jwtClient
}

function getJwtClientApp(): JWT {
  if (!jwtClientApp) {
    jwtClientApp = new JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: PRIVATE_KEY,
      scopes: CHAT_SCOPES,
    })
  }
  return jwtClientApp
}

async function getAccessToken(): Promise<string> {
  const client = getJwtClient()
  const { token } = await client.getAccessToken()
  if (!token) throw new Error("Failed to obtain access token")
  return token
}

async function getAppAccessToken(): Promise<string> {
  const client = getJwtClientApp()
  const { token } = await client.getAccessToken()
  if (!token) throw new Error("Failed to obtain app access token")
  return token
}

// ── Timeout helper ──────────────────────────────────────────────────────
function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  )
}

// ── Profile photo ──────────────────────────────────────────────────────
const photoCache = new Map<string, { url: string | null; expiresAt: number }>()
const PHOTO_CACHE_TTL_MS = 3_600_000 // 1 hour

export async function getProfilePhotoUrl(email: string): Promise<string | null> {
  const cached = photoCache.get(email)
  if (cached && Date.now() < cached.expiresAt) return cached.url

  try {
    const jwt = new JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: PRIVATE_KEY,
      scopes: ["https://www.googleapis.com/auth/admin.directory.user.readonly"],
      subject: SENDER_EMAIL,
    })
    const { token } = await jwt.getAccessToken()
    if (!token) return null

    const res = await fetchWithTimeout(
      `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}?fields=thumbnailPhotoUrl`,
      { method: "GET", headers: { Authorization: `Bearer ${token}` } }
    )

    if (!res.ok) return null
    const data = await res.json()
    const url = data.thumbnailPhotoUrl || null

    if (url) {
      if (photoCache.size > 200) photoCache.clear()
      photoCache.set(email, { url, expiresAt: Date.now() + PHOTO_CACHE_TTL_MS })
    }
    return url
  } catch {
    return null
  }
}

// ── Space ID cache ──────────────────────────────────────────────────────
const spaceCache = new Map<string, { name: string; expiresAt: number }>()
const SPACE_CACHE_TTL_MS = 600_000 // 10 minutes

async function getOrCreateDMSpace(
  token: string,
  recipientEmail: string
): Promise<string> {
  const cached = spaceCache.get(recipientEmail)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.name
  }

  const res = await fetchWithTimeout(`${CHAT_API}/spaces:setup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      space: { spaceType: "DIRECT_MESSAGE" },
      memberships: [
        { member: { name: `users/${recipientEmail}`, type: "HUMAN" } },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`spaces.setup failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  const spaceName = data.name
  if (!spaceName) throw new Error("spaces.setup returned no name")

  if (spaceCache.size > 200) spaceCache.clear()
  spaceCache.set(recipientEmail, {
    name: spaceName,
    expiresAt: Date.now() + SPACE_CACHE_TTL_MS,
  })

  return spaceName
}

// ── Public API ──────────────────────────────────────────────────────────

/** Check if notifications are enabled via DB toggle */
export async function isNotificationsEnabled(): Promise<boolean> {
  if (process.env.DEV_MODE === "true") return false

  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data } = await supabaseAdmin
      .from("site_settings" as never)
      .select("value")
      .eq("key", "google_chat_enabled")
      .single()
    const row = data as { value: string } | null
    return row?.value === "true"
  } catch {
    return true
  }
}

/** Send a DM via Google Chat. Returns true on success. */
export async function sendDirectMessage(
  recipientEmail: string,
  messageText: string
): Promise<boolean> {
  if (!isGoogleChatConfigured()) return false

  const token = await getAccessToken()
  const spaceName = await getOrCreateDMSpace(token, recipientEmail)

  const res = await fetchWithTimeout(
    `${CHAT_API}/${spaceName}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: messageText }),
    }
  )

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`messages.create failed (${res.status}): ${text}`)
  }

  return true
}

/** Send a plain text message to a named space. Uses user impersonation. */
export async function sendMessageToSpace(
  spaceId: string,
  messageText: string
): Promise<boolean> {
  if (!isGoogleChatConfigured()) return false

  const normalizedSpaceId = spaceId.startsWith("spaces/") ? spaceId : `spaces/${spaceId}`
  const token = await getAccessToken()

  const res = await fetchWithTimeout(`${CHAT_API}/${normalizedSpaceId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: messageText }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`messages.create to space failed (${res.status}): ${text}`)
  }

  return true
}

/** Send a Card v2 (or plain text) message to a named space. Uses app identity (no human impersonation). */
export async function sendCardToSpace(
  spaceId: string,
  payload: Record<string, unknown>
): Promise<{ messageName: string }> {
  if (!isGoogleChatConfigured()) {
    throw new Error("Google Chat is not configured")
  }

  const normalizedSpaceId = spaceId.startsWith("spaces/") ? spaceId : `spaces/${spaceId}`
  const token = await getAppAccessToken()
  const res = await fetchWithTimeout(`${CHAT_API}/${normalizedSpaceId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`messages.create to space failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  return { messageName: data.name ?? "" }
}

/** Send a test message from the admin panel */
export async function sendTestMessage(
  recipientEmail: string
): Promise<boolean> {
  return sendDirectMessage(
    recipientEmail,
    "✅ Google Chat notifications are working! This is a test message from build3."
  )
}
