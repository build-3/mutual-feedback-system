import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import {
  sendDirectMessage,
  isGoogleChatConfigured,
  isNotificationsEnabled,
} from "@/lib/server/google-chat"
import { buildLeaderboardPayload } from "@/lib/server/leaderboard"
import { isDayAfterSecondTuesdayIst, closedCycleAt } from "@/lib/cycles"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mutualfeedback.build3.online"

/** Somebody this new has not had a cycle to take part in yet. */
const GRACE_DAYS = 14

/**
 * The once-a-cycle nudge to people who reviewed nobody.
 *
 * It must not read as surveillance, which is the live risk with a message like
 * this. So it never says "you gave nothing" — it says who still needs feedback
 * and invites them to help. Same action requested, no accusation, and it
 * carries something the recipient actually wants to know.
 *
 * Off by default. Sending requires the `leaderboard_nudge_enabled` site setting
 * to be "true": this is the only part of the leaderboard that reaches people
 * unprompted, and the precedent in this codebase is to gate that rather than
 * let a schedule turn it on by itself.
 *
 *   ?dry=true    compute and return who would be messaged and why. Sends nothing.
 *   ?force=true  bypass the day gate.
 */
export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 })
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 })
  }

  const url = new URL(request.url)
  const dry = url.searchParams.get("dry") === "true"
  const force = url.searchParams.get("force") === "true"

  if (!force && !isDayAfterSecondTuesdayIst()) {
    return NextResponse.json({ skipped: true, reason: "Today is not the day after a session." })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const closed = closedCycleAt()

  // The board for the cycle that just closed — that is the one being reported
  // on, and the one whose gaps are now fixed and knowable.
  const board = await buildLeaderboardPayload("cycle", closed.startMs + 1000)

  // The nudge exists to fill a real gap. With nobody short of feedback it would
  // just be a monthly reminder that somebody is counting, so it stays quiet.
  if (board.needsFeedback.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: "Everyone has had feedback this cycle — nothing to nudge about.",
    })
  }

  const { data: employeeRows } = await supabaseAdmin
    .from("employees")
    .select("id, name, email, created_at, is_active")
    .eq("is_active", true)

  const employees = (employeeRows ?? []) as {
    id: string
    name: string
    email: string | null
    created_at: string
    is_active: boolean
  }[]
  const byId = new Map(employees.map((e) => [e.id, e]))

  const graceCutoff = Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000

  const { data: alreadyRows } = await supabaseAdmin
    .from("leaderboard_nudges" as never)
    .select("employee_id")
    .eq("cycle_key", closed.key)

  const already = new Set(
    ((alreadyRows ?? []) as { employee_id: string }[]).map((r) => r.employee_id)
  )

  const candidates = board.rows
    .filter((row) => row.reviewed === 0)
    .map((row) => {
      const employee = byId.get(row.employeeId)
      if (!employee) return { row, skip: "not on the roster" }
      if (!employee.email) return { row, skip: "no email" }
      if (Date.parse(employee.created_at) > graceCutoff) return { row, skip: "joined within the grace period" }
      if (already.has(row.employeeId)) return { row, skip: "already nudged this cycle" }
      return { row, employee }
    })

  type Recipient = { row: (typeof board.rows)[number]; id: string; name: string; email: string }

  const willSend: Recipient[] = candidates.flatMap((c) =>
    "employee" in c && c.employee?.email
      ? [{ row: c.row, id: c.employee.id, name: c.employee.name, email: c.employee.email }]
      : []
  )

  const shortNames = board.needsFeedback.map((p) => p.name)
  const count = shortNames.length

  function messageFor(name: string): string {
    const who =
      count === 1
        ? "a teammate hasn't had any feedback this cycle yet"
        : `${count} teammates haven't had any feedback this cycle yet`
    return [
      `hi ${name.split(" ")[0]} — ${who}.`,
      "",
      "if you have ten minutes, you'd be the first to give them something to work with:",
      `→ ${APP_URL}/leaderboard`,
      "",
      "no pressure, and this is just a nudge — nothing about it is tracked against you.",
    ].join("\n")
  }

  if (dry) {
    return NextResponse.json({
      dry: true,
      cycle: closed.key,
      needingFeedback: shortNames,
      wouldSend: willSend.map((c) => ({ name: c.name, email: c.email })),
      skipped: candidates
        .filter((c) => "skip" in c)
        .map((c) => ({ name: c.row.name, reason: (c as { skip: string }).skip })),
      sampleMessage: willSend.length > 0 ? messageFor(willSend[0].name) : null,
    })
  }

  const { data: enabledRow } = await supabaseAdmin
    .from("site_settings" as never)
    .select("value")
    .eq("key", "leaderboard_nudge_enabled")
    .maybeSingle()

  if ((enabledRow as { value: string } | null)?.value !== "true") {
    return NextResponse.json({
      skipped: true,
      reason: "Nudges are off.",
      hint: "Set site_settings.leaderboard_nudge_enabled to \"true\" to turn them on. Use ?dry=true to preview.",
      wouldSend: willSend.length,
    })
  }

  const chatConfigured = isGoogleChatConfigured()
  if (!chatConfigured || !(await isNotificationsEnabled())) {
    return NextResponse.json({ skipped: true, reason: "Chat notifications disabled." })
  }

  const results: { name: string; sent: boolean; error?: string }[] = []
  for (const candidate of willSend) {
    try {
      await sendDirectMessage(candidate.email, messageFor(candidate.name))
      await supabaseAdmin
        .from("leaderboard_nudges" as never)
        .insert({ cycle_key: closed.key, employee_id: candidate.id } as never)
      results.push({ name: candidate.name, sent: true })
    } catch (err: unknown) {
      results.push({
        name: candidate.name,
        sent: false,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  return NextResponse.json({
    cycle: closed.key,
    needingFeedback: count,
    nudged: results.filter((r) => r.sent).length,
    results,
  })
}
