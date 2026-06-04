import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUserFromKey } from '@/lib/api-keys/auth'
import { checkApiRateLimit } from '@/lib/api-keys/rate-limit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiAuth = await getApiUserFromKey(request)
  if (!apiAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rl = checkApiRateLimit(apiAuth.keyId)
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })

  if (!apiAuth.scopes.includes('examinations:read'))
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })

  const { tenantId } = apiAuth
  const rlHeaders = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) }
  const { id } = await params

  const exam = await prisma.examination.findFirst({
    where: { id, tenantId, deletedAt: null },
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
  })

  if (!exam) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: rlHeaders })

  return NextResponse.json({
    id: exam.id,
    examinationNumber: exam.examinationNumber,
    employeeId: exam.employeeId,
    employeeName: `${exam.employee.firstName} ${exam.employee.lastName}`,
    companyId: exam.workplace.company?.id ?? null,
    companyName: exam.workplace.company?.name ?? null,
    workplaceId: exam.workplaceId,
    workplaceName: exam.workplace.name,
    examinationTypeName: exam.examinationType.nameRo,
    status: exam.status,
    verdict: exam.verdict,
    scheduledAt: exam.scheduledAt,
    completedAt: exam.completedAt,
    signedAt: exam.signedAt,
    nextExaminationDueDate: exam.nextExaminationDueDate,
    createdAt: exam.createdAt,
  }, { headers: rlHeaders })
}
