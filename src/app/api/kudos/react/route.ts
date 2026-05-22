import { NextResponse } from "next/server"

/**
 * Stub endpoint for Google Chat app interactive callbacks.
 *
 * The Chat app configuration in GCP has this as a required "HTTP endpoint URL"
 * (interactive features toggled ON). None of our current kudos cards include
 * interactive buttons that would actually trigger a callback here, so in
 * practice this is never hit by users. We keep this stub so:
 *   1. The endpoint URL configured in GCP resolves to 200 instead of 404,
 *      avoiding noise in Google Chat health checks.
 *   2. There's a clear place to wire up real button handlers (e.g. "Kudos++")
 *      if we add them later.
 *
 * Google Chat sends a signed JWT in the Authorization header on real
 * interaction events. Until we implement a button, we just acknowledge.
 */
export async function POST() {
  return NextResponse.json({ text: "OK" })
}

export async function GET() {
  return NextResponse.json({ status: "kudos-react stub — see route.ts" })
}
