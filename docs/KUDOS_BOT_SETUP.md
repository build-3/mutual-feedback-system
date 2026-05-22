# build3 kudos bot — Google Chat setup

This guide walks you through configuring the **build3 kudos bot** in Google Workspace so kudos messages post to your team's chat space with a branded bot identity (name, avatar, link) instead of an anonymous webhook.

The app *already* sends Chat cards via `sendCardToSpace()` using app identity (a service-account JWT, no human impersonation). What you're doing here is naming and branding that identity in the Google Workspace Console.

---

## Prerequisites

- You are a **Google Workspace admin** at `build3.org` (or have an admin willing to click).
- A **GCP project** that already holds the service account currently used by this app. The service account email is in the `GOOGLE_SERVICE_ACCOUNT_EMAIL` env var. Confirm by running locally:
  ```bash
  grep GOOGLE_SERVICE_ACCOUNT_EMAIL .env.local
  ```
- The Google Chat space ID you want kudos posted to. It's in the `GOOGLE_CHAT_KUDOS_SPACE_ID` env var (looks like `AAAAxxxxxxxx`).
- A square logo image (PNG, ≥256×256) for the bot avatar. The current `apple-icon.png` at the repo root works.

---

## Step 1 — Enable the Google Chat API

1. Open the **GCP project** that owns your service account: <https://console.cloud.google.com/>
2. Project picker (top bar) → select the right project.
3. Hamburger menu → **APIs & Services → Library**.
4. Search **"Google Chat API"** → click it → **Enable**.

If it's already enabled, skip.

---

## Step 2 — Configure the Chat app

1. In the same project, go to: <https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat>
   (Or: **APIs & Services → Enabled APIs → Google Chat API → Configuration**.)

2. Fill in **App info**:
   - **App name**: `build3 kudos bot`
   - **Avatar URL**: paste a publicly reachable URL to your logo. The easiest option: drop the logo into the repo at `public/kudos-bot-avatar.png`, deploy, and use:
     ```
     https://<your-vercel-domain>/kudos-bot-avatar.png
     ```
     Or use the existing `https://build3.online/apple-icon.png`.
   - **Description**: `Posts team kudos with a celebration GIF.`

3. **Functionality**:
   - ☑ **Receive 1:1 messages** — leave OFF (no DM bot needed).
   - ☑ **Join spaces and group conversations** — turn **ON**. This lets the bot be added to your kudos space.

4. **Connection settings**: choose **App URL** and leave it blank for now. We're not handling interactive button clicks in v1; the app pushes cards, no callbacks.
   - If you later want the "Kudos++" button to be clickable, you'll add an HTTPS endpoint here (e.g. `https://<your-domain>/api/kudos/interactive`).

5. **Visibility**:
   - Select **"Make this Chat app available to specific people and groups in your domain"**.
   - Add your domain (`build3.org`) or specific groups.
   - Do **not** publish to Marketplace.

6. Hit **Save**.

---

## Step 3 — Add the bot to the kudos space

In Google Chat (`chat.google.com`):

1. Open the space you want kudos posted to (the one whose ID is in `GOOGLE_CHAT_KUDOS_SPACE_ID`).
2. Click the space name (top of the screen) → **Apps & integrations** → **Add apps**.
3. Search **build3 kudos bot** → **Add**.

The bot is now a member of the space. Any card sent via the app identity will show up with the name **build3 kudos bot** and your chosen avatar.

---

## Step 4 — Verify

From a teammate's machine:

1. Hit `/feedback?path=kudos`.
2. Send a kudos to yourself + one other person.
3. Check the kudos space in Google Chat.

Expected:
- Author of the message reads as **build3 kudos bot** (not the webhook name, not anonymous).
- Per-recipient mini-cards stack with profile photos and "✨ Congrats!".
- GIF + the kudos message appear under the last card.
- If you've sent kudos before, a footer line reads: *"Alice, Bob, Carol and 2 more have given kudos too."*

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Cards show up but author is "App" or empty | Bot not added to the space | Step 3 |
| 403 from `messages.create` | Chat API not enabled, or app not configured | Step 1, Step 2 |
| 404 on space ID | `GOOGLE_CHAT_KUDOS_SPACE_ID` is wrong | Copy the space ID from `chat.google.com` URL (looks like `spaces/AAAA…` — only paste the part after `spaces/`) |
| Avatar shows broken-image | Avatar URL not publicly fetchable | Use a deployed asset (Vercel public path) or a CDN URL |
| "service account does not have permission" | Service account missing the `chat.spaces` / `chat.messages.create` scopes on the JWT, or app not visible to the domain | Step 2 (Visibility) + verify `CHAT_SCOPES` in `src/lib/server/google-chat.ts` |

---

## Env vars referenced

| Var | What it is |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account that owns the bot identity |
| `GOOGLE_PRIVATE_KEY` | Service account private key (PEM) |
| `GOOGLE_CHAT_SENDER_EMAIL` | Human user the SA impersonates for DM sends (not used for the kudos card — that uses app identity) |
| `GOOGLE_CHAT_KUDOS_SPACE_ID` | The Chat space the bot posts kudos into |

---

## What's *not* in this setup

- **Interactive "Kudos++" button**: requires implementing a webhook endpoint that Google Chat hits when the button is clicked, plus signature verification. Out of scope for v1 — the social-proof footer already shows previous senders.
- **Slash commands** (e.g. `/kudos @alice for shipping X`): also possible, but adds complexity. Use the web UI for now.
- **Bot DMs**: kept off intentionally. The probation/birthday notifiers use a different code path (`sendDirectMessage`) which impersonates a human sender.
