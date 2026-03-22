import { timingSafeEqual } from "crypto"

const adminUser = process.env.APP_BASIC_AUTH_USER
const adminPassword = process.env.APP_BASIC_AUTH_PASSWORD

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still run timingSafeEqual against itself to keep constant-ish timing
    const buf = Buffer.from(a)
    timingSafeEqual(buf, buf)
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export function isBasicAuthConfigured() {
  return Boolean(adminUser && adminPassword)
}

export function shouldBypassBasicAuth() {
  return process.env.NODE_ENV !== "production" && !isBasicAuthConfigured()
}

function decodeAuthorizationHeader(header: string | null) {
  if (!header?.startsWith("Basic ")) {
    return null
  }

  const encoded = header.slice("Basic ".length).trim()
  const decoded =
    typeof atob === "function"
      ? atob(encoded)
      : Buffer.from(encoded, "base64").toString("utf8")
  const separatorIndex = decoded.indexOf(":")

  if (separatorIndex < 0) {
    return null
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  }
}

export function isAuthorizedRequest(header: string | null) {
  if (shouldBypassBasicAuth()) {
    return true
  }

  if (!isBasicAuthConfigured()) {
    return false
  }

  const credentials = decodeAuthorizationHeader(header)
  if (!credentials) {
    return false
  }

  return (
    safeCompare(credentials.username, adminUser!) &&
    safeCompare(credentials.password, adminPassword!)
  )
}

export function getBasicAuthChallengeHeaders() {
  return {
    "Cache-Control": "no-store",
    "WWW-Authenticate": 'Basic realm="build3 admin", charset="UTF-8"',
  }
}
