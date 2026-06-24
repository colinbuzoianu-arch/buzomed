import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { parseDateRange, resolveDateRange } from '@/lib/reports/date-ranges'

/**
 * Per-company report data.
 *
 * Two views available, both returned in one response (the page renders
 * them as tabs):
 *
 *   - workerSummary: one row per worker who had at least one exam at
 *     this company in the range. Columns include: most recent exam
 *     date, verdict, next due date.
 *   - examinationList: one row per examination in the range, ordered
 *     by date descending.
 *
 * Range filter applies to BOTH views. For workerSummary we still only
 * include workers who had an exam in the range — if a cabinet wants
 * "every worker ever assigned to this company", that's a different
 * report (workforce roster, not yet built).
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const hasReportingRole = auth.user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Reports require practitioner role' },
      { status: 403 }
    )
  }

  const { id } = await ctx.params
  const company = await prisma.company.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true, name: true, cui: true },
  })
  if (!company) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const rangeKey = parseDateRange(searchParams.get('range'))
  const range = resolveDateRange(rangeKey)

  // Pull all exams in the range for workers at this company. We filter
  // through workplace.companyId rather than directly on Examination
  // because a worker may be in multiple companies via assignments — the
  // workplace at exam time is what binds the exam to the company.
  const examinations = await prisma.examination.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      createdAt: { gte: range.from, lt: range.to },
      workplace: { companyId: company.id, deletedAt: null },
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      examinationNumber: true,
      createdAt: true,
      scheduledAt: true,
      completedAt: true,
      signedAt: true,
      status: true,
      verdict: true,
      verdictConditions: true,
      nextExaminationDueDate: true,
      employee: {
        select: { id: true, firstName: true, lastName: true },
      },
      workplace: {
        select: { id: true, name: true, department: true },
      },
      examinationType: {
        select: { id: true, nameRo: true, nameEn: true, code: true },
      },
      practitioner: {
        select: { id: true, firstName: true, lastName: true },
      },
      signedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  })

  // workerSummary: pick the most recent exam per worker.
  const byWorker = new Map<
    string,
    (typeof examinations)[number]
  >()
  for (const e of examinations) {
    const existing = byWorker.get(e.employee.id)
    if (!existing || e.createdAt > existing.createdAt) {
      byWorker.set(e.employee.id, e)
    }
  }
  const workerSummary = Array.from(byWorker.values())
    .sort((a, b) =>
      `${a.employee.lastName}${a.employee.firstName}`.localeCompare(
        `${b.employee.lastName}${b.employee.firstName}`,
        'ro'
      )
    )
    .map((e) => ({
      employeeId: e.employee.id,
      employeeName: `${e.employee.lastName} ${e.employee.firstName}`,
      workplaceName: e.workplace.name,
      department: e.workplace.department,
      lastExamDate: e.createdAt.toISOString(),
      lastExamNumber: e.examinationNumber,
      lastExamSigned: e.signedAt !== null,
      lastVerdict: e.verdict,
      nextDueDate: e.nextExaminationDueDate
        ? e.nextExaminationDueDate.toISOString()
        : null,
    }))

  return NextResponse.json({
    company,
    range: {
      key: range.key,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
    workerSummary,
    examinationList: examinations.map((e) => ({
      id: e.id,
      examinationNumber: e.examinationNumber,
      createdAt: e.createdAt.toISOString(),
      scheduledAt: e.scheduledAt?.toISOString() ?? null,
      completedAt: e.completedAt?.toISOString() ?? null,
      signedAt: e.signedAt?.toISOString() ?? null,
      status: e.status,
      verdict: e.verdict,
      verdictConditions: e.verdictConditions,
      nextDueDate: e.nextExaminationDueDate?.toISOString() ?? null,
      employeeName: `${e.employee.lastName} ${e.employee.firstName}`,
      workplaceName: e.workplace.name,
      department: e.workplace.department,
      examinationTypeNameRo: e.examinationType.nameRo,
      examinationTypeNameEn: e.examinationType.nameEn,
      examinationTypeCode: e.examinationType.code,
      practitionerName: e.practitioner
        ? `${e.practitioner.lastName} ${e.practitioner.firstName}`
        : null,
      signedByName: e.signedBy
        ? `${e.signedBy.lastName} ${e.signedBy.firstName}`
        : null,
    })),
  })
}
