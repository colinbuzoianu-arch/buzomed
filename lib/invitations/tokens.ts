import { randomBytes, createHash } from 'crypto'

/**
 * Invitation token utilities.
 *
 * Design:
 * - Plaintext token is generated server-side, included in the email URL,
 *   and never stored in the database.
 * - Database stores SHA-256 hash of the token. When someone clicks an
 *   accept link, we hash the URL's token and look up by the hash.
 * - 32 bytes of randomness (256 bits) encoded as URL-safe base64 ≈ 43 chars.
 *   Far beyond brute-force; collision probability is negligible.
 *
 * SHA-256 is appropriate here (not bcrypt/argon2). Tokens are high-entropy
 * random strings, not low-entropy passwords. Slow hashing buys nothing.
 */

const TOKEN_BYTES = 32

export interface GeneratedToken {
  /** Plain token. Use ONLY in the email URL. Never store. */
  plain: string
  /** SHA-256 hash. Store this in the database. */
  hash: string
}

/**
 * Generate a fresh invitation token + its hash.
 */
export function generateInvitationToken(): GeneratedToken {
  const buffer = randomBytes(TOKEN_BYTES)
  const plain = base64UrlEncode(buffer)
  const hash = hashToken(plain)
  return { plain, hash }
}

/**
 * Hash a plaintext token (e.g., one received from an accept URL) so it
 * can be compared against `Invitation.tokenHash` in the database.
 */
export function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

/**
 * URL-safe base64 encoding. Replaces +/= with -_ and strips padding.
 * Result is safe to use directly in URLs without further encoding.
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
