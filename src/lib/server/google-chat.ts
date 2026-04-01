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

// ── Auth client (singleton) ─────────────────────────────────────────────
let jwtClient: JWT | null = null

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

async function getAccessToken(): Promise<string> {
  const client = getJwtClient()
  const { token } = await client.getAccessToken()
  if (!token) throw new Error("Failed to obtain access token")
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

/** Send a test message from the admin panel */
export async function sendTestMessage(
  recipientEmail: string
): Promise<boolean> {
  return sendDirectMessage(
    recipientEmail,
    "✅ Google Chat notifications are working! This is a test message from build3."
  )
}
