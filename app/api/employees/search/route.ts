import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'

const MAX_LIMIT = 100

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const q = searchParams.get('q') ?? ''
  const limit = Math.min(
    parseInt(searchParams.get('limit') ?? '20', 10) || 20,
    MAX_LIMIT
  )

  const select = {
    id: true,
    firstName: true,
    lastName: true,
    jobTitle: true,
    companyEmployeeId: true,
    company: { select: { name: true } },
    workplaceAssignments: {
      where: { isCurrent: true },
      take: 1,
      select: {
        workplaceId: true,
        workplace: {
          select: {
            id: true,
            name: true,
            department: true,
            isActive: true,
            company: { select: { name: true } },
          },
        },
      },
    },
  } as const

  // Single employee lookup by id (used by the combobox to resolve a preselected value)
  if (id) {
    const employee = await prisma.employee.findFirst({
      where: { id, tenantId: auth.user.tenantId, deletedAt: null, archivedAt: null },
      select,
    })
    if (!employee) return NextResponse.json({ employees: [] })
    return NextResponse.json({ employees: [toResult(employee)] })
  }

  // Search requires at least 2 characters
  if (q.length < 2) {
    return NextResponse.json({ employees: [] })
  }

  const employees = await prisma.employee.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      archivedAt: null,
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { jobTitle: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: limit,
    select,
  })

  return NextResponse.json({ employees: employees.map(toResult) })
}

type EmployeeRow = {
  id: string
  firstName: string
  lastName: string
  jobTitle: string | null
  companyEmployeeId: string | null
  company: { name: string } | null
  workplaceAssignments: Array<{
    workplaceId: string
    workplace: {
      id: string
      name: string
      department: string | null
      isActive: boolean
      company: { name: string }
    }
  }>
}

function toResult(e: EmployeeRow) {
  const assignment = e.workplaceAssignments[0]
  const activeWorkplace = assignment?.workplace.isActive ? assignment.workplace : null
  return {
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    jobTitle: e.jobTitle,
    companyName: activeWorkplace?.company.name ?? e.company?.name ?? '',
    workplaceName: activeWorkplace?.name ?? '',
    workplaceId: activeWorkplace?.id ?? null,
    workplaceDepartment: activeWorkplace?.department ?? null,
    companyEmployeeId: e.companyEmployeeId,
  }
}
