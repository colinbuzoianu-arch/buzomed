import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'

export async function GET() {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.roles.includes('company_hr')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const userId = auth.user.id

  // Load companies this HR user is assigned to
  const assignments = await prisma.companyHrAssignment.findMany({
    where: { userId },
    select: { companyId: true, tenantId: true },
  })

  if (assignments.length === 0) {
    return NextResponse.json({ employees: [], summary: emptySummary() })
  }

  // Fail loudly if assignments span multiple tenants — silent data-drop is worse than an error.
  const tenantIds = new Set(assignments.map((a) => a.tenantId))
  if (tenantIds.size > 1) {
    console.error('[hr/dashboard] multi-tenant HR user detected', { userId, tenantIds: [...tenantIds] })
    return NextResponse.json({ error: 'multi_tenant_hr_not_supported' }, { status: 500 })
  }

  const companyIds = assignments.map((a) => a.companyId)
  const tenantId = assignments[0].tenantId

  // Load employees — no sensitive fields
  const employees = await prisma.employee.findMany({
    where: {
      tenantId,
      companyId: { in: companyIds },
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      companyId: true,
      workplaceAssignments: {
        where: { isCurrent: true },
        select: {
          workplace: { select: { id: true, name: true } },
        },
        take: 1,
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  if (employees.length === 0) {
    return NextResponse.json({ employees: [], summary: emptySummary() })
  }

  const employeeIds = employees.map((e) => e.id)

  // Load latest completed examination per employee
  const examinations = await prisma.examination.findMany({
    where: {
      tenantId,
      employeeId: { in: employeeIds },
      status: 'completed',
      deletedAt: null,
    },
    select: {
      employeeId: true,
      verdict: true,
      nextExaminationDueDate: true,
      completedAt: true,
    },
    orderBy: { completedAt: 'desc' },
  })

  // Keep only the latest exam per employee
  const latestExamByEmployee = new Map<
    string,
    { verdict: string | null; nextExaminationDueDate: Date | null; completedAt: Date | null }
  >()
  for (const exam of examinations) {
    if (!latestExamByEmployee.has(exam.employeeId)) {
      latestExamByEmployee.set(exam.employeeId, {
        verdict: exam.verdict,
        nextExaminationDueDate: exam.nextExaminationDueDate,
        completedAt: exam.completedAt,
      })
    }
  }

  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  type EmployeeStatus = 'valid' | 'expiringSoon' | 'expired' | 'noExamination'

  const result = employees.map((emp) => {
    const exam = latestExamByEmployee.get(emp.id)
    let status: EmployeeStatus = 'noExamination'

    if (exam) {
      const due = exam.nextExaminationDueDate
      if (!due) {
        status = 'noExamination'
      } else if (due < now) {
        status = 'expired'
      } else if (due <= thirtyDaysFromNow) {
        status = 'expiringSoon'
      } else {
        status = 'valid'
      }
    }

    return {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      jobTitle: emp.jobTitle,
      companyId: emp.companyId,
      workplace: emp.workplaceAssignments[0]?.workplace ?? null,
      verdict: exam?.verdict ?? null,
      nextExaminationDueDate: exam?.nextExaminationDueDate?.toISOString() ?? null,
      status,
    }
  })

  const summary = {
    total: result.length,
    apt: result.filter((e) => e.verdict === 'apt').length,
    expiringSoon: result.filter((e) => e.status === 'expiringSoon').length,
    missing: result.filter(
      (e) => e.status === 'noExamination' || e.status === 'expired'
    ).length,
  }

  return NextResponse.json({ employees: result, summary })
}

function emptySummary() {
  return { total: 0, apt: 0, expiringSoon: 0, missing: 0 }
}
