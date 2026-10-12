import { ImageResponse } from "next/og"
import { NextResponse } from "next/server"
import { hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { buildFeedbackTable, buildLeaderboardPayload } from "@/lib/server/leaderboard"
import { isValidImageSignature } from "@/lib/server/leaderboard-image"
import { denseRanks } from "@/lib/leaderboard"
import { cycleFromKey } from "@/lib/cycles"

export const dynamic = "force-dynamic"

const WIDTH = 1000
const ROW = 44
const HEAD = 236
const FOOT = 64

const INK = "#1d1b1a"
const MUTED = "#7a7570"
const LINE = "#ece6dd"
const CREAM = "#faf7f2"
const LAVENDER = "#b9a9d0"
const MEDAL = ["#e3c46f", "#cfd2d8", "#d3a77a"]

/**
 * The podium post's image: everyone on the board with feedback given and
 * received, this cycle and all time, sorted by given this cycle.
 *
 * Fetched by Google Chat, so it is authenticated by the signed URL rather than
 * a session (see leaderboard-image.ts) and exempted in middleware.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const cycleKey = url.searchParams.get("c") ?? ""
  const sig = url.searchParams.get("s") ?? ""
  const cycle = cycleFromKey(cycleKey)

  if (!cycle || !isValidImageSignature(cycleKey, sig)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 })
  }

  const board = await buildLeaderboardPayload("cycle", cycle.startMs + 1000)
  const table = await buildFeedbackTable(board)
  const places = denseRanks(table.map((r) => r.givenCycle))

  const num = (n: number, strong = false) => (
    <div
      style={{
        width: 120,
        display: "flex",
        justifyContent: "center",
        fontSize: 20,
        color: n === 0 ? "#c4beb6" : INK,
        fontWeight: strong ? 700 : 400,
      }}
    >
      {String(n)}
    </div>
  )

  return new ImageResponse(
    (
      <div style={{ width: WIDTH, display: "flex", flexDirection: "column", background: CREAM, padding: "40px 48px 0", color: INK }}>
        <div style={{ display: "flex", fontSize: 18, color: MUTED, letterSpacing: 1 }}>BUILD3 · FEEDBACK LEADERBOARD</div>
        <div style={{ display: "flex", fontSize: 40, marginTop: 8 }}>{`Cycle ${board.windowLabel}`}</div>
        <div style={{ display: "flex", fontSize: 18, color: MUTED, marginTop: 6 }}>
          {`${board.totals.activeGivers} of ${board.totals.people} have given feedback this cycle · sorted by feedback given this cycle`}
        </div>

        <div style={{ display: "flex", marginTop: 28, fontSize: 15, color: MUTED }}>
          <div style={{ width: 424, display: "flex" }} />
          <div style={{ width: 240, display: "flex", justifyContent: "center", borderBottom: `2px solid ${LAVENDER}`, paddingBottom: 4 }}>THIS CYCLE</div>
          <div style={{ width: 240, display: "flex", justifyContent: "center", borderBottom: `2px solid ${LINE}`, paddingBottom: 4 }}>ALL TIME</div>
        </div>
        <div style={{ display: "flex", height: 36, alignItems: "center", fontSize: 15, color: MUTED }}>
          <div style={{ width: 56, display: "flex" }} />
          <div style={{ width: 368, display: "flex" }}>NAME</div>
          <div style={{ width: 120, display: "flex", justifyContent: "center" }}>GIVEN</div>
          <div style={{ width: 120, display: "flex", justifyContent: "center" }}>RECEIVED</div>
          <div style={{ width: 120, display: "flex", justifyContent: "center" }}>GIVEN</div>
          <div style={{ width: 120, display: "flex", justifyContent: "center" }}>RECEIVED</div>
        </div>

        {table.map((row, i) => {
          const place = row.givenCycle > 0 ? places[i] : 0
          return (
            <div
              key={row.name + i}
              style={{ display: "flex", height: ROW, alignItems: "center", borderTop: `1px solid ${LINE}`, background: i % 2 === 0 ? "#ffffff" : CREAM }}
            >
              <div style={{ width: 56, display: "flex", justifyContent: "center" }}>
                {place > 0 && place <= 3 ? (
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: MEDAL[place - 1], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
                    {String(place)}
                  </div>
                ) : place > 0 ? (
                  <div style={{ display: "flex", fontSize: 15, color: MUTED }}>{String(place)}</div>
                ) : null}
              </div>
              <div style={{ width: 368, display: "flex", fontSize: 20 }}>{row.name}</div>
              {num(row.givenCycle, true)}
              {num(row.receivedCycle)}
              {num(row.givenTotal)}
              {num(row.receivedTotal)}
            </div>
          )
        })}

        <div style={{ display: "flex", height: FOOT, alignItems: "center", fontSize: 15, color: MUTED, borderTop: `1px solid ${LINE}` }}>
          One feedback = one teammate reviewed in one cycle. Empty or &quot;na&quot; forms don&apos;t count.
        </div>
      </div>
    ),
    { width: WIDTH, height: HEAD + ROW * table.length + FOOT }
  )
}
