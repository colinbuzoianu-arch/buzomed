import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { writeAuditLog, getRequestMeta } from '@/lib/audit/log'

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user || !auth.user.roles.includes('super_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const tenant = await prisma.tenant.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, subscriptionStatus: true },
  })
  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await prisma.tenant.update({
    where: { id },
    data: { subscriptionStatus: 'active' },
  })

  const { ipAddress, userAgent } = getRequestMeta(_req)
  void writeAuditLog({
    tenantId: null,
    userId: auth.user.id,
    action: 'update',
    entityType: 'tenant',
    entityId: id,
    changes: { subscriptionStatus: { from: tenant.subscriptionStatus, to: 'active' } },
    ipAddress,
    userAgent,
  })

  return NextResponse.json({ ok: true })
}
