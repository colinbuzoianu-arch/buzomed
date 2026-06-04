const store = new Map<string, { count: number; resetAt: number }>()

const LIMIT = 1000
const WINDOW_MS = 60 * 60 * 1000

export function checkApiRateLimit(
  keyId: string
): { allowed: boolean; remaining: number; limit: number } {
  const now = Date.now()
  let entry = store.get(keyId)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS }
    store.set(keyId, entry)
  }
  if (entry.count >= LIMIT) return { allowed: false, remaining: 0, limit: LIMIT }
  entry.count++
  return { allowed: true, remaining: LIMIT - entry.count, limit: LIMIT }
}
