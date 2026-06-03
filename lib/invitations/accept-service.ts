import type { UserRole } from '@prisma/client'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { hashToken } from './tokens'

/**
 * Invitation acceptance.
 *
 * The hardest part of the invite flow. Coordinates THREE systems:
 *   1. Supabase Auth (creates the auth identity, sets password)
 *   2. Our `users` table (creates the User row OR updates existing
 *      placeholder to attach authUserId)
 *   3. The invitation itself (marks accepted)
 *
 * Critical correctness rules:
 *
 * a) The invitation token, password, firstName, and lastName are all
 *    untrusted user input arriving via a public route. Validate everything.
 *
 * b) Email comes from the invitation (server-side trusted), NOT from the
 *    user. The user CANNOT change which email they're activating — the
 *    invitation determines that.
 *
 * c) If the email already exists in Supabase Auth (e.g., the person was
 *    invited to another tenant before), we don't create a new auth user;
 *    we use the existing one. They've already proven control of that
 *    email by activating it elsewhere.
 *
 * d) DB writes happen in a transaction so we never end up with a Supabase
 *    auth identity orphaned from a User row.
 *
 * e) If anything fails AFTER the Supabase user is created but BEFORE the
 *    DB transaction commits, we have an orphan Supabase user. We log this
 *    loudly so it can be cleaned up — this is rare but a real risk.
 *
 * f) The placeholder pattern: tenant creation pre-creates a User row with
 *    authUserId=null. We update that row in place rather than creating a
 *    new one. This preserves the user's id, any FK references made to
 *    them in the meantime, and their roles set by the inviter.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export interface AcceptInvitationInput {
  /** Plaintext token from the URL */
  token: string
  /** Password the user is choosing */
  password: string
  /** First name (form input — overrides any placeholder name) */
  firstName: string
  /** Last name (form input — overrides any placeholder name) */
  lastName: string
}

export type AcceptInvitationResult =
  | {
      ok: true
      /** Email of the newly active user — for the sign-in step that follows */
      email: string
      /** App User id */
      userId: string
      /** Whether a brand-new Supabase auth user was created (true) or
       *  an existing one was reused (false). Mostly informational. */
      newSupabaseUser: boolean
    }
  | {
      ok: false
      error:
        | 'invalid_token'
        | 'expired'
        | 'revoked'
        | 'already_accepted'
        | 'invalid_password'
        | 'invalid_name'
        | 'email_collision'
        | 'service_unavailable'
        | 'database_error'
      message?: string
    }

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

export async function acceptInvitation(
  input: AcceptInvitationInput
): Promise<AcceptInvitationResult> {
  // 1. Sanity check: required env for admin client
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      '[invitations] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    )
    return {
      ok: false,
      error: 'service_unavailable',
      message: 'Server is not configured correctly. Please contact support.',
    }
  }

  // 2. Validate password
  if (
    typeof input.password !== 'string' ||
    input.password.length < MIN_PASSWORD_LENGTH ||
    input.password.length > MAX_PASSWORD_LENGTH
  ) {
    return { ok: false, error: 'invalid_password' }
  }

  // 3. Validate names
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (firstName.length === 0 || firstName.length > 100) {
    return { ok: false, error: 'invalid_name' }
  }
  if (lastName.length === 0 || lastName.length > 100) {
    return { ok: false, error: 'invalid_name' }
  }

  // 4. Look up invitation by token hash
  const tokenHash = hashToken(input.token)
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
  })
  if (!invitation) return { ok: false, error: 'invalid_token' }
  if (invitation.revokedAt) return { ok: false, error: 'revoked' }
  if (invitation.acceptedAt) return { ok: false, error: 'already_accepted' }
  if (invitation.expiresAt < new Date()) return { ok: false, error: 'expired' }

  // 5. Create or find Supabase auth user
  const supabaseAdmin = createSupabaseAdminClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let supabaseUserId: string
  let newSupabaseUser = false

  // First, check whether a Supabase user already exists with this email.
  // Supabase doesn't have a "find by email" admin API directly — we list
  // and filter. For dev volumes this is fine; for production scale this
  // would need a different approach (Supabase 2.x added getUserByEmail
  // in some versions but availability varies).
  const { data: existingByEmail, error: lookupError } =
    await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })

  if (lookupError) {
    console.error('[invitations] Supabase listUsers failed', lookupError)
    return {
      ok: false,
      error: 'service_unavailable',
      message: 'Could not verify your account. Please try again.',
    }
  }

  const matchingUser = existingByEmail.users.find(
    (u) => u.email?.toLowerCase() === invitation.email.toLowerCase()
  )

  if (matchingUser) {
    // Existing Supabase user (e.g., they accepted an invite to another
    // tenant before, or were created some other way). Reuse their identity.
    supabaseUserId = matchingUser.id
  } else {
    // Create new Supabase user with email pre-confirmed (since clicking
    // an invite link from their email proves they control it, sort of —
    // we treat it as the equivalent of email confirmation).
    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: invitation.email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          invited_to_tenant_id: invitation.tenantId,
        },
      })

    if (createError || !created.user) {
      console.error(
        '[invitations] Supabase createUser failed',
        createError
      )
      return {
        ok: false,
        error: 'service_unavailable',
        message:
          'Could not create your account. The email may already be registered.',
      }
    }

    supabaseUserId = created.user.id
    newSupabaseUser = true
  }

  // For an EXISTING Supabase user, set their password to the one they
  // just chose. This is so accepting an invite always lets you sign in
  // with the password you typed, regardless of whether you already had
  // an auth identity.
  if (!newSupabaseUser) {
    const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(
      supabaseUserId,
      { password: input.password }
    )
    if (pwError) {
      console.error('[invitations] Failed to set password on existing user', pwError)
      return {
        ok: false,
        error: 'service_unavailable',
        message: 'Could not set your password. Please try again.',
      }
    }
  }

  // 6. Update DB transactionally:
  //    - Find existing placeholder User in this tenant by email, OR
  //    - Create new User row
  //    - Set authUserId, firstName, lastName
  //    - Mark invitation accepted
  let appUserId: string
  try {
    appUserId = await prisma.$transaction(async (tx) => {
      // Look for placeholder
      const placeholder = await tx.user.findFirst({
        where: {
          email: invitation.email,
          tenantId: invitation.tenantId,
          deletedAt: null,
        },
      })

      let userId: string
      if (placeholder) {
        // Sanity: we shouldn't be here if placeholder.authUserId is set;
        // service.ts/createInvitation() blocks re-inviting active users.
        // But defense in depth: if somehow an active user is here, abort.
        if (placeholder.authUserId && placeholder.authUserId !== supabaseUserId) {
          throw new Error(
            'placeholder_user_already_has_different_auth_id'
          )
        }
        const updated = await tx.user.update({
          where: { id: placeholder.id },
          data: {
            authUserId: supabaseUserId,
            firstName,
            lastName,
            // Don't change roles — those were set by the inviter; the
            // invitee accepting doesn't get to change their own role.
            // Don't change isActive — placeholder is already active.
            lastLoginAt: new Date(),
          },
        })
        userId = updated.id
      } else {
        // No placeholder — create a fresh User row. This happens when
        // someone is invited to a tenant they don't already have a
        // placeholder in (e.g., a practitioner invited by a practice_admin).
        const created = await tx.user.create({
          data: {
            tenantId: invitation.tenantId,
            email: invitation.email,
            authUserId: supabaseUserId,
            firstName,
            lastName,
            roles: [invitation.role],
            isActive: true,
            lastLoginAt: new Date(),
          },
        })
        userId = created.id
      }

      // Mark invitation accepted
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          acceptedAt: new Date(),
          acceptedByUserId: userId,
        },
      })

      // For company_hr invitations, create the company access assignments
      const meta = invitation.metadata as { companyIds?: string[] } | null
      if (invitation.role === 'company_hr' && meta?.companyIds?.length) {
        await tx.companyHrAssignment.createMany({
          data: meta.companyIds.map((companyId) => ({
            userId,
            companyId,
            tenantId: invitation.tenantId,
          })),
          skipDuplicates: true,
        })
      }

      return userId
    })
  } catch (err) {
    console.error('[invitations] DB transaction failed during accept', {
      invitationId: invitation.id,
      supabaseUserId,
      newSupabaseUser,
      err,
    })
    if (newSupabaseUser) {
      // Orphaned Supabase user. Log loudly. We DON'T attempt to delete
      // it programmatically because a partial failure here means we
      // don't know the real DB state — better to have a manual cleanup
      // step than to risk deleting a user that turned out to be linked.
      console.error(
        `[invitations] ORPHAN: Supabase user ${supabaseUserId} created but DB transaction failed. Manual cleanup may be required.`
      )
    }
    return {
      ok: false,
      error: 'database_error',
      message: 'Could not finalize your account. Please contact support.',
    }
  }

  return {
    ok: true,
    email: invitation.email,
    userId: appUserId,
    newSupabaseUser,
  }
}
