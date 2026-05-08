/**
 * Invitation permission helper.
 *
 * Encodes the role hierarchy:
 *
 *   super_admin    → can invite practice_admin to any tenant
 *   practice_admin → can invite practitioner or assistant within their tenant
 *   practitioner   → can invite assistant within their tenant
 *   assistant      → cannot invite anyone
 *
 * Used by:
 * - API routes (POST /api/invitations) to authorize the request
 * - UI components to show/hide invite buttons
 *
 * Keeping this in one place is essential. Any drift between the API check
 * and the UI check creates either security holes (UI shows a button that
 * the API rejects — confusing UX) or actual privilege escalation paths.
 */

import type { UserRole } from '@prisma/client'

export interface InviteActor {
  /** All roles assigned to the actor. May be empty for super_admin (no tenant). */
  roles: UserRole[]
  /** The tenant the actor belongs to. Null for super_admin. */
  tenantId: string | null
}

export interface InviteTarget {
  /** The role being granted to the invitee. */
  role: UserRole
  /** The tenant into which the invitee will be added. */
  tenantId: string
}

export interface InviteCheckResult {
  allowed: boolean
  /** Machine-readable reason if not allowed. */
  reason?: InviteDenialReason
}

export type InviteDenialReason =
  | 'actor_has_no_role'
  | 'cannot_invite_to_other_tenant'
  | 'role_cannot_invite'
  | 'cannot_invite_super_admin'

/**
 * Check whether `actor` is allowed to invite a user with `target.role`
 * into `target.tenantId`.
 */
export function canInvite(
  actor: InviteActor,
  target: InviteTarget
): InviteCheckResult {
  // No one can invite a super_admin via this flow. Super admins are
  // bootstrapped via the seed or set manually in the DB.
  if (target.role === 'super_admin') {
    return { allowed: false, reason: 'cannot_invite_super_admin' }
  }

  if (actor.roles.length === 0) {
    return { allowed: false, reason: 'actor_has_no_role' }
  }

  // super_admin can invite practice_admin to any tenant
  if (actor.roles.includes('super_admin')) {
    if (target.role === 'practice_admin') {
      return { allowed: true }
    }
    // super_admin doesn't invite practitioners/assistants directly —
    // that's the job of each tenant's practice_admin. This isolation
    // keeps super_admin's audit trail clean and prevents accidental
    // tenant-scoped actions from a global account.
    return { allowed: false, reason: 'role_cannot_invite' }
  }

  // All other actors must be in the same tenant as the invitee.
  if (actor.tenantId === null || actor.tenantId !== target.tenantId) {
    return { allowed: false, reason: 'cannot_invite_to_other_tenant' }
  }

  // practice_admin can invite practitioner or assistant
  if (actor.roles.includes('practice_admin')) {
    if (target.role === 'practitioner' || target.role === 'assistant') {
      return { allowed: true }
    }
    // practice_admin cannot invite another practice_admin. If a tenant
    // needs a second admin, super_admin promotes an existing user or
    // sends a fresh practice_admin invitation themselves.
    return { allowed: false, reason: 'role_cannot_invite' }
  }

  // practitioner can invite assistant only
  if (actor.roles.includes('practitioner')) {
    if (target.role === 'assistant') {
      return { allowed: true }
    }
    return { allowed: false, reason: 'role_cannot_invite' }
  }

  // assistant or any unrecognized role
  return { allowed: false, reason: 'role_cannot_invite' }
}

/**
 * List the roles `actor` is allowed to invite into `tenantId`.
 * Useful for rendering role dropdowns in the UI — only shows
 * options the actor can actually grant.
 */
export function invitableRoles(
  actor: InviteActor,
  tenantId: string
): UserRole[] {
  const allRoles: UserRole[] = [
    'super_admin',
    'practice_admin',
    'practitioner',
    'assistant',
  ]
  return allRoles.filter(
    (role) => canInvite(actor, { role, tenantId }).allowed
  )
}
