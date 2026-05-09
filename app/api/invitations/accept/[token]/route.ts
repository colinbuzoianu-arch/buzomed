import { NextRequest, NextResponse } from 'next/server'
import { acceptInvitation } from '@/lib/invitations/accept-service'
import { validateInvitationToken } from '@/lib/invitations/service'

/**
 * GET /api/invitations/accept/[token]
 *
 * Public endpoint. Returns invitation metadata for the accept page.
 * Unchanged from B.1.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params

  if (typeof token !== 'string' || token.trim() === '') {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

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
 * Public endpoint. Accepts invitation by:
 *   1. Creating (or reusing) a Supabase auth user
 *   2. Linking it to the placeholder User row (or creating new User)
 *   3. Marking invitation accepted
 *
 * Body:
 *   { "password": "...", "firstName": "...", "lastName": "..." }
 *
 * On success, the user is NOT automatically signed in by this endpoint.
 * The client redirects to /login with the email pre-filled. We chose this
 * over auto-sign-in because:
 *   - Keeps the auth flow consistent (you sign in via /login, always)
 *   - Avoids edge cases with cookie setting in API routes during a
 *     just-completed account creation
 *   - Lets the user verify the password they chose works
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params

  if (typeof token !== 'string' || token.trim() === '') {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  if (typeof b.password !== 'string') {
    return NextResponse.json({ error: 'invalid_password' }, { status: 400 })
  }
  if (typeof b.firstName !== 'string' || typeof b.lastName !== 'string') {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 })
  }

  const result = await acceptInvitation({
    token,
    password: b.password,
    firstName: b.firstName,
    lastName: b.lastName,
  })

  if (!result.ok) {
    const status =
      result.error === 'invalid_token'
        ? 404
        : result.error === 'expired'
          ? 410
          : result.error === 'revoked' || result.error === 'already_accepted'
            ? 409
            : result.error === 'invalid_password' ||
                result.error === 'invalid_name'
              ? 400
              : result.error === 'service_unavailable'
                ? 503
                : 500
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status }
    )
  }

  return NextResponse.json({
    ok: true,
    email: result.email,
    userId: result.userId,
  })
}
