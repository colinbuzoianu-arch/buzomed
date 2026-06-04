import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUserFromKey } from '@/lib/api-keys/auth'
import { checkApiRateLimit } from '@/lib/api-keys/rate-limit'

export async function GET(request: NextRequest) {
  const apiAuth = await getApiUserFromKey(request)
  if (!apiAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rl = checkApiRateLimit(apiAuth.keyId)
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })

  if (!apiAuth.scopes.includes('recalls:read'))
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })

  const { tenantId } = apiAuth
  const rlHeaders = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) }

  const sp = request.nextUrl.searchParams
  const companyId = sp.get('companyId') ?? undefined
  const statusParam = sp.get('status') ?? undefined
  const horizon = parseInt(sp.get('horizon') ?? '0', 10) || 0
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50))
  const skip = (page - 1) * limit

  if (statusParam && !['pending', 'overdue'].includes(statusParam))
    return NextResponse.json({ error: 'validation_error', message: 'status must be pending or overdue' }, { status: 400 })

  if (horizon && ![30, 60, 90].includes(horizon))
    return NextResponse.json({ error: 'validation_error', message: 'horizon must be 30, 60, or 90' }, { status: 400 })

  const now = new Date()
  const horizonDate = horizon ? new Date(now.getTime() + horizon * 24 * 60 * 60 * 1000) : undefined

  const where = {
    tenantId,
    deletedAt: null,
    ...(statusParam ? { status: statusParam as never } : {}),
    ...(horizonDate ? { dueDate: { lte: horizonDate } } : {}),
    ...(companyId ? { workplace: { companyId } } : {}),
  }

  const [recalls, total] = await Promise.all([
    prisma.recall.findMany({
      where,
      skip,
      take: limit,
      orderBy: { dueDate: 'asc' },
      select: {
        id: true,
        employeeId: true,
        workplaceId: true,
        dueDate: true,
        status: true,
        notificationSentAt: true,
        employee: { select: { firstName: true, lastName: true } },
        workplace: { select: { name: true, company: { select: { id: true, name: true } } } },
        examinationType: { select: { nameRo: true } },
      },
    }),
    prisma.recall.count({ where }),
  ])

  const data = recalls.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
    companyId: r.workplace.company?.id ?? null,
    companyName: r.workplace.company?.name ?? null,
    workplaceId: r.workplaceId,
    workplaceName: r.workplace.name,
    examinationTypeName: r.examinationType.nameRo,
    dueDate: r.dueDate,
    status: r.status,
    notificationSentAt: r.notificationSentAt,
  }))

  return NextResponse.json({ data, total, page, limit }, { headers: rlHeaders })
}
