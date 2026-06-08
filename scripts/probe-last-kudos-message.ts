/**
 * Fetch the last few messages in the kudos space and dump them as JSON so
 * we can see what the button payload actually looks like to Google Chat.
 *
 * Usage:
 *   npx tsx scripts/probe-last-kudos-message.ts spaces/AAQA1d87Q_w
 */
import { readFileSync } from "node:fs"
import { JWT } from "google-auth-library"

try {
  const raw = readFileSync(".env.local", "utf-8")
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "")
  }
} catch {}

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/^"|"$/g, "").replace(/\\n/g, "\n")

async function main() {
  const space = process.argv[2] ?? "spaces/AAQA1d87Q_w"
  const normalized = space.startsWith("spaces/") ? space : `spaces/${space}`

  const SENDER_EMAIL = process.env.GOOGLE_CHAT_SENDER_EMAIL ?? ""
  const jwt = new JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: PRIVATE_KEY,
    scopes: [
      "https://www.googleapis.com/auth/chat.messages.readonly",
      "https://www.googleapis.com/auth/chat.messages",
    ],
    subject: SENDER_EMAIL,  // user-impersonated read
  })
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error("No token")

  const res = await fetch(`https://chat.googleapis.com/v1/${normalized}/messages?pageSize=3&orderBy=createTime desc`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  console.log(`HTTP ${res.status}`)
  if (!res.ok) {
    console.log(text)
    process.exit(1)
  }

  const data = JSON.parse(text)
  for (const msg of data.messages ?? []) {
    console.log("\n══════════════════════════════════════════")
    console.log(`msg ${msg.name}  createTime=${msg.createTime}`)
    console.log("══════════════════════════════════════════")
    console.log(JSON.stringify(msg, null, 2))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
