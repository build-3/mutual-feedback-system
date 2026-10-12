import "server-only"

import { createHmac, timingSafeEqual } from "crypto"

/**
 * Signs the podium image URL.
 *
 * Google Chat fetches a card's image itself, with no session and no header we
 * control, so the URL has to carry its own proof. It is signed per cycle with
 * CRON_SECRET: a link works for the cycle it was made for and nothing else, and
 * nobody can produce one without the secret.
 */
function signature(cycleKey: string): string {
  const secret = process.env.CRON_SECRET ?? ""
  return createHmac("sha256", secret).update(`leaderboard-image:${cycleKey}`).digest("hex").slice(0, 32)
}

export function leaderboardImageUrl(appUrl: string, cycleKey: string): string {
  // v changes on every post so Chat never shows an image it cached earlier.
  return `${appUrl}/api/leaderboard/image?c=${cycleKey}&s=${signature(cycleKey)}&v=${Date.now()}`
}

export function isValidImageSignature(cycleKey: string, sig: string): boolean {
  if (!process.env.CRON_SECRET) return false
  const expected = Buffer.from(signature(cycleKey))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
