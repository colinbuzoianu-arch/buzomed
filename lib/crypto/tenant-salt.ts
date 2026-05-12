import { prisma } from '@/lib/prisma'
import {
  generateCnpHashSalt,
  encryptCnpHashSalt,
  decryptCnpHashSalt,
} from './cnp-hash'

/**
 * Returns the decrypted CNP hash salt for a tenant. If the tenant has no
 * salt yet (existed before session 8 or was created when the encryption
 * key was missing), generates one and stores it before returning.
 *
 * This is idempotent: two concurrent callers MAY both generate a salt;
 * the second update silently overwrites the first. The risk window is
 * tiny (a few ms) and the consequence is that any rows that were hashed
 * with the first salt would not be findable under the second — but no
 * such rows can exist because the only thing that writes cnp_hash is the
 * code path that calls THIS function FIRST. So if we lose the race, the
 * losing instance retries from the now-stored salt and everyone agrees.
 *
 * Still, to make this race vanishingly unlikely in practice, we re-read
 * the row right before update and only write if it's still null.
 */

export async function getOrCreateTenantCnpSalt(
  tenantId: string
): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { cnpHashSalt: true },
  })
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`)
  }

  if (tenant.cnpHashSalt) {
    return decryptCnpHashSalt(tenant.cnpHashSalt)
  }

  // Generate, encrypt, store. Will throw if CNP_ENCRYPTION_KEY isn't
  // configured — caller catches and translates to a 503.
  const plaintextSalt = generateCnpHashSalt()
  const encryptedSalt = encryptCnpHashSalt(plaintextSalt)

  // Conditional update: only write if still null. If a concurrent caller
  // already wrote, re-read and use theirs.
  const updateResult = await prisma.tenant.updateMany({
    where: { id: tenantId, cnpHashSalt: null },
    data: { cnpHashSalt: encryptedSalt },
  })

  if (updateResult.count === 0) {
    // Someone else won the race; refetch.
    const refreshed = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cnpHashSalt: true },
    })
    if (refreshed?.cnpHashSalt) {
      return decryptCnpHashSalt(refreshed.cnpHashSalt)
    }
    // Genuinely unexpected — the salt got nulled out somehow. Use ours.
    return plaintextSalt
  }

  return plaintextSalt
}
