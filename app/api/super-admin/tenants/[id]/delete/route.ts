import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user || !auth.user.roles.includes('super_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const tenant = await prisma.tenant.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const now = new Date()

  // Soft-delete all tenant entities in dependency order
  await prisma.$transaction([
    prisma.examination.updateMany({ where: { tenantId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.recall.updateMany({ where: { tenantId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.document.updateMany({ where: { tenantId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.employee.updateMany({ where: { tenantId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.workplace.updateMany({ where: { tenantId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.company.updateMany({ where: { tenantId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.invoice.updateMany({ where: { tenantId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.contract.updateMany({ where: { tenantId: id, deletedAt: null }, data: { deletedAt: now } }),
    // Invitation has no deletedAt — mark as revoked
    prisma.invitation.updateMany({ where: { tenantId: id }, data: { revokedAt: now } }),
    prisma.user.updateMany({ where: { tenantId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.tenant.update({ where: { id }, data: { deletedAt: now } }),
  ])

  return NextResponse.json({ ok: true, deleted: tenant.name })
}
