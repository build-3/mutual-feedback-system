import { JWT } from "google-auth-library"
import { readFileSync } from "fs"
import { resolve } from "path"
import { createClient } from "@supabase/supabase-js"

// Load .env.local (same pattern as scripts/send-reminder.ts)
const envFile = readFileSync(resolve(__dirname, "../.env.local"), "utf-8")
for (const line of envFile.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim()
}

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""
const RAW_KEY = process.env.GOOGLE_PRIVATE_KEY ?? ""
const PRIVATE_KEY = RAW_KEY.replace(/^"|"$/g, "").replace(/\\n/g, "\n") || undefined
const SENDER_EMAIL = process.env.GOOGLE_CHAT_SENDER_EMAIL ?? ""
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

const CHAT_API = "https://chat.googleapis.com/v1"
const SCOPES = [
  "https://www.googleapis.com/auth/chat.messages.create",
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.messages",
]

// Approved copy — bare URL (no <url|display>), no em dashes.
const MESSAGE = [
  `hey team 👋`,
  ``,
  `our next *mutual feedback session* is coming up. before you join, please head to https://mutualfeedback.build3.online and complete both:`,
  ``,
  `• your *self-reflection*`,
  `• your *feedback to build3*`,
  ``,
  `filling both in *before* the session is _mandatory_. it's what makes the session actually useful, so please don't skip it 🙏`,
  ``,
  `takes just a few minutes. thank you!`,
].join("\n")

async function getToken(): Promise<string> {
  const jwt = new JWT({ email: SERVICE_ACCOUNT_EMAIL, key: PRIVATE_KEY, scopes: SCOPES, subject: SENDER_EMAIL })
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error("Failed to get token")
  return token
}

async function sendDM(token: string, recipientEmail: string, message: string) {
  const setupRes = await fetch(`${CHAT_API}/spaces:setup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      space: { spaceType: "DIRECT_MESSAGE" },
      memberships: [{ member: { name: `users/${recipientEmail}`, type: "HUMAN" } }],
    }),
  })
  if (!setupRes.ok) throw new Error(`spaces.setup (${setupRes.status}): ${await setupRes.text()}`)
  const spaceName = (await setupRes.json() as { name: string }).name

  const msgRes = await fetch(`${CHAT_API}/${spaceName}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  })
  if (!msgRes.ok) throw new Error(`messages.create (${msgRes.status}): ${await msgRes.text()}`)
}

async function main() {
  const dry = process.argv.includes("--dry")
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, name, email")
    .eq("is_active", true)
    .not("email", "is", null)

  if (error) throw new Error(`supabase query failed: ${error.message}`)

  // One DM per person, not per row: a few teammates have duplicate employee rows
  // sharing an address, and the sender should not message themselves.
  const byEmail = new Map<string, { id: string; name: string; email: string }>()
  for (const e of employees ?? []) {
    if (!e.email) continue
    const key = e.email.toLowerCase()
    if (key === SENDER_EMAIL.toLowerCase()) continue
    if (!byEmail.has(key)) byEmail.set(key, e as { id: string; name: string; email: string })
  }
  const recipients = Array.from(byEmail.values())

  console.log(`Sender: ${SENDER_EMAIL}`)
  console.log(`Recipients: ${recipients.length} (of ${employees?.length ?? 0} with email; sender excluded)`)
  console.log(`--- MESSAGE PREVIEW ---\n${MESSAGE}\n-----------------------`)

  if (dry) {
    console.log("DRY RUN — no messages sent. Recipients:")
    recipients.forEach((e, i) => console.log(`  ${i + 1}. ${e.name} <${e.email}>`))
    return
  }

  const token = await getToken()
  let sent = 0
  const failed: { name: string; email: string; error: string }[] = []

  for (const emp of recipients) {
    try {
      await sendDM(token, emp.email!, MESSAGE)
      sent++
      console.log(`✅ ${emp.name} <${emp.email}>`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failed.push({ name: emp.name, email: emp.email!, error: msg })
      console.error(`❌ ${emp.name} <${emp.email}>: ${msg}`)
    }
    await new Promise((r) => setTimeout(r, 400))
  }

  console.log(`\n=== DONE: ${sent} sent, ${failed.length} failed ===`)
  if (failed.length) console.log(JSON.stringify(failed, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
