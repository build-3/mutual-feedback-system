# Session handoff — 2026-05-21/22

State of the world at end of session, what's done, what's open, and what to do next. Read top to bottom.

---

## 1. What got built this session

### A. Probation system — completely rebuilt
Old probation system (`probation-rules`, `probation-actions`, `ProbationDashboard`, cron jobs `probation-check`/`probation-rules`, `/api/admin/probation/{decision,preview,send}`) deleted. New system:

- **DB** (`probation_tracking`, `probation_reviews`, `probation_reviewers`) — applied to live Supabase
- **Server** — `src/lib/server/probation.ts` with `createProbation`, `notifyReviewerGroup`, `submitProbationReview`, `promoteToFullTime`, `extendProbation`, `updateProbationDuration` (optimistic-lock count check), `getProbationOverview` (aggregates feedback within probation window, bounded by `promoted_at`)
- **API** — `/api/admin/probation` (GET), `/review`, `/promote`, `/extend`, `/duration`
- **Auto-create** — `/api/auth/callback` calls `createProbation` + `notifyReviewerGroup` for new interns on first sign-in, wrapped in try/catch so it never blocks auth
- **UI** — `src/components/admin/ProbationSection.tsx`, rendered on `/insights` at the bottom only when viewing a specific intern (silently hidden on 401/403 for non-admins)
- **Route rename** — `/glock17/` → `/admin/`. All `glock17` references gone from the codebase

Commits: `fe8238c` (rebuild) and the original kudos commits below.

### B. Kudos system — overhauled
Was previously a fire-and-forget Chat post with no persistence. Now:

- **DB** (`kudos`, `kudos_recipients`, `kudos_boosts`) — applied to live Supabase
- **Server** — `src/lib/server/kudos.ts` — `persistKudos`, `getPreviousGiversForRecipient`, `getTopRecipients`, `recordBoost` (idempotent on PK (kudos_id, booster_email), treats 23505 unique_violation as "already boosted")
- **API**:
  - `POST /api/kudos` — persists first, fails on DB error, builds card with social-proof footer + interactive Kudos++ button
  - `GET /api/kudos/leaderboard?limit=5&sinceDays=30` — top recipients in window
  - `POST/GET /api/kudos/react` — Chat callback handler for the Kudos++ button (verifies Google Chat JWT, logs but doesn't fail on verification quirks, records boost, replies in-thread)
  - `GET /api/kudos/boost?id=<uuid>` — fallback web flow if in-chat callback can't work. Uses Supabase session to attribute the boost. Renders an inline HTML confirmation page.
- **UI** — `src/components/KudosCard.tsx`:
  - Heading reworded ("why are they getting kudos?")
  - 🏆 Leaderboard panel (top 5 last 30d, with medals + count badges, refreshes after send)
  - Recipient picker (max 20), GIF shuffler, send button
- **Navbar** — kudos link restored to top nav + mobile bottom tab (reverts the old `f5b6ae6 fix: hide kudos link from navbar` commit)
- **Bot identity** — Chat app in GCP renamed to **"build3 kudos bot"** with avatar `https://build3.online/icon-512.png`
- **Chat space** — bot is a member of `spaces/AAQA1d87Q_w` (Announcements). Added programmatically via `scripts/add-kudos-bot-to-space.ts` after fixing DWD scopes (see §3)

Commits: `4822317` (persistence + leaderboard), `46f28eb` (Kudos++ button), `d3ad04b` (lenient verify), `2aa57d5` (middleware bypass), `46e5e1f` (openLink fallback — later reverted), `a50da3c` (revert back to action.function), `0d87db8` (Apps Script guide).

### C. Misc
- Security review run by sub-agent. Fixes landed: `.gitignore` excludes `supabase_backup_*.txt` (PII), `updateProbationDuration` does optimistic-lock count check, `ProbationSection` silently hides on 401/403, `getProbationOverview` bounds feedback by `promoted_at`.

---

## 2. Live infrastructure state

| Thing | Value |
| --- | --- |
| Supabase project | `jduvfznwahcupuxtywkl` |
| Vercel project | `prj_DA1XLPSGuTVj5XFs5T5xDG2AeLtJ` (team `team_qhnJDGuY9Mwve32mlAf5QdOF`) |
| GCP project | `build3-feedback-sys` (project number `1013582637775`) |
| Chat app name | `build3 kudos bot` (was "build3 Feedback") |
| Chat app status | LIVE, Workspace add-on mode (greyed-out lock — **can't be undone**) |
| Service account | `feedback-notifier@build3-feedback-sys.iam.gserviceaccount.com` (Client ID `113641697436660890437`) |
| DWD scopes (admin.google.com) | `chat.messages.create`, `chat.spaces`, `chat.memberships`, `chat.memberships.app`, plus 2 others ("+2 More" in the UI) |
| `GOOGLE_CHAT_KUDOS_SPACE_ID` | `spaces/AAQA1d87Q_w` (Announcements) — set in both `.env.local` and Vercel production |
| Chat app HTTP endpoint URL (in GCP) | `https://build3.online/api/kudos/react` |
| Chat app Connection settings | **HTTP endpoint URL** (will change to Apps Script — see §3) |
| Chat app Visibility | "Specific people and groups in build3" with `foundation@build3.org` added |

---

## 3. The one open problem

**Symptom**: clicking the "Kudos ++" button in Google Chat shows `"build3 kudos bot is unable to process your request."` No POST hits `/api/kudos/react` on Vercel. Manual `curl` to the same endpoint succeeds (200, logs the event), proving the endpoint and middleware bypass are correct.

**Diagnosis**: Workspace add-on Chat apps configured with "HTTP endpoint URL" as the Connection setting receive `MESSAGE` events fine but silently drop `CARD_CLICKED` events. DailyBot doesn't hit this because it's a regular Marketplace Chat app, not a Workspace add-on. Our app is permanently locked in add-on mode.

**Fix prepared but not executed**: Apps Script proxy. Tiny script (~10 lines) that receives Chat events, POSTs them to `https://build3.online/api/kudos/react`, returns the response back to Chat. Full guide at `docs/APPS_SCRIPT_PROXY.md`. Summary:

1. Create Apps Script project at <https://script.google.com>
2. Paste the `onChatEvent` function (in the guide)
3. Bind it to GCP project `1013582637775`
4. Deploy as Add-on, copy the Deployment ID
5. GCP Chat config → Connection settings → switch from **HTTP endpoint URL** to **Apps Script**, paste deployment ID, save
6. Test: send kudos, click Kudos++, expect celebratory reply in thread

The code that handles the boost (`/api/kudos/react` route) is already deployed and working — verified by manual curl. The Apps Script is purely a transport layer.

**Alternate paths if the user vetoes Apps Script:**
- `openLink` fallback button (opens `/api/kudos/boost?id=<uuid>` in browser, attributes via Supabase session). Code exists and works; was reverted at `a50da3c` because user wanted in-chat.
- Brand new Chat app in a fresh GCP project (NOT add-on mode). Hours of clicking through GCP + admin.google.com. Architecturally cleanest, biggest investment.

---

## 4. What works right now (production)

- Sending kudos via `/feedback?path=kudos` → card posts to Announcements space as **build3 kudos bot** with avatar, GIF, social-proof footer (if any), and the Kudos++ button.
- Persistence: every kudos and recipient written to `kudos` + `kudos_recipients` tables.
- Leaderboard panel on the kudos page (top 5 last 30 days, medals).
- All probation flows: auto-create on sign-in, change duration, submit review, promote, extend, view in `/insights` for any intern.
- `/admin` (renamed from `/glock17`) — control room with all tabs.
- Webhook stub `/api/kudos/react` returns 200 + logs to Vercel.

## What doesn't work yet

- Clicking **Kudos ++** in Chat. (Awaiting Apps Script proxy deploy. See §3.)

---

## 5. Files of note

```
src/
├─ app/
│  ├─ admin/                        ← renamed from glock17
│  ├─ api/
│  │  ├─ admin/probation/           ← new routes (review, promote, extend, duration)
│  │  ├─ auth/callback/route.ts     ← auto-creates probation
│  │  └─ kudos/
│  │     ├─ route.ts                ← POST: persist + send card with button
│  │     ├─ leaderboard/route.ts    ← GET top N
│  │     ├─ react/route.ts          ← Chat callback handler (working, just not reached)
│  │     └─ boost/route.ts          ← web fallback (works)
│  └─ insights/page.tsx             ← embeds ProbationSection for interns
├─ components/
│  ├─ KudosCard.tsx                 ← UI with leaderboard
│  ├─ Navbar.tsx                    ← kudos link restored
│  └─ admin/
│     └─ ProbationSection.tsx       ← used by both /admin and /insights
├─ lib/
│  └─ server/
│     ├─ kudos.ts                   ← persistKudos, recordBoost, getTopRecipients
│     └─ probation.ts               ← all probation logic
└─ middleware.ts                    ← /api/kudos/react bypass added

supabase/schema.sql                 ← mirrored against live DB
docs/
├─ KUDOS_BOT_SETUP.md               ← GCP Chat app config walkthrough
├─ KUDOS_BOT_BROWSER_PROMPT.md      ← AI-browser prompt
├─ APPS_SCRIPT_PROXY.md             ← THE NEXT STEP for in-chat Kudos++
└─ recent.md                        ← this file
scripts/
├─ add-kudos-bot-to-space.ts        ← util: add Chat app to a space via API (worked!)
└─ probe-space.ts                   ← util: check bot membership

(scripts/test-*, scripts/join-space.ts, scripts/send-reminder.ts are gitignored as ad-hoc local tools)
```

---

## 6. Pick up here

If you (or a fresh agent) are continuing this:

1. **Most important**: do `docs/APPS_SCRIPT_PROXY.md`. ~10 min of clicking through script.google.com and GCP. When it's done, Kudos++ button works in chat.
2. After that lands, send a fresh kudos and click the button. Confirm Vercel logs show a POST to `/api/kudos/react` and the chat thread shows `✨ <name> +1'd this kudos! (N boosts so far)`.
3. Sanity-check Vercel env `GOOGLE_CHAT_KUDOS_SPACE_ID` is `spaces/AAQA1d87Q_w` (Announcements). Should already be set.
4. Optionally tighten security on `/api/kudos/react` — once we see `verified: true` tokens land in logs, flip the boost insert to require `auth.verified === true` (currently it's lenient and logs failures).

Anything else open: nothing major. Probation is shipped. Kudos works minus the button.

---

## 7. Helpful command cheatsheet

```bash
# Verify Vercel build + endpoint
curl -s -w 'HTTP %{http_code}\n' https://build3.online/api/kudos/react
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"user":{"email":"test@build3.org"},"action":{"actionMethodName":"boostKudos","parameters":[{"key":"kudosId","value":"<uuid>"}]}}' \
  https://build3.online/api/kudos/react

# Add the bot to any new space (script is committed)
npx tsx scripts/add-kudos-bot-to-space.ts spaces/<SPACE_ID>

# Check bot membership
npx tsx scripts/probe-space.ts spaces/<SPACE_ID>

# Pull recent Vercel logs (when you have MCP access)
# Project ID prj_DA1XLPSGuTVj5XFs5T5xDG2AeLtJ, team team_qhnJDGuY9Mwve32mlAf5QdOF
```

Good luck. The hard parts (DB schema, persistence, leaderboard, social-proof, probation rebuild, navbar, security review, GCP Chat app rename, bot space membership, DWD scopes) are done. The remaining step is purely Google's add-on quirk.
