import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUserFromKey } from '@/lib/api-keys/auth'
import { checkApiRateLimit } from '@/lib/api-keys/rate-limit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiAuth = await getApiUserFromKey(request)
  if (!apiAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rl = checkApiRateLimit(apiAuth.keyId)
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })

  if (!apiAuth.scopes.includes('employees:read'))
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })

  const { tenantId } = apiAuth
  const rlHeaders = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) }
  const { id } = await params

  const employee = await prisma.employee.findFirst({
    where: { id, tenantId, deletedAt: null },
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
      company: { select: { name: true } },
      workplaceAssignments: {
        where: { isCurrent: true },
        take: 1,
        select: { workplaceId: true, workplace: { select: { name: true } } },
      },
    },
  })

  if (!employee) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: rlHeaders })

  return NextResponse.json({
    id: employee.id,
    companyEmployeeId: employee.companyEmployeeId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    jobTitle: employee.jobTitle,
    email: employee.email,
    phone: employee.phone,
    companyId: employee.companyId,
    companyName: employee.company?.name ?? null,
    workplaceId: employee.workplaceAssignments[0]?.workplaceId ?? null,
    workplaceName: employee.workplaceAssignments[0]?.workplace?.name ?? null,
    isActive: employee.isActive,
    createdAt: employee.createdAt,
  }, { headers: rlHeaders })
}
