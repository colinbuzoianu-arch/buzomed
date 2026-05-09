import type { Invitation, UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { renderInviteEmail, sendEmail } from '@/lib/email'
import type { Locale } from '@/lib/email'
import { canInvite, type InviteActor } from '@/lib/permissions/invites'
import {
  generateInvitationToken,
  hashToken,
} from './tokens'

/**
 * Invitation service.
 *
 * Pure domain logic. No HTTP concerns.
 *
 * Important integration with existing tenant-creation flow:
 *   `POST /api/tenants` (from session 2) creates a Tenant AND a placeholder
 *   User row for the practice_admin, with `authUserId: null`. The intent
 *   was always to invite that user later via Brevo. This service supports
 *   that pattern: if a User exists in the *same* tenant but has no Supabase
 *   auth identity, an invitation can still be created — it's how that
 *   placeholder becomes activated.
 *
 * Email uniqueness rules (the schema enforces `users.email @unique` globally):
 *   - If the email already exists as an ACTIVE user (authUserId set) in
 *     ANY tenant → reject with `email_already_active_globally`. The user
 *     should sign in with their existing account; if they need access to
 *     a different tenant, that's a multi-tenant membership feature we
 *     don't support yet.
 *   - If the email exists as a placeholder (authUserId null) in ANOTHER
 *     tenant → reject with `email_placeholder_in_other_tenant`. We can't
 *     create a second User row for them due to the global unique
 *     constraint. The fix is to revoke the placeholder in the other
 *     tenant first, or use a different email.
 *   - If the email exists as a placeholder in the SAME tenant → allowed.
 *     The accept flow attaches authUserId to the existing placeholder.
 *   - If the email doesn't exist anywhere → allowed. Accept creates a
 *     fresh User row.
 */

const DEFAULT_EXPIRY_DAYS = 7

// ============================================================================
// Types
// ============================================================================

export interface CreateInvitationInput {
  actor: {
    userId: string
    tenantId: string | null
    roles: UserRole[]
    fullName: string
    locale: Locale
  }
  email: string
  role: UserRole
  tenantId: string
  recipientName?: string
  expiryDays?: number
  appUrl: string
}

export type CreateInvitationResult =
  | { ok: true; invitation: Invitation; emailSent: boolean }
  | { ok: false; error: CreateInvitationError; message: string }

export type CreateInvitationError =
  | 'forbidden'
  | 'invalid_email'
  | 'tenant_not_found'
  | 'user_already_active'
  | 'email_already_active_globally'
  | 'email_placeholder_in_other_tenant'
  | 'database_error'

// ============================================================================
// Create invitation
// ============================================================================

export async function createInvitation(
  input: CreateInvitationInput
): Promise<CreateInvitationResult> {
  // 1. Permission check
  const actor: InviteActor = {
    roles: input.actor.roles,
    tenantId: input.actor.tenantId,
  }
  const permission = canInvite(actor, {
    role: input.role,
    tenantId: input.tenantId,
  })
  if (!permission.allowed) {
    return {
      ok: false,
      error: 'forbidden',
      message: `Permission denied: ${permission.reason}`,
    }
  }

  // 2. Validate email shape
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email)) {
    return {
      ok: false,
      error: 'invalid_email',
      message: 'Email address is not in a valid format.',
    }
  }

  // 3. Verify tenant exists
  const tenant = await prisma.tenant.findFirst({
    where: { id: input.tenantId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!tenant) {
    return {
      ok: false,
      error: 'tenant_not_found',
      message: 'Tenant does not exist or has been deleted.',
    }
  }

  // 4. GLOBAL email collision check.
  // We must check across all tenants because users.email is globally unique.
  // Any preexisting User row with this email blocks creating a new one
  // for the invitee in this tenant. The error code distinguishes
  // recoverable cases (placeholder in another tenant — admin can clean
  // up) from non-recoverable (already active — they have an account).
  const existingUserAnyTenant = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      authUserId: true,
    },
  })

  if (existingUserAnyTenant) {
    const sameTenant = existingUserAnyTenant.tenantId === input.tenantId
    const isActive = existingUserAnyTenant.authUserId !== null

    if (isActive && sameTenant) {
      return {
        ok: false,
        error: 'user_already_active',
        message:
          'A user with this email is already active in this tenant. They can sign in directly.',
      }
    }

    if (isActive && !sameTenant) {
      // The email already has a working account elsewhere (could be
      // super_admin, could be another tenant's user). Multi-tenant
      // membership is not supported yet.
      return {
        ok: false,
        error: 'email_already_active_globally',
        message:
          'A user with this email already has an account on Buzomed. Multi-tenant access is not yet supported. Please use a different email address.',
      }
    }

    if (!isActive && !sameTenant) {
      // Placeholder in another tenant — global unique constraint blocks
      // creating one in this tenant too. Admin needs to revoke the other
      // placeholder first (or the user picks a different email).
      return {
        ok: false,
        error: 'email_placeholder_in_other_tenant',
        message:
          'A pending invitation for this email exists in another tenant. Resolve that one first or use a different email.',
      }
    }

    // Else: placeholder in SAME tenant → allowed, fall through.
  }

  // 5. Generate token
  const { plain: tokenPlain, hash: tokenHash } = generateInvitationToken()
  const expiryDays = input.expiryDays ?? DEFAULT_EXPIRY_DAYS
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)

  // 6. Create invitation atomically: revoke any existing pending invite
  // for the same (email, tenantId), then insert fresh one.
  let invitation: Invitation
  try {
    invitation = await prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: {
          email,
          tenantId: input.tenantId,
          acceptedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokedByUserId: input.actor.userId,
        },
      })

      return tx.invitation.create({
        data: {
          email,
          role: input.role,
          tenantId: input.tenantId,
          locale: input.actor.locale,
          tokenHash,
          expiresAt,
          invitedByUserId: input.actor.userId,
        },
      })
    })
  } catch (err) {
    console.error('[invitations] Database error creating invitation', err)
    return {
      ok: false,
      error: 'database_error',
      message: 'Failed to create invitation. Please try again.',
    }
  }

  // 7. Send email. Don't roll back the invitation if email fails.
  const acceptUrl = buildAcceptUrl(input.appUrl, tokenPlain)
  const emailContent = renderInviteEmail({
    recipientEmail: email,
    recipientName: input.recipientName,
    inviterName: input.actor.fullName,
    tenantName: tenant.name,
    role: input.role,
    acceptUrl,
    expiresAt,
    locale: input.actor.locale,
  })

  const sendResult = await sendEmail({
    to: { email, name: input.recipientName },
    content: emailContent,
    tags: ['invitation', `role:${input.role}`],
    headers: {
      'X-Buzomed-Template': 'invite',
      'X-Buzomed-Invitation-Id': invitation.id,
    },
  })

  if (!sendResult.success) {
    console.error('[invitations] Email send failed for invitation', {
      invitationId: invitation.id,
      error: sendResult.error,
    })
  }

  return {
    ok: true,
    invitation,
    emailSent: sendResult.success,
  }
}

// ============================================================================
// Revoke invitation
// ============================================================================

export interface RevokeInvitationInput {
  invitationId: string
  actor: {
    userId: string
    tenantId: string | null
    roles: UserRole[]
  }
}

export type RevokeInvitationResult =
  | { ok: true }
  | { ok: false; error: 'not_found' | 'already_finalized' | 'forbidden' }

export async function revokeInvitation(
  input: RevokeInvitationInput
): Promise<RevokeInvitationResult> {
  const invitation = await prisma.invitation.findUnique({
    where: { id: input.invitationId },
  })
  if (!invitation) {
    return { ok: false, error: 'not_found' }
  }
  if (invitation.acceptedAt || invitation.revokedAt) {
    return { ok: false, error: 'already_finalized' }
  }

  const permission = canInvite(
    {
      roles: input.actor.roles,
      tenantId: input.actor.tenantId,
    },
    { role: invitation.role, tenantId: invitation.tenantId }
  )
  if (!permission.allowed) {
    return { ok: false, error: 'forbidden' }
  }

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: {
      revokedAt: new Date(),
      revokedByUserId: input.actor.userId,
    },
  })

  return { ok: true }
}

// ============================================================================
// Validate token (for accept page — preview before accepting)
// ============================================================================

export type ValidateTokenResult =
  | {
      ok: true
      invitation: {
        id: string
        email: string
        role: UserRole
        tenantId: string
        tenantName: string
        inviterName: string
        expiresAt: Date
        locale: string
      }
    }
  | { ok: false; error: 'invalid' | 'expired' | 'revoked' | 'already_accepted' }

export async function validateInvitationToken(
  plainToken: string
): Promise<ValidateTokenResult> {
  const tokenHash = hashToken(plainToken)
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      tenant: { select: { name: true } },
      invitedBy: { select: { firstName: true, lastName: true } },
    },
  })

  if (!invitation) {
    return { ok: false, error: 'invalid' }
  }
  if (invitation.revokedAt) {
    return { ok: false, error: 'revoked' }
  }
  if (invitation.acceptedAt) {
    return { ok: false, error: 'already_accepted' }
  }
  if (invitation.expiresAt < new Date()) {
    return { ok: false, error: 'expired' }
  }

  return {
    ok: true,
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      tenantId: invitation.tenantId,
      tenantName: invitation.tenant.name,
      inviterName: `${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`,
      expiresAt: invitation.expiresAt,
      locale: invitation.locale,
    },
  }
}

// ============================================================================
// Helpers
// ============================================================================

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function buildAcceptUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, '')
  return `${base}/accept-invite/${encodeURIComponent(token)}`
}
