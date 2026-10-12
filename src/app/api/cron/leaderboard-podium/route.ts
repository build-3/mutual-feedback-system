import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import {
  isGoogleChatConfigured,
  isNotificationsEnabled,
  sendCardToSpace,
  sendDirectMessage,
} from "@/lib/server/google-chat"
import { buildLeaderboardPayload, buildLeaderboardView } from "@/lib/server/leaderboard"
import { leaderboardImageUrl } from "@/lib/server/leaderboard-image"
import { podium, podiumMessage } from "@/lib/leaderboard"
import { cycleFor, formatSessionDateLabel, isDayAfterSecondTuesdayIst } from "@/lib/cycles"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
const KUDOS_SPACE_ID = process.env.GOOGLE_CHAT_KUDOS_SPACE_ID ?? ""
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mutualfeedback.build3.online"

/** Holds the cycle key last announced, so a retried run never posts twice. */
const POSTED_KEY = "leaderboard_podium_posted"
/** Set to "false" to stop the post without a deploy. Absent means on. */
const ENABLED_KEY = "leaderboard_podium_enabled"

/**
 * The evening after a session, post the top three of the leaderboard to the
 * kudos space.
 *
 * It ranks the LIVE cycle, not the closed one the pulse report and the nudge
 * read: the cycle opens the day before the session, so the feedback given at
 * the session is in the live cycle, and the post is about that session. It
 * reads the same board the page shows under "this cycle".
 *
 * Scheduled as a plain daily hit like every other cron here; the route decides
 * whether today is the day.
 *
 *   ?dry=true               return the message and who places. Sends nothing.
 *   ?force=true             bypass the day gate and the already-posted check.
 *   ?preview=a@build3.org   DM the message to one person instead of the space.
 *                           Any day; while the live cycle is still empty it
 *                           uses last cycle, as the page does. Marks nothing.
 */
export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 })
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  if (!hasServerSupabaseConfig() || !KUDOS_SPACE_ID) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 })
  }

  const url = new URL(request.url)
  const dry = url.searchParams.get("dry") === "true"
  const force = url.searchParams.get("force") === "true"
  const preview = url.searchParams.get("preview")?.trim().toLowerCase() || null

  if (preview && !preview.endsWith("@build3.org")) {
    return NextResponse.json({ error: "preview must be a build3.org address." }, { status: 400 })
  }

  if (!force && !preview && !isDayAfterSecondTuesdayIst()) {
    return NextResponse.json({ skipped: true, reason: "Today is not the day after a session." })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const cycle = cycleFor()

  const { data: settingRows } = await supabaseAdmin
    .from("site_settings" as never)
    .select("key, value")
    .in("key", [POSTED_KEY, ENABLED_KEY])
  const settings = new Map(
    ((settingRows ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value])
  )

  if (!force && !preview && settings.get(POSTED_KEY) === cycle.key) {
    return NextResponse.json({ skipped: true, reason: "Already posted for this session.", cycle: cycle.key })
  }

  const board = preview ? await buildLeaderboardView("cycle") : await buildLeaderboardPayload("cycle")
  const steps = podium(board.rows)

  if (steps.length === 0) {
    return NextResponse.json({ skipped: true, reason: "Nobody has given feedback this cycle yet.", cycle: cycle.key })
  }

  // "Tuesday, 13 Oct" → "13 Oct"
  const sessionLabel = formatSessionDateLabel(board.cycleKey).split(", ").pop() ?? board.cycleKey
  const text = podiumMessage({
    steps,
    sessionLabel,
    givers: board.totals.activeGivers,
    people: board.totals.people,
    boardUrl: `${APP_URL}/leaderboard`,
  })

  // The whole table travels as an image inside the post, so nobody has to
  // click through to see where they stand. Chat fetches it from the signed URL.
  const imageUrl = leaderboardImageUrl(APP_URL, board.cycleKey)
  const payload = {
    text,
    cardsV2: [
      {
        cardId: `leaderboard-podium-${board.cycleKey}`,
        card: {
          sections: [
            {
              widgets: [
                {
                  image: {
                    imageUrl,
                    altText: `Feedback given and received this cycle and all time, for everyone, ${board.windowLabel}`,
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  }

  if (dry) {
    return NextResponse.json({ dry: true, cycle: board.cycleKey, window: board.windowLabel, podium: steps, text, imageUrl })
  }

  if (preview) {
    try {
      // A DM goes out as the user, and only an app can send cards, so the
      // preview links the image instead of embedding it.
      await sendDirectMessage(preview, `${text}\n\n<${imageUrl}|The table image>`)
      return NextResponse.json({ preview: true, to: preview, cycle: board.cycleKey, podium: steps, text, imageUrl })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  }

  if (settings.get(ENABLED_KEY) === "false") {
    return NextResponse.json({ skipped: true, reason: `Podium post is off (${ENABLED_KEY}).` })
  }

  if (!isGoogleChatConfigured() || !(await isNotificationsEnabled())) {
    return NextResponse.json({ skipped: true, reason: "Chat notifications disabled." })
  }

  try {
    const result = await sendCardToSpace(KUDOS_SPACE_ID, payload)

    await supabaseAdmin
      .from("site_settings" as never)
      .upsert(
        { key: POSTED_KEY, value: cycle.key, updated_at: new Date().toISOString() } as never,
        { onConflict: "key" }
      )

    return NextResponse.json({ sent: true, cycle: cycle.key, podium: steps, messageName: result.messageName })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
