import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { getRequestMeta, writeAuditLog } from '@/lib/audit/log'
import { prisma } from '@/lib/prisma'
import { createServiceClient } from '@/lib/supabase/admin'

/**
 * Super-admin "reset 2FA" for a user who lost their authenticator device.
 * Deletes every MFA factor on the target user's auth identity using the
 * service-role admin API, so they can sign in with just their password again
 * (and optionally re-enroll). super_admin only — practice_admin cannot do this.
 */
interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!auth.user.roles.includes('super_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { userId } = await ctx.params
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, authUserId: true, tenantId: true, firstName: true, lastName: true },
  })
  if (!target?.authUserId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const admin = createServiceClient()
  const { data: list, error: listErr } = await admin.auth.admin.mfa.listFactors({
    userId: target.authUserId,
  })
  if (listErr) {
    return NextResponse.json({ error: 'reset_failed' }, { status: 500 })
  }

  let removed = 0
  for (const factor of list?.factors ?? []) {
    const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: target.authUserId,
    })
    if (!delErr) removed++
  }

  const { ipAddress, userAgent } = getRequestMeta(request)
  await writeAuditLog({
    tenantId: target.tenantId,
    userId: auth.user.id, // the super_admin who performed the reset
    action: 'mfa_reset',
    entityType: 'user',
    entityId: target.id,
    entitySummary: `${target.lastName} ${target.firstName}`,
    changes: { removedFactors: removed },
    ipAddress,
    userAgent,
  })

  return NextResponse.json({ ok: true, removed })
}
