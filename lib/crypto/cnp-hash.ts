import { createHmac, randomBytes } from 'node:crypto'
import { encryptCnp, decryptCnp } from './cnp-cipher'

/**
 * Tenant-salted HMAC-SHA-256 for CNP lookup.
 *
 * Why HMAC and not plain SHA-256:
 *   - CNP space is only ~10^13 values (13 digits, structured). A plain
 *     SHA-256 lookup table is precomputable in hours. HMAC requires the
 *     attacker to also know the salt.
 *
 * Why a SECRET per-tenant salt and not a plain per-row salt:
 *   - For lookup ("does this CNP already exist?") we need a deterministic
 *     hash. Per-row salt breaks deterministic lookup. So the salt has to
 *     be per-tenant.
 *   - If the salt were public, the attacker still gets to precompute a
 *     rainbow table per tenant. With ~10^13 CNPs and SHA-256 speeds, a
 *     dedicated attacker would crack a tenant's table in days. So the
 *     salt must be secret.
 *
 * How we keep the salt secret: it lives in the `tenants.cnp_hash_salt`
 * column, encrypted with the same `CNP_ENCRYPTION_KEY` as the CNPs
 * themselves. An attacker with read-only DB access sees encrypted bytes;
 * an attacker with the env-var key has everything anyway.
 *
 * Threat model: this defends against DB-only compromise. It doesn't add
 * protection against application-host compromise (already covered by the
 * cipher's threat model).
 */

const HASH_ALGORITHM = 'sha256'
const SALT_BYTES = 32 // 256 bits, well over what HMAC-SHA-256 needs

/**
 * Generates a fresh random salt (raw 32 bytes, base64-encoded for storage).
 * Called once at tenant creation time. The returned value is then encrypted
 * with `encryptCnpHashSalt` before being written to `tenants.cnp_hash_salt`.
 */
export function generateCnpHashSalt(): string {
  return randomBytes(SALT_BYTES).toString('base64')
}

/**
 * Encrypts a tenant's hash salt for storage. Uses the same cipher as
 * CNPs themselves — convenient because we only need one key in the env.
 */
export function encryptCnpHashSalt(plaintextSalt: string): string {
  return encryptCnp(plaintextSalt)
}

/**
 * Decrypts a stored salt. Called once per request (or fewer, cached at
 * the route handler level) to fetch the tenant's salt before hashing.
 */
export function decryptCnpHashSalt(encryptedSalt: string): string {
  return decryptCnp(encryptedSalt)
}

/**
 * HMAC-SHA-256 a CNP under the given tenant salt. Output is base64,
 * stored in `employees.cnp_hash` and indexed via
 * `@@index([tenantId, cnpHash])`.
 *
 * Tip: keep the order of calls predictable. The route handler does:
 *   1. fetch the tenant row, decrypt its salt
 *   2. compute the hash for the incoming CNP
 *   3. query employees by (tenantId, cnpHash)
 *
 * Step 1 can be done once per request and reused across multiple CNPs.
 */
export function hashCnp(cnp: string, decryptedSalt: string): string {
  if (typeof cnp !== 'string' || cnp.length === 0) {
    throw new Error('hashCnp: cnp must be a non-empty string')
  }
  if (typeof decryptedSalt !== 'string' || decryptedSalt.length === 0) {
    throw new Error('hashCnp: salt must be a non-empty string')
  }
  const saltBytes = Buffer.from(decryptedSalt, 'base64')
  const hmac = createHmac(HASH_ALGORITHM, saltBytes)
  hmac.update(cnp, 'utf8')
  return hmac.digest('base64')
}
