import "server-only"

import { createHmac } from "crypto"

const COOKIE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "fallback-dev-secret"

export function signValue(value: string): string {
  const sig = createHmac("sha256", COOKIE_SECRET).update(value).digest("hex")
  return `${value}.${sig}`
}

export function verifySignedValue(raw: string): string | null {
  const lastDot = raw.lastIndexOf(".")
  if (lastDot === -1) return null
  const value = raw.slice(0, lastDot)
  const sig = raw.slice(lastDot + 1)
  const expected = createHmac("sha256", COOKIE_SECRET).update(value).digest("hex")
  if (sig.length !== expected.length) return null
  let mismatch = 0
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0 ? value : null
}
