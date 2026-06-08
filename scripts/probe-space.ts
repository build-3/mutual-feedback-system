/**
 * Probe whether the Chat app is a member of a given space.
 *
 * Usage:
 *   npx tsx scripts/probe-space.ts spaces/AAQA1d87Q_w
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
  const space = process.argv[2]
  if (!space) {
    console.error("Usage: npx tsx scripts/probe-space.ts spaces/<SPACE_ID>")
    process.exit(1)
  }
  const normalized = space.startsWith("spaces/") ? space : `spaces/${space}`

  // App-identity token (matches what sendCardToSpace uses)
  const jwt = new JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/chat.spaces"],
  })
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error("No token")

  // GET the space — if the app is a member, this returns 200. If not, 403.
  const res = await fetch(`https://chat.googleapis.com/v1/${normalized}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  console.log(`HTTP ${res.status}`)
  console.log(text)

  if (res.status === 200) {
    console.log("\n✅ Bot IS a member of this space. Posting will work.")
  } else if (res.status === 403 || res.status === 404) {
    console.log("\n❌ Bot is NOT a member of this space yet.")
  } else {
    console.log("\n⚠️  Unexpected response — read above.")
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
