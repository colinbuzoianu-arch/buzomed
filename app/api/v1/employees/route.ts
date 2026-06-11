import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUserFromKey } from '@/lib/api-keys/auth'
import { checkApiRateLimit } from '@/lib/api-keys/rate-limit'

export async function GET(request: NextRequest) {
  const apiAuth = await getApiUserFromKey(request)
  if (!apiAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rl = checkApiRateLimit(apiAuth.keyId)
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })

  if (!apiAuth.scopes.includes('employees:read'))
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })

  const { tenantId } = apiAuth
  const rlHeaders = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) }

  const sp = request.nextUrl.searchParams
  const companyId = sp.get('companyId') ?? undefined
  const workplaceId = sp.get('workplaceId') ?? undefined
  const isActiveParam = sp.get('isActive')
  const isActive = isActiveParam === 'false' ? false : true
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50))
  const skip = (page - 1) * limit

  const where = {
    tenantId,
    deletedAt: null,
    isActive,
    ...(companyId ? { companyId } : {}),
    ...(workplaceId
      ? { workplaceAssignments: { some: { workplaceId, isCurrent: true } } }
      : {}),
  }

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        companyEmployeeId: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        email: true,
        phone: true,
        companyId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { name: true } },
        workplaceAssignments: {
          where: { isCurrent: true },
          take: 1,
          select: { workplaceId: true, workplace: { select: { name: true } } },
        },
      },
    }),
    prisma.employee.count({ where }),
  ])

  const data = employees.map((e) => ({
    id: e.id,
    companyEmployeeId: e.companyEmployeeId,
    firstName: e.firstName,
    lastName: e.lastName,
    jobTitle: e.jobTitle,
    email: e.email,
    phone: e.phone,
    companyId: e.companyId,
    companyName: e.company?.name ?? null,
    workplaceId: e.workplaceAssignments[0]?.workplaceId ?? null,
    workplaceName: e.workplaceAssignments[0]?.workplace?.name ?? null,
    isActive: e.isActive,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }))

  return NextResponse.json({ data, total, page, limit }, { headers: rlHeaders })
}
