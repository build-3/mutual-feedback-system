/**
 * One-shot: add the Chat app (build3 kudos bot) as a member of a Chat space.
 *
 * Usage:
 *   npx tsx scripts/add-kudos-bot-to-space.ts spaces/AAQA1d87Q_w
 *
 * Requires the following env vars (already in .env.local):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY
 *
 * Uses APP identity (no human impersonation) and calls spaces.members.create
 * with member.name = "users/app", which is the documented way to add a
 * Chat app to a space when the GCP "Add apps" UI search isn't returning the
 * bot (typically because the app's visibility/marketplace settings haven't
 * propagated yet).
 */
import { readFileSync } from "node:fs"
import { JWT } from "google-auth-library"

// Minimal .env.local loader (no dotenv dep needed)
try {
  const raw = readFileSync(".env.local", "utf-8")
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) {
      const v = m[2].replace(/^"|"$/g, "")
      process.env[m[1]] = v
    }
  }
} catch {
  // ignore — env may already be set in shell
}

const RAW_KEY = process.env.GOOGLE_PRIVATE_KEY ?? ""
const PRIVATE_KEY = RAW_KEY.replace(/^"|"$/g, "").replace(/\\n/g, "\n")
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""
const SENDER_EMAIL = process.env.GOOGLE_CHAT_SENDER_EMAIL ?? ""

const SCOPES = [
  "https://www.googleapis.com/auth/chat.memberships",
  "https://www.googleapis.com/auth/chat.memberships.app",
  "https://www.googleapis.com/auth/chat.spaces",
]

async function main() {
  const space = process.argv[2]
  if (!space) {
    console.error("Usage: npx tsx scripts/add-kudos-bot-to-space.ts spaces/<SPACE_ID>")
    process.exit(1)
  }
  if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    console.error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY in env.")
    process.exit(1)
  }

  const normalized = space.startsWith("spaces/") ? space : `spaces/${space}`

  // Impersonate the admin user (GOOGLE_CHAT_SENDER_EMAIL). They must be a
  // member of the space already, and have permission to add apps.
  if (!SENDER_EMAIL) {
    console.error("Missing GOOGLE_CHAT_SENDER_EMAIL in env.")
    process.exit(1)
  }
  const jwt = new JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: PRIVATE_KEY,
    scopes: SCOPES,
    subject: SENDER_EMAIL,
  })
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error("Failed to obtain access token")
  console.log(`Acting as: ${SENDER_EMAIL}`)

  const url = `https://chat.googleapis.com/v1/${normalized}/members`
  const body = { member: { name: "users/app", type: "BOT" } }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`FAILED (${res.status}):`, text)
    process.exit(1)
  }

  console.log(`SUCCESS — bot added to ${normalized}`)
  console.log(text)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
