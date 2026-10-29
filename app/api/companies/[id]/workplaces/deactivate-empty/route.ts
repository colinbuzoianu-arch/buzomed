import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { getRequestMeta, writeAuditLog } from '@/lib/audit/log'
import { canReadTenantData, canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { formatWorkplaceLabel } from '@/lib/workplaces/format'

/**
 * Admin maintenance action (spec §7): find the company's active workplaces
 * that have NO active employee currently assigned, and deactivate them.
 *
 *   GET  → preview: the list of empty workplaces that WOULD be deactivated.
 *   POST → perform: set isActive=false on exactly those. Deactivate only —
 *          never delete, and examinations/recalls keep pointing at them.
 *
 * "Empty" means no current (isCurrent) assignment to a non-archived, active,
 * non-deleted employee. A workplace that only held employees who have since
 * left (all assignments closed) counts as empty.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadCompanyForActor(companyId: string, tenantId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: { id: true },
  })
}

/** The active workplaces of a company that currently have no active employee. */
async function findEmptyWorkplaces(companyId: string, tenantId: string) {
  const workplaces = await prisma.workplace.findMany({
    where: { companyId, tenantId, deletedAt: null, isActive: true },
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      name: true,
      workSite: { select: { name: true } },
      _count: {
        select: {
          employeeAssignments: {
            where: {
              isCurrent: true,
              employee: { deletedAt: null, isActive: true, archivedAt: null },
            },
          },
        },
      },
    },
  })
  return workplaces.filter((w) => w._count.employeeAssignments === 0)
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId } = await ctx.params
  const company = await loadCompanyForActor(companyId, auth.user.tenantId)
  if (!company) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const empty = await findEmptyWorkplaces(companyId, auth.user.tenantId)
  return NextResponse.json({
    workplaces: empty.map((w) => ({ id: w.id, label: formatWorkplaceLabel(w) })),
  })
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId } = await ctx.params
  const company = await loadCompanyForActor(companyId, auth.user.tenantId)
  if (!company) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Re-resolve the set server-side — the client's preview is never trusted.
  const empty = await findEmptyWorkplaces(companyId, auth.user.tenantId)
  const ids = empty.map((w) => w.id)
  if (ids.length === 0) {
    return NextResponse.json({ deactivated: 0, workplaces: [] })
  }

  await prisma.workplace.updateMany({
    where: { id: { in: ids }, tenantId: auth.user.tenantId, companyId, deletedAt: null },
    data: { isActive: false },
  })

  const { ipAddress, userAgent } = getRequestMeta(request)
  void writeAuditLog({
    tenantId: auth.user.tenantId,
    userId: auth.user.id,
    action: 'update',
    entityType: 'company',
    entityId: companyId,
    entitySummary: `Dezactivat ${ids.length} loc(uri) de muncă fără angajați activi`,
    changes: { deactivatedWorkplaceIds: ids },
    ipAddress,
    userAgent,
  })

  return NextResponse.json({
    deactivated: ids.length,
    workplaces: empty.map((w) => ({ id: w.id, label: formatWorkplaceLabel(w) })),
  })
}
