import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'

/**
 * GET /api/employees/by-company?companyId={id}
 *
 * Returns all active, non-archived employees for a given company within
 * the authenticated user's tenant. Response shape matches /api/employees/search
 * so callers can use the same EmployeeResult type.
 */
export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const companyId = new URL(request.url).searchParams.get('companyId')
  if (!companyId)
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const employees = await prisma.employee.findMany({
    where: {
      tenantId: auth.user.tenantId,
      companyId,
      isActive: true,
      deletedAt: null,
      archivedAt: null,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      companyEmployeeId: true,
      company: { select: { name: true } },
      workplaceAssignments: {
        where: { isCurrent: true },
        take: 1,
        select: {
          workplace: {
            select: {
              id: true,
              name: true,
              isActive: true,
              company: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  return NextResponse.json({
    employees: employees.map((e) => {
      const wp = e.workplaceAssignments[0]?.workplace
      const activeWp = wp?.isActive ? wp : null
      return {
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        companyEmployeeId: e.companyEmployeeId,
        companyName: activeWp?.company.name ?? e.company?.name ?? '',
        workplaceId: activeWp?.id ?? null,
        workplaceName: activeWp?.name ?? '',
      }
    }),
  })
}
