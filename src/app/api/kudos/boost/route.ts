import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { recordBoost } from "@/lib/server/kudos"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Kudos++ via web flow.
 *
 * When a user clicks the "Kudos ++" button on a Chat card, Chat opens this
 * URL in their browser. They're already signed in (Supabase session), so
 * we can attribute the boost without a Chat callback or JWT verification.
 *
 * This bypasses the Google Chat interactive-button mechanism entirely,
 * which had reliability issues in Workspace add-on mode. The same DB
 * table (kudos_boosts) is used either way, so any future migration back
 * to in-chat callbacks reuses the same data.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const kudosId = url.searchParams.get("id") ?? ""

  if (!UUID_RE.test(kudosId)) {
    return htmlPage("invalid kudos id", "the link is malformed.")
  }

  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!auth.employee?.email) {
    return htmlPage("not signed in", "we couldn't read your account.")
  }

  try {
    const result = await recordBoost(kudosId, auth.employee.email)
    if (result.alreadyBoosted) {
      return htmlPage(
        "already boosted!",
        `you already +1'd this one (${result.totalBoosts} ${result.totalBoosts === 1 ? "boost" : "boosts"} total).`,
        true,
      )
    }
    return htmlPage(
      "boost recorded ✨",
      `you +1'd this kudos! (${result.totalBoosts} ${result.totalBoosts === 1 ? "boost" : "boosts"} so far)`,
      true,
    )
  } catch (err) {
    console.error("[kudos/boost] failed:", err)
    return htmlPage("oops", "couldn't record the boost. try again.")
  }
}

function htmlPage(title: string, body: string, success = false): Response {
  const accent = success ? "#4a8c6f" : "#d35b52"
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — build3 kudos</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: #fffaf5;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #1a1a1a;
  }
  .card {
    max-width: 420px;
    background: white;
    border: 1px solid #e8e0d4;
    border-radius: 24px;
    padding: 32px 28px;
    text-align: center;
    box-shadow: 0 8px 24px rgba(0,0,0,0.04);
  }
  h1 {
    font-size: 24px;
    margin: 0 0 8px;
    letter-spacing: -0.02em;
    color: ${accent};
  }
  p { margin: 0; color: #6a6a6a; font-size: 14px; }
  .footer {
    margin-top: 24px;
    font-size: 12px;
    color: #999;
  }
  .footer a { color: #6a6a6a; text-decoration: underline; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${body}</p>
    <div class="footer">
      you can close this tab. <a href="/feedback?path=kudos">send another kudos</a>
    </div>
  </div>
</body>
</html>`
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
