import { NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { revokeInvitation } from '@/lib/invitations/service'

/**
 * POST /api/invitations/[id]/revoke
 *
 * Marks a pending invitation as revoked. Idempotent in the sense that
 * already-revoked invitations return 'already_finalized' rather than
 * silently re-revoking. Same applies to already-accepted invitations
 * (you can't unaccept).
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }

  const { id } = await context.params

  if (typeof id !== 'string' || id.trim() === '') {
    return NextResponse.json(
      { error: 'invalid_id' },
      { status: 400 }
    )
  }

  const result = await revokeInvitation({
    invitationId: id,
    actor: {
      userId: auth.user.id,
      tenantId: auth.user.tenantId,
      roles: auth.user.roles,
    },
  })

  if (!result.ok) {
    const status =
      result.error === 'not_found'
        ? 404
        : result.error === 'forbidden'
          ? 403
          : 409
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ ok: true })
}
