import { NextRequest, NextResponse } from 'next/server'
import { validateInvitationToken } from '@/lib/invitations/service'

/**
 * GET /api/invitations/accept/[token]
 *
 * Public endpoint. Returns invitation metadata for the accept page
 * (tenant name, role, expiry, inviter name) so the user can see what
 * they're accepting before they create their account.
 *
 * Returns the invitation's `locale` so the accept page renders in the
 * same language the user got the email in.
 *
 * Does NOT return the email address as plaintext to the client until
 * the user has signed in / proven they own the address. (Even though
 * the email IS in our DB and the user-side accept form will need it,
 * we'll let the client display it — but we don't echo it in this
 * preview to avoid leaking which addresses have outstanding invites.)
 *
 * Wait — actually we do need to return the email because the user
 * needs to know what address to set their password for. Tradeoff
 * accepted: anyone with the token already controls the invitation,
 * so revealing the email to them is fine.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params

  if (typeof token !== 'string' || token.trim() === '') {
    return NextResponse.json(
      { error: 'invalid_token' },
      { status: 400 }
    )
  }

  const result = await validateInvitationToken(token)

  if (!result.ok) {
    const status =
      result.error === 'invalid'
        ? 404
        : result.error === 'expired'
          ? 410 // Gone — semantically apt for expired resources
          : 409 // Conflict for revoked / already_accepted
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({
    ok: true,
    invitation: {
      email: result.invitation.email,
      role: result.invitation.role,
      tenantName: result.invitation.tenantName,
      inviterName: result.invitation.inviterName,
      expiresAt: result.invitation.expiresAt,
      locale: result.invitation.locale,
    },
  })
}

/**
 * POST /api/invitations/accept/[token]
 *
 * Body:
 * {
 *   "password": "...",     (required if creating a new account)
 *   "firstName": "...",    (required if creating a new account)
 *   "lastName": "..."      (required if creating a new account)
 * }
 *
 * STAGE B.1 NOTE:
 * This endpoint is stubbed in B.1 — it validates the token and returns
 * a 501 Not Implemented for the actual user creation. Reason: full
 * accept flow needs to:
 * 1. Create Supabase auth user with email + password
 * 2. Create our DB User row linked to authUserId
 * 3. Mark invitation accepted
 * 4. Handle the case where a user with that email already exists in
 *    Supabase (existing user joining a new tenant)
 *
 * That's a large surface area. Stage B.4 will fill it in alongside
 * the public accept page UI. For now we just want the validation
 * path testable end-to-end (you can verify a token, see it expire,
 * verify revoke works) without yet wiring up Supabase user creation.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params

  // Validate first so we still return 404/410/409 for bad tokens
  const result = await validateInvitationToken(token)
  if (!result.ok) {
    const status =
      result.error === 'invalid'
        ? 404
        : result.error === 'expired'
          ? 410
          : 409
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json(
    {
      error: 'not_implemented',
      message:
        'Accept endpoint is stubbed in stage B.1. Full implementation lands in stage B.4.',
    },
    { status: 501 }
  )
}
