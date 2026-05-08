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
 * Pure domain logic. No HTTP concerns. API routes call into this service
 * after authenticating the request. Easier to test, easier to reuse
 * (e.g., for admin scripts or future cron jobs).
 *
 * Important integration with existing tenant-creation flow:
 *   `POST /api/tenants` (from session 2) creates a Tenant AND a placeholder
 *   User row for the practice_admin, with `authUserId: null`. The intent
 *   was always to invite that user later via Brevo. This service supports
 *   that pattern: if a User exists in the tenant but has no Supabase auth
 *   identity, an invitation can still be created — it's how that placeholder
 *   becomes activated.
 *
 *   Conversely, if a User exists AND has an authUserId, they're already
 *   active and re-inviting them would be a mistake (or worse, an
 *   authentication takeover attempt) — we reject.
 */

const DEFAULT_EXPIRY_DAYS = 7

// ============================================================================
// Types
// ============================================================================

export interface CreateInvitationInput {
  /** Authenticated user creating the invitation. */
  actor: {
    userId: string
    tenantId: string | null
    roles: UserRole[]
    fullName: string
    locale: Locale
  }
  /** Email address being invited. */
  email: string
  /** Role being granted. */
  role: UserRole
  /** Tenant the invitee will join. */
  tenantId: string
  /** Optional override for the recipient's name (e.g., from a contact). */
  recipientName?: string
  /** Override for invite expiry in days. Defaults to 7. */
  expiryDays?: number
  /** Base URL of the app (e.g., https://app.buzomed.com). */
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

  // 3. Verify tenant exists and isn't soft-deleted
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

  // 4. Check whether this email is already an ACTIVE user in this tenant.
  // Active = has a Supabase auth identity (authUserId !== null). If they're
  // a placeholder (authUserId === null), inviting them is the intended way
  // to attach auth to the placeholder — that's fine.
  const existingUser = await prisma.user.findFirst({
    where: {
      email,
      tenantId: input.tenantId,
      deletedAt: null,
    },
    select: { id: true, authUserId: true },
  })
  if (existingUser?.authUserId) {
    return {
      ok: false,
      error: 'user_already_active',
      message:
        'A user with this email is already active in this tenant. They can sign in directly.',
    }
  }

  // 5. Generate token
  const { plain: tokenPlain, hash: tokenHash } = generateInvitationToken()
  const expiryDays = input.expiryDays ?? DEFAULT_EXPIRY_DAYS
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)

  // 6. Create invitation atomically: revoke any existing pending invite
  // for the same (email, tenantId), then insert fresh one. Implements
  // the "fresh invite supersedes the old one" rule.
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

  // 7. Send email. We don't roll back the invitation if email fails —
  // the admin can resend, and we'd rather have the record exist than
  // lose state. A persisted invitation with no email is recoverable;
  // a sent email with no DB record is not.
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

  // Permission: must be allowed to invite this role into this tenant.
  // If you can invite, you can revoke.
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
  // Pragmatic regex — not RFC-perfect, but rejects obvious garbage.
  // Brevo will validate fully on send anyway.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function buildAcceptUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, '')
  return `${base}/accept-invite/${encodeURIComponent(token)}`
}
