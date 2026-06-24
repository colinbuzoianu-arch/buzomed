/**
 * Per-user in-memory rate limit for AI endpoints.
 *
 * All AI routes share the same bucket — 20 calls per user per hour
 * across every AI endpoint combined. This caps Anthropic API spend
 * per user regardless of which endpoint they hit.
 *
 * Replace with a Redis-backed implementation when adding Redis.
 */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const LIMIT = 20
const WINDOW_MS = 60 * 60 * 1000 // 1 hour

/**
 * Returns true and increments the counter if the user is under the limit.
 * Returns false if the limit is already reached for the current window.
 */
export function checkAiRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= LIMIT) return false
  entry.count++
  return true
}
