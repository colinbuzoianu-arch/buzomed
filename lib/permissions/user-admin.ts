/**
 * User management permissions (session 12).
 *
 * Covers admin actions on other team members within a tenant: editing roles,
 * toggling active status, archiving (soft-delete).
 *
 * Hierarchy:
 *   super_admin    → can edit any user in any tenant EXCEPT cannot modify
 *                    other super_admins (those are seeded manually). Useful
 *                    for emergency intervention but not the normal flow.
 *   practice_admin → can edit any non-super_admin user in their own tenant
 *   practitioner   → cannot edit other users
 *   assistant      → cannot edit other users
 *
 * Important safety constraints:
 *   - A user can never modify their own roles or active status. Prevents
 *     accidental self-lockout and is the common-sense norm.
 *   - The LAST practice_admin in a tenant cannot be demoted, archived, or
 *     deactivated. Otherwise the tenant loses its administrator and no one
 *     can promote a new one. The lastAdminGuard helper enforces this at
 *     write time.
 *   - Roles assignable through this flow are limited to {practice_admin,
 *     practitioner, assistant}. Granting super_admin is NOT possible via
 *     the UI — it remains a manual DB operation.
 */

import type { UserRole } from '@prisma/client'

export interface UserAdminActor {
  id: string
  roles: UserRole[]
  tenantId: string | null
}

export interface UserAdminTarget {
  id: string
  roles: UserRole[]
  tenantId: string | null
}

export type UserAdminDenialReason =
  | 'cannot_modify_self'
  | 'cannot_modify_super_admin'
  | 'cannot_cross_tenant'
  | 'insufficient_role'
  | 'cannot_grant_super_admin'

export interface UserAdminCheckResult {
  allowed: boolean
  reason?: UserAdminDenialReason
}

/**
 * Roles that can be granted/revoked through the user-edit UI.
 *
 * Note: super_admin is NOT in this list. Granting super_admin requires
 * direct DB access — there's no "make this user a global super admin"
 * button in any cabinet's UI.
 */
export const ASSIGNABLE_ROLES: UserRole[] = [
  'practice_admin',
  'practitioner',
  'assistant',
]

/**
 * Can the actor modify the target user's account?
 */
export function canManageUser(
  actor: UserAdminActor,
  target: UserAdminTarget
): UserAdminCheckResult {
  if (actor.id === target.id) {
    return { allowed: false, reason: 'cannot_modify_self' }
  }
  if (target.roles.includes('super_admin')) {
    return { allowed: false, reason: 'cannot_modify_super_admin' }
  }
  if (actor.roles.includes('super_admin')) {
    return { allowed: true }
  }
  if (
    actor.tenantId === null ||
    target.tenantId === null ||
    actor.tenantId !== target.tenantId
  ) {
    return { allowed: false, reason: 'cannot_cross_tenant' }
  }
  if (!actor.roles.includes('practice_admin')) {
    return { allowed: false, reason: 'insufficient_role' }
  }
  return { allowed: true }
}

/**
 * Validate that a requested role set is assignable.
 */
export function validateRoleAssignment(roles: UserRole[]): {
  ok: boolean
  reason?: UserAdminDenialReason
} {
  if (roles.length === 0) {
    return { ok: false, reason: 'insufficient_role' }
  }
  if (roles.includes('super_admin')) {
    return { ok: false, reason: 'cannot_grant_super_admin' }
  }
  for (const r of roles) {
    if (!ASSIGNABLE_ROLES.includes(r)) {
      return { ok: false, reason: 'insufficient_role' }
    }
  }
  return { ok: true }
}
