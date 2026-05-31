# Incident Report — Birthday Google Chat message did not send (2026-05-31)

**Status:** Root cause identified. Fix NOT yet deployed (per request).
**Severity:** Low (no data loss; cosmetic/team-experience miss).
**Author:** diagnosis session, 2026-05-31

---

## 1. What was supposed to happen today

Today is **2026-05-31 — the last day of the month**. The project defines four Vercel
cron jobs (`vercel.json`). Two are birthday-related and were due to run today:

| Cron path | Schedule (UTC) | Local (IST) | Fired today? | What it does |
|---|---|---|---|---|
| `/api/cron/birthday-monthly` | `30 11 28-31 * *` | 17:00 | **Yes — was due ~11:30 UTC** | On the last day of the month, post a "next month's birthdays" roundup to the Chat space |
| `/api/cron/birthday-eve` | `30 11 * * *` | 17:00 | Yes (daily) | Day-before reminder for tomorrow's birthdays |
| `/api/cron/birthday` | `30 3 * * *` | 09:00 | Yes (daily) | Day-of "Happy Birthday" card |
| `/api/cron/session-reminder` | `0 3 * * 1` | Mondays | n/a | Unrelated |

The **monthly roundup** was the message expected today. With current data it should
have announced the only June birthday:

- **Sanya Kalani — June 21** (`sk@build3.org`, active)

(For reference, the other near-term birthday, Sarthak Agarwal — May 17, was already in
the past and predates the feature shipping on ~May 22.)

It never posted.

---

## 2. Root cause

**The Next.js middleware blocks the two newer cron endpoints before their route handlers
ever run.** Vercel triggers a cron by making an HTTP `GET` to the path — and that request
passes through `src/middleware.ts` like any other request. The middleware requires a
logged-in Supabase user session for every `/api/*` route unless the path is explicitly
allow-listed.

The allow-list in [`src/middleware.ts:44`](../src/middleware.ts) only exempts **three** paths:

```ts
if (pathname === '/api/cron/birthday')          return NextResponse.next({ request }) // ✅
if (pathname === '/api/cron/session-reminder')  return NextResponse.next({ request }) // ✅
if (pathname === '/api/kudos/react')            return NextResponse.next({ request }) // ✅
```

It is **missing**:

- `/api/cron/birthday-eve` ❌
- `/api/cron/birthday-monthly` ❌

So when Vercel's cron invoker hits `/api/cron/birthday-monthly`, there is no user session,
and the middleware short-circuits with:

```ts
if (!user && isApiRoute) {
  return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
}
```

The route handler — which checks `CRON_SECRET`, queries birthdays, and posts the card —
**never executes.**

### Direct proof

Hitting the production endpoint right now returns the **middleware's** error, not the
route's:

```
$ curl https://build3.online/api/cron/birthday-monthly
HTTP 401
{"error":"Authentication required."}
```

The route's own rejection messages are `"Unauthorized."` or `"CRON_SECRET not configured."`
— neither of which we see. The `"Authentication required."` string exists only in the
middleware. This confirms the request dies at the middleware layer.

### Corroborating evidence

- **`birthday_notifications` table is completely empty** — zero rows since the feature
  shipped. The handlers log every successful send here; nothing was ever logged because
  they never ran.
- **No cron runtime logs** in Vercel over the last 7 days for these paths.
- The two broken endpoints are *exactly* the two missing from the allow-list. The one
  day-of endpoint that **is** allow-listed (`/api/cron/birthday`) simply had no recipient
  whose birthday fell on a day after the feature shipped, so it correctly did nothing.

### Why this slipped through

The birthday feature was added in commit `64e9f78` ("feat(birthday): automated birthday
notifications…") with three cron routes, but the middleware allow-list was only updated
for `/api/cron/birthday`, not for `-eve` and `-monthly`. The allow-list is a hand-maintained
list of exact-string matches, so adding a new cron route silently fails closed unless
someone remembers to also edit the middleware.

---

## 3. The fix (not yet applied)

Two options — recommend **B**.

**Option A — minimal, matches existing style.** Add the two missing paths to
`src/middleware.ts`:

```ts
if (pathname === '/api/cron/birthday-eve')      return NextResponse.next({ request })
if (pathname === '/api/cron/birthday-monthly')  return NextResponse.next({ request })
```

**Option B — prefix match, future-proof (recommended).** Replace the per-path cron lines
with a single prefix check so *any* current or future cron route is exempt automatically:

```ts
// Vercel cron — each route authenticates itself via CRON_SECRET, never user session
if (pathname.startsWith('/api/cron/')) {
  return NextResponse.next({ request })
}
```

This is safe because every `/api/cron/*` handler already verifies the `CRON_SECRET` Bearer
token itself, so removing the user-session gate does not expose them.

### After deploying, verify (don't wait a month)

1. Manually trigger via the admin "monthly roundup" button, **or** curl with the secret:
   ```
   curl -H "Authorization: Bearer $CRON_SECRET" https://build3.online/api/cron/birthday-monthly
   ```
   Expect `{"sent":true,"nextMonth":"June","people":["Sanya Kalani"],...}`.
2. Confirm a card appears in the Chat space.
3. Confirm a new row in `birthday_notifications`.

Because the roundup is idempotent (it checks for an existing `monthly_roundup` row for the
month before sending), today's missed June roundup can be sent manually once the fix is
live without risk of duplicates.

---

## 4. How to avoid this in the future

1. **Make cron auth structural, not a hand-maintained list.** Adopt Option B
   (`startsWith('/api/cron/')`). New cron routes then can't be silently blocked by a
   forgotten middleware edit. This is the single highest-leverage change.

2. **Add a smoke test / checklist item for new protected routes.** Any new `/api/*` route
   that is meant to be called by a machine (cron, webhook, Chat callback) must be paired
   with a middleware allow-list entry. A one-line PR checklist or a unit test that asserts
   every path in `vercel.json` `crons` is allow-listed by the middleware would have caught
   this.

3. **Alert on cron failures.** Crons currently fail completely silently — a 401 produces
   no error in our DB and no notification. Options:
   - Have each cron `console.error` on non-2xx and wire a Vercel log drain / alert.
   - A lightweight heartbeat: a weekly check that `birthday_notifications` (or a generic
     `cron_runs` table) has recent rows; alert if a cron that should have fired didn't.
   - Vercel dashboard → Cron Jobs tab shows each invocation's status code; a 401 there is
     the canary. Worth a periodic glance, or scrape via API.

4. **Test crons end-to-end at ship time**, not on their natural schedule. A monthly cron
   that's only exercised on the 28th–31st can sit broken for weeks. Use the admin manual
   trigger buttons (which already exist) immediately after deploying any cron change.

5. **Consider a `cron_runs` audit table** that every cron writes to on *entry* (before any
   work), so "the function started" is observable independently of "the function found work
   to do." Today an empty `birthday_notifications` is ambiguous between "never ran" and "ran
   but nobody had a birthday."

---

## 5. Timeline / scope of impact

- **~May 22, 2026** — birthday feature deployed; `-eve` and `-monthly` crons broken from
  day one (never able to post).
- **May 28–31, 2026** — monthly roundup cron fired each eligible day and was 401'd each time.
- **May 31, 2026** — June roundup (Sanya Kalani, June 21) missed. Detected.
- **Day-of birthday cron** (`/api/cron/birthday`) is *not* affected and would work for any
  birthday going forward.

No user data was lost or corrupted. Impact is limited to the team missing automated
birthday announcements in the Chat space.
