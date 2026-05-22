# Browser-AI prompt — set up the build3 kudos bot

Copy-paste the block below into your AI browser (Claude in Chrome, Comet, Arc AI, etc.) once you're signed in to Google with your `build3.org` admin account. The agent will walk through the GCP Console and Google Chat to configure the bot.

---

```
You are configuring a Google Chat app called "build3 kudos bot" inside an
existing GCP project. I am signed in as a Google Workspace admin at build3.org.
Do the steps below in order. Pause and ASK ME whenever you need a value I
haven't given you. Do not invent values. After each major step, take a
screenshot and tell me what you did.

============================================================
GOAL
============================================================
Configure the Google Chat API in our GCP project so messages our app sends
via service-account JWT (app identity) show up in Google Chat with:
  - Display name: "build3 kudos bot"
  - A custom avatar (square PNG, public URL)
  - Visibility: limited to build3.org
  - Added as a member of one specific Google Chat space

============================================================
WHAT I WILL GIVE YOU WHEN ASKED
============================================================
- The GCP project name/ID that owns our service account
- A public URL to the bot avatar PNG (256x256+)
- The Google Chat space name where kudos should be posted
- (Optional) The space ID if you can't find the space by name

============================================================
STEP 1 — Pick the right GCP project
============================================================
1. Go to https://console.cloud.google.com/
2. At the top, click the project picker.
3. ASK ME which project to select (read out the list of projects you see).
4. Select that project. Confirm it's active by checking the title bar.

============================================================
STEP 2 — Enable the Google Chat API
============================================================
1. Go to https://console.cloud.google.com/apis/library/chat.googleapis.com
2. If the page shows "ENABLE", click it. If it shows "MANAGE", it's already
   enabled — skip to Step 3.
3. Wait for the API to enable, then continue.

============================================================
STEP 3 — Open the Chat API configuration page
============================================================
1. Go to https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat
2. You should land on the "Configuration" tab. If you land somewhere else,
   click the "Configuration" tab in the left sidebar.

============================================================
STEP 4 — Fill in App info
============================================================
Set the following fields EXACTLY:

  - App name:        build3 kudos bot
  - Avatar URL:      ASK ME for the avatar URL (will be a fully qualified
                     https:// link to a PNG, e.g.
                     https://build3.online/apple-icon.png).
                     Paste it as-is. Do not modify the URL.
  - Description:     Posts team kudos with a celebration GIF.

============================================================
STEP 5 — Functionality
============================================================
- "Receive 1:1 messages":  UNCHECK / leave OFF.
- "Join spaces and group conversations":  CHECK / turn ON.

============================================================
STEP 6 — Connection settings
============================================================
- Choose "App URL" (also labelled "HTTP endpoint URL" in some versions).
- Leave the URL field BLANK.
- If forced to enter a URL to save: ASK ME. Do not invent a URL.

============================================================
STEP 7 — Visibility
============================================================
- Select "Make this Chat app available to specific people and groups in your
  domain".
- In the "People and groups" field, type: build3.org
- Pick the entry that resolves to the domain (not an individual user).
- Do NOT publish to the Google Workspace Marketplace.

============================================================
STEP 8 — Save
============================================================
Click "Save" at the bottom. If it errors, read the error to me and ASK ME
how to proceed.

============================================================
STEP 9 — Add the bot to the kudos chat space
============================================================
1. Open https://chat.google.com/ in a new tab.
2. ASK ME the name of the Google Chat space where kudos should be posted.
3. Open that space.
4. Click the space name at the top → "Apps & integrations" → "Add apps".
5. Search "build3 kudos bot". Click "Add".
6. Confirm the bot appears in the space's member list.

============================================================
STEP 10 — Capture the space ID and report back
============================================================
1. With the kudos space open in chat.google.com, look at the URL bar.
   It will contain something like:
       https://mail.google.com/chat/u/0/#chat/space/AAAA1234abcd
       or
       https://chat.google.com/room/AAAA1234abcd
2. The string AFTER /space/ or /room/ is the space ID. Copy it.
3. Report back to me:
   - The exact space ID (so I can set GOOGLE_CHAT_KUDOS_SPACE_ID).
   - Whether the bot was successfully added to the space.
   - Any warnings or errors you saw during setup.
   - Screenshots of: the Chat API configuration page after saving, and
     the space member list showing "build3 kudos bot".

============================================================
RULES
============================================================
- If a step asks for a value I haven't given, STOP and ASK ME.
- Never publish to the Marketplace.
- Never enable "Receive 1:1 messages" — kudos is a space-only feature.
- Never paste a placeholder URL where a real URL is required. Ask first.
- If you encounter a permission error, stop and tell me which account is
  currently signed in. The admin must be a Google Workspace admin at
  build3.org.
- Do not change anything else in the GCP project (other API configs,
  billing, IAM, etc.). Stay strictly inside the Chat API configuration page.
```

---

## What I'll give the agent when it asks

Have these ready before you start:

| Prompt asks for | Where to find it |
| --- | --- |
| GCP project | `echo $GCP_PROJECT_ID` in your env, or check the project that owns `GOOGLE_SERVICE_ACCOUNT_EMAIL` |
| Avatar URL | Easiest: `https://build3.online/apple-icon.png`. Or upload a 256×256 PNG to `public/kudos-bot-avatar.png`, deploy, and use that URL. |
| Kudos space name | Whatever you've called it in Google Chat — e.g. "build3 kudos" or "team-celebration" |

## After the agent finishes

It should hand back a **space ID** (e.g. `AAAA1234abcd`). Set it as the `GOOGLE_CHAT_KUDOS_SPACE_ID` env var in Vercel:

```
vercel env add GOOGLE_CHAT_KUDOS_SPACE_ID
# paste the space ID when prompted
vercel deploy --prod  # or wait for the next push to redeploy
```

Then hit `/feedback?path=kudos`, send a test kudos, and check the Chat space — the message author should now read **build3 kudos bot** with your avatar.
