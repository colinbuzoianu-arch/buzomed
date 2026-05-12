import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM encryption for CNP values (and other sensitive PII later).
 *
 * Format of the stored ciphertext:
 *   base64( IV (12 bytes) || authTag (16 bytes) || ciphertext )
 *
 * GCM is authenticated encryption — any tampering with the stored bytes
 * causes `decryptCnp` to throw rather than silently return wrong data.
 *
 * Key source: `CNP_ENCRYPTION_KEY` env var, 32 bytes base64. Generate one:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * This is project-wide single-key encryption. The threat model:
 *
 *   PROTECTED AGAINST: leak of database snapshots, read-only access to
 *     Postgres without the application server. Anyone reading the
 *     `cnp_encrypted` column sees opaque bytes.
 *
 *   NOT PROTECTED AGAINST: full compromise of the application host
 *     (env vars + DB). An attacker with both has the key and can
 *     decrypt everything. This is the same trust model as every
 *     server-side-encrypted SaaS.
 *
 *   FUTURE UPGRADE PATH: per-tenant wrapped keys. Each tenant gets a
 *     unique DEK encrypted at rest with a KEK (the current env-var
 *     key). Migrate by reading with this single-key path, writing with
 *     wrapped-key path. The on-disk format would include a key
 *     identifier prefix so old ciphertexts remain decryptable during
 *     transition.
 *
 * Performance: AES-GCM with a 13-character input runs in microseconds.
 * No reason to cache.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // 96 bits — recommended for GCM
const AUTH_TAG_BYTES = 16
const KEY_BYTES = 32 // 256 bits

let cachedKey: Buffer | null = null

function loadKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.CNP_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'CNP_ENCRYPTION_KEY is not set. Generate one with: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CNP_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). ` +
        'Regenerate with the command above.'
    )
  }
  cachedKey = key
  return key
}

/**
 * Encrypts a CNP (or any string) and returns the encoded payload.
 * The caller stores this verbatim in `cnp_encrypted`.
 */
export function encryptCnp(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptCnp: plaintext must be a non-empty string')
  }
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/**
 * Decrypts a previously-encrypted payload. Throws if the input is
 * malformed, the auth tag doesn't verify, or the key has changed.
 *
 * Callers MUST verify they're authorized to decrypt (see
 * `lib/permissions/tenant-data.ts#canViewSensitivePii`) before invoking.
 * This function does not enforce authorization itself; it's a pure
 * cryptographic primitive.
 */
export function decryptCnp(encoded: string): string {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error('decryptCnp: input must be a non-empty string')
  }
  const key = loadKey()
  const blob = Buffer.from(encoded, 'base64')
  if (blob.length < IV_BYTES + AUTH_TAG_BYTES + 1) {
    throw new Error('decryptCnp: ciphertext too short to be valid')
  }
  const iv = blob.subarray(0, IV_BYTES)
  const tag = blob.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
  const ciphertext = blob.subarray(IV_BYTES + AUTH_TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/**
 * Defensive check used in startup paths / health checks. Returns true if
 * `CNP_ENCRYPTION_KEY` is set and validly formatted, false otherwise.
 * Doesn't throw.
 */
export function isCnpEncryptionConfigured(): boolean {
  try {
    loadKey()
    return true
  } catch {
    return false
  }
}
