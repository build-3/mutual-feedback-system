# Apps Script proxy for Kudos++ button (Workspace add-on workaround)

## Why this exists

Our Chat app is permanently in **Workspace add-on mode** (the "Build this Chat app as a Workspace add-on" checkbox in GCP is checked and greyed out — you cannot uncheck it). Workspace add-on Chat apps route interactive button clicks (`CARD_CLICKED` events) through Apps Script, not through the HTTP endpoint URL. There is no way to make Chat deliver button clicks directly to `https://build3.online/api/kudos/react` while the app is in add-on mode.

The fix: a 5-line Apps Script that runs `onCardClicked`, forwards the event to our HTTP endpoint, and returns whatever we reply with. Apps Script becomes the wire; the business logic stays in Next.js.

## Step 1 — Create the Apps Script project

1. Go to <https://script.google.com> (signed in as a `build3.org` admin)
2. Click **New project**
3. Rename it: **build3 kudos bot — chat handler**
4. Replace the contents of `Code.gs` with the exact code in the next section
5. Save (⌘S / Ctrl+S)

## Step 2 — Paste this code

```javascript
const ENDPOINT = 'https://build3.online/api/kudos/react';

/**
 * Entry point for all Chat events when the app is configured to use
 * this Apps Script as its deployment backend.
 *
 * For Workspace add-on Chat apps, this is where CARD_CLICKED events
 * land. We just forward the event JSON to our Next.js endpoint and
 * return its JSON response back to Chat.
 */
function onChatEvent(event) {
  try {
    const res = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(event),
      muteHttpExceptions: true,
      followRedirects: false,
    });
    const code = res.getResponseCode();
    const body = res.getContentText();
    if (code >= 200 && code < 300) {
      return JSON.parse(body);
    }
    Logger.log('Proxy got ' + code + ': ' + body);
    return { text: 'Kudos bot proxy got a non-2xx (' + code + ').' };
  } catch (err) {
    Logger.log('Proxy threw: ' + err);
    return { text: 'Kudos bot proxy hit an error.' };
  }
}
```

## Step 3 — Configure the Apps Script project for Chat

1. In the Apps Script editor, click the **⚙ Project settings** icon (left sidebar).
2. Scroll to **Google Cloud Platform (GCP) project** → **Change project**.
3. Paste the GCP project number: **`1013582637775`** (the same project that owns the Chat app).
4. Click **Set project**. Confirm if prompted.
5. Click **OAuth scopes** in the same Project settings panel. Ensure **`https://www.googleapis.com/auth/script.external_request`** is listed — Apps Script needs this to make outbound HTTPS calls. (It auto-adds when the code uses `UrlFetchApp.fetch`, but verify.)

## Step 4 — Deploy

1. Click **Deploy** (top-right) → **New deployment**.
2. Click the ⚙ icon next to **Select type** → choose **Add-on**.
3. **Description**: `build3 kudos bot — Chat event handler`
4. Click **Deploy**.
5. Copy the **Deployment ID** that's shown (looks like `AKfycb...` — a long string). Save it — you'll need it for Step 5.

## Step 5 — Point the GCP Chat app at the Apps Script

1. Go to <https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=build3-feedback-sys>
2. Scroll to **Connection settings**.
3. Change the radio from **HTTP endpoint URL** to **Apps Script**.
4. In the **Apps Script project deployment ID** field, paste the Deployment ID from Step 4.
5. Click **Save** at the bottom.

## Step 6 — Test

1. Hit `https://build3.online/feedback?path=kudos`.
2. Send a kudos to yourself + one other person.
3. In the kudos chat space, click **Kudos ++** on the card.
4. Expected: chat shows `✨ <your name> +1'd this kudos! (1 boost so far)`.

If it fails, check:
- Apps Script logs: <https://script.google.com> → your project → **Executions** tab — shows any errors from the proxy
- Vercel logs filtered to `/api/kudos/react` — should now show a POST landing within 1 second of each click

## How sending kudos still works

We post kudos cards from `/api/kudos` directly via the Chat REST API — that's outbound and doesn't depend on the Connection settings at all. Switching Connection settings from "HTTP endpoint URL" to "Apps Script" only changes where Chat *delivers events to us*, not where we *send messages from*.

## If you ever want to retire this

Once the Chat app is migrated off Workspace add-on mode (which requires creating a new Chat app in a fresh GCP project), this Apps Script becomes obsolete — flip the Connection setting back to HTTP endpoint URL, delete the Apps Script deployment.
