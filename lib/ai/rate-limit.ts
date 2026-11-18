/**
 * Per-user in-memory rate limit for AI endpoints.
 *
 * All AI routes share the same bucket — LIMIT calls per user per hour
 * across every AI endpoint combined. This caps Anthropic API spend
 * per user regardless of which endpoint they hit.
 *
 * LIMIT raised 20 → 150: the old cap was hit during legitimate intensive
 * clinical work (a cabinet opening many examinations in a row fires
 * investigation-suggestions + anamnesis prefill per exam), which both
 * denied the doctor the AI help and — before the guard in
 * InvestigationRecommender — crashed the examination page on the 429 body.
 * 150/hour comfortably covers an exam-a-minute session with a couple of AI
 * calls each (investigation-suggestions is also cached per examination, so
 * re-opening the same exam costs nothing), while still bounding a runaway
 * loop, which is the reason this limit exists at all.
 *
 * Replace with a Redis-backed implementation when adding Redis.
 */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const LIMIT = 150
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
