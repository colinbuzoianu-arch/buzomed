import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUserFromKey } from '@/lib/api-keys/auth'
import { checkApiRateLimit } from '@/lib/api-keys/rate-limit'

export async function GET(request: NextRequest) {
  const apiAuth = await getApiUserFromKey(request)
  if (!apiAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rl = checkApiRateLimit(apiAuth.keyId)
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })

  if (!apiAuth.scopes.includes('examinations:read'))
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })

  const { tenantId } = apiAuth
  const rlHeaders = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) }

  const sp = request.nextUrl.searchParams
  const companyId = sp.get('companyId') ?? undefined
  const employeeId = sp.get('employeeId') ?? undefined
  const status = sp.get('status') ?? undefined
  const signedOnly = sp.get('signedOnly') === 'true'
  const from = sp.get('from') ? new Date(sp.get('from')!) : undefined
  const to = sp.get('to') ? new Date(sp.get('to')!) : undefined
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50))
  const skip = (page - 1) * limit

  if (from && isNaN(from.getTime()))
    return NextResponse.json({ error: 'validation_error', message: 'Invalid from date' }, { status: 400 })
  if (to && isNaN(to.getTime()))
    return NextResponse.json({ error: 'validation_error', message: 'Invalid to date' }, { status: 400 })

  const where = {
    tenantId,
    deletedAt: null,
    ...(employeeId ? { employeeId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(signedOnly ? { signedAt: { not: null } } : {}),
    ...(from || to ? { scheduledAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(companyId ? { workplace: { companyId } } : {}),
  }

  const [examinations, total] = await Promise.all([
    prisma.examination.findMany({
      where,
      skip,
      take: limit,
      orderBy: { scheduledAt: 'desc' },
      select: {
        id: true,
        examinationNumber: true,
        employeeId: true,
        workplaceId: true,
        status: true,
        verdict: true,
        scheduledAt: true,
        completedAt: true,
        signedAt: true,
        nextExaminationDueDate: true,
        createdAt: true,
        employee: { select: { firstName: true, lastName: true } },
        workplace: { select: { name: true, company: { select: { id: true, name: true } } } },
        examinationType: { select: { nameRo: true } },
      },
    }),
    prisma.examination.count({ where }),
  ])

  const data = examinations.map((e) => ({
    id: e.id,
    examinationNumber: e.examinationNumber,
    employeeId: e.employeeId,
    employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
    companyId: e.workplace.company?.id ?? null,
    companyName: e.workplace.company?.name ?? null,
    workplaceId: e.workplaceId,
    workplaceName: e.workplace.name,
    examinationTypeName: e.examinationType.nameRo,
    status: e.status,
    verdict: e.verdict,
    scheduledAt: e.scheduledAt,
    completedAt: e.completedAt,
    signedAt: e.signedAt,
    nextExaminationDueDate: e.nextExaminationDueDate,
    createdAt: e.createdAt,
  }))

  return NextResponse.json({ data, total, page, limit }, { headers: rlHeaders })
}
