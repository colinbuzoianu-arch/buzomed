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
 * c) If the email already exists in Supabase Auth (e.g., a previous accept
 *    failed halfway and orphaned an auth identity), we don't create a new
 *    auth user; we reuse the existing one — but see (g), which bounds when
 *    we are willing to touch its password.
 *
 * g) SECURITY — password takeover guard. Reusing an existing auth identity
 *    used to come with an unconditional password reset: whoever accepted
 *    the invitation got to set the password of the account already behind
 *    that email. Possession of an invitation token was therefore enough to
 *    seize an existing account, without ever proving control of the inbox.
 *    This has happened in practice — it once reset this project owner's
 *    super_admin password.
 *
 *    The invite-time collision check in service.ts narrowed how often such
 *    an invitation can be created, but it did not remove the primitive: a
 *    token that already exists, or an account created outside the invite
 *    flow, still reaches this code.
 *
 *    The rule now: an existing auth identity's password is only set when
 *    that identity is UNCLAIMED — i.e. no live `users` row points at it.
 *    That still covers every legitimate case (an orphan from a failed
 *    accept, an auth user whose app row was soft-deleted, a placeholder
 *    whose authUserId is still null), because in all of them nobody is
 *    currently signing in with that identity. If a live user is attached,
 *    we refuse the whole acceptance rather than touch their credentials.
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
    console.error('[invitations] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
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
  const supabaseAdmin = createSupabaseAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let supabaseUserId: string
  let newSupabaseUser = false

  // First, check whether a Supabase user already exists with this email.
  // Supabase doesn't have a "find by email" admin API directly — we list
  // and filter.
  //
  // This pagination loop matters for correctness, not just completeness:
  // the takeover guard below can only fire on a user it actually found.
  // The previous single-page lookup (perPage: 200) silently stopped
  // matching once the project passed 200 auth users, which would have
  // routed an existing-email acceptance into createUser instead — failing
  // with a confusing "may already be registered" rather than the explicit
  // collision answer. Bounded so a pathological listing can't spin here.
  const targetEmail = invitation.email.toLowerCase()
  const LOOKUP_PAGE_SIZE = 200
  const LOOKUP_MAX_PAGES = 50

  let matchingUser: { id: string } | undefined
  for (let page = 1; page <= LOOKUP_MAX_PAGES; page++) {
    const { data: pageData, error: lookupError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: LOOKUP_PAGE_SIZE,
    })

    if (lookupError) {
      console.error('[invitations] Supabase listUsers failed', lookupError)
      return {
        ok: false,
        error: 'service_unavailable',
        message: 'Could not verify your account. Please try again.',
      }
    }

    const found = pageData.users.find((u) => u.email?.toLowerCase() === targetEmail)
    if (found) {
      matchingUser = found
      break
    }

    // Last page reached.
    if (pageData.users.length < LOOKUP_PAGE_SIZE) break

    if (page === LOOKUP_MAX_PAGES) {
      // We ran out of pages without a definitive answer. Failing closed is
      // the only safe option: proceeding would mean createUser on an email
      // that might already exist, and we cannot run the takeover guard on
      // a user we never looked at.
      console.error(
        '[invitations] listUsers exceeded LOOKUP_MAX_PAGES without resolving email; failing closed'
      )
      return {
        ok: false,
        error: 'service_unavailable',
        message: 'Could not verify your account. Please contact support.',
      }
    }
  }

  if (matchingUser) {
    // Existing Supabase user. Reusing the identity is fine; overwriting its
    // password is only fine while nobody is using it. See (g) in the header
    // comment — this check is the takeover guard.
    //
    // This is the same rule service.ts/createInvitation() already applies at
    // invite time ("a users row with authUserId set, in any tenant, blocks
    // the invitation"), enforced again at acceptance. So it refuses no
    // invitation that should legitimately exist — only ones that predate the
    // check, or whose target account appeared after the invite was sent.
    const claimedBy = await prisma.user.findFirst({
      where: { authUserId: matchingUser.id, deletedAt: null },
      select: { id: true, tenantId: true },
    })

    if (claimedBy) {
      // A live account already signs in with this identity. Accepting would
      // have handed its password to whoever holds this token. Refuse the
      // acceptance entirely and leave the credentials untouched.
      //
      // Logged with enough detail to investigate, but deliberately without
      // the token: a token in the logs is a credential in the logs.
      console.error('[invitations] Refused accept: auth identity already claimed', {
        invitationId: invitation.id,
        invitationTenantId: invitation.tenantId,
        claimedByUserId: claimedBy.id,
        claimedByTenantId: claimedBy.tenantId,
        sameTenant: claimedBy.tenantId === invitation.tenantId,
      })
      return {
        ok: false,
        error: 'email_collision',
        message:
          'This email already has an active Buzomed account. Sign in with it instead, or use the password reset link. If you believe this is a mistake, contact support.',
      }
    }

    supabaseUserId = matchingUser.id
  } else {
    // Create new Supabase user with email pre-confirmed (since clicking
    // an invite link from their email proves they control it, sort of —
    // we treat it as the equivalent of email confirmation).
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
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
      console.error('[invitations] Supabase createUser failed', createError)
      return {
        ok: false,
        error: 'service_unavailable',
        message: 'Could not create your account. The email may already be registered.',
      }
    }

    supabaseUserId = created.user.id
    newSupabaseUser = true
  }

  // For an EXISTING but UNCLAIMED Supabase user, set the password to the one
  // just chosen, so acceptance always ends with credentials that work.
  //
  // Reaching here means the guard above found no live `users` row pointing
  // at this identity, so there is no account whose password we could be
  // taking over — the identity is an orphan from a failed accept, or its app
  // row was soft-deleted. The claimed case returned email_collision and
  // never gets this far.
  if (!newSupabaseUser) {
    const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
      password: input.password,
    })
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
          throw new Error('placeholder_user_already_has_different_auth_id')
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
