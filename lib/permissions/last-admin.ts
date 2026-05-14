import type { PrismaClient, UserRole } from '@prisma/client'

/**
 * Last-admin guard.
 *
 * Prevents an action that would leave a tenant without ANY active
 * practice_admin. Three operations require this check:
 *
 *   - Demoting a user (removing 'practice_admin' from their roles)
 *   - Deactivating a user (isActive: false)
 *   - Archiving a user (deletedAt set)
 *
 * Logic: count the number of other ACTIVE, non-archived practice_admins
 * in the tenant. If the count is 0 AND the target user is a
 * practice_admin AND the operation would remove their admin power,
 * reject.
 *
 * "Other" excludes the target itself — we're checking who would remain
 * after this operation.
 *
 * Note: super_admins don't count toward the "active practice_admin"
 * tally. A tenant must have its OWN admin even if a super_admin exists
 * globally.
 */

export type LastAdminViolation =
  | 'cannot_demote_last_admin'
  | 'cannot_deactivate_last_admin'
  | 'cannot_archive_last_admin'

export interface LastAdminCheckInput {
  tenantId: string
  targetUserId: string
  targetCurrentRoles: UserRole[]
  /**
   * The intent of the operation:
   *   'demote'     — removing practice_admin from roles
   *   'deactivate' — setting isActive=false
   *   'archive'    — setting deletedAt
   */
  action: 'demote' | 'deactivate' | 'archive'
}

export async function checkLastAdminGuard(
  client: PrismaClient,
  input: LastAdminCheckInput
): Promise<{ ok: true } | { ok: false; reason: LastAdminViolation }> {
  // If the target isn't a practice_admin, the guard doesn't apply.
  if (!input.targetCurrentRoles.includes('practice_admin')) {
    return { ok: true }
  }

  // Count other active, non-archived practice_admins in this tenant.
  const otherAdmins = await client.user.count({
    where: {
      tenantId: input.tenantId,
      id: { not: input.targetUserId },
      isActive: true,
      deletedAt: null,
      roles: { has: 'practice_admin' },
    },
  })

  if (otherAdmins > 0) {
    return { ok: true }
  }

  switch (input.action) {
    case 'demote':
      return { ok: false, reason: 'cannot_demote_last_admin' }
    case 'deactivate':
      return { ok: false, reason: 'cannot_deactivate_last_admin' }
    case 'archive':
      return { ok: false, reason: 'cannot_archive_last_admin' }
  }
}
