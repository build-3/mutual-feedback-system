import "server-only"

type RateLimitEntry = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitEntry>()
const MAX_BUCKET_SIZE = 10_000
const CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = Date.now()

function evictExpiredEntries() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return
  }
  lastCleanup = now
  const keys = Array.from(buckets.keys())
  for (let i = 0; i < keys.length; i++) {
    const entry = buckets.get(keys[i])
    if (entry && now > entry.resetAt) {
      buckets.delete(keys[i])
    }
  }
  // If still over limit after expiry sweep, drop entries with lowest resetAt
  if (buckets.size > MAX_BUCKET_SIZE) {
    const excess = buckets.size - MAX_BUCKET_SIZE
    const allKeys = Array.from(buckets.keys())
    const oldestKeys: { key: string; resetAt: number }[] = []

    for (let i = 0; i < allKeys.length; i++) {
      const key = allKeys[i]
      const entry = buckets.get(key)!
      if (oldestKeys.length < excess) {
        oldestKeys.push({ key, resetAt: entry.resetAt })
      } else {
        // Find the newest entry in our "oldest" list
        let maxIdx = 0
        for (let j = 1; j < oldestKeys.length; j++) {
          if (oldestKeys[j].resetAt > oldestKeys[maxIdx].resetAt) {
            maxIdx = j
          }
        }
        if (entry.resetAt < oldestKeys[maxIdx].resetAt) {
          oldestKeys[maxIdx] = { key, resetAt: entry.resetAt }
        }
      }
    }

    for (let i = 0; i < oldestKeys.length; i++) {
      buckets.delete(oldestKeys[i].key)
    }
  }
}

export function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim() || "unknown"
}

export function consumeRateLimit({
  bucket,
  key,
  limit,
  windowMs,
}: {
  bucket: string
  key: string
  limit: number
  windowMs: number
}) {
  evictExpiredEntries()

  const now = Date.now()
  const bucketKey = `${bucket}:${key}`
  const entry = buckets.get(bucketKey)

  if (!entry || now > entry.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }

  entry.count += 1
  if (entry.count >= limit) {
    return {
      allowed: false,
      retryAfterMs: Math.max(entry.resetAt - now, 0),
    }
  }

  return { allowed: true, retryAfterMs: 0 }
}
