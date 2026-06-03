import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { HrDashboardClient } from './hr-dashboard-client'

export default async function HrDashboardPage() {
  const user = await requireUser()

  const assignments = await prisma.companyHrAssignment.findMany({
    where: { userId: user.id },
    select: {
      companyId: true,
      tenantId: true,
      company: { select: { id: true, name: true, city: true } },
    },
  })

  if (assignments.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">Nicio companie atribuită</p>
        <p className="text-sm mt-1">
          Contactați administratorul cabinetului pentru a obține acces.
        </p>
      </div>
    )
  }

  const companyIds = assignments.map((a) => a.companyId)
  const tenantId = assignments[0].tenantId
  const companies = assignments.map((a) => a.company)

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

  const employeeIds = employees.map((e) => e.id)

  const examinations =
    employeeIds.length > 0
      ? await prisma.examination.findMany({
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
      : []

  // Keep only the latest completed exam per employee
  const latestByEmployee = new Map<
    string,
    { verdict: string | null; nextExaminationDueDate: string | null }
  >()
  for (const exam of examinations) {
    if (!latestByEmployee.has(exam.employeeId)) {
      latestByEmployee.set(exam.employeeId, {
        verdict: exam.verdict,
        nextExaminationDueDate:
          exam.nextExaminationDueDate?.toISOString() ?? null,
      })
    }
  }

  const now = new Date()
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  type Status = 'valid' | 'expiringSoon' | 'expired' | 'noExamination'

  const rows = employees.map((emp) => {
    const exam = latestByEmployee.get(emp.id)
    let status: Status = 'noExamination'

    if (exam?.nextExaminationDueDate) {
      const due = new Date(exam.nextExaminationDueDate)
      if (due < now) status = 'expired'
      else if (due <= thirtyDays) status = 'expiringSoon'
      else status = 'valid'
    }

    return {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      jobTitle: emp.jobTitle ?? '',
      companyId: emp.companyId ?? '',
      workplace: emp.workplaceAssignments[0]?.workplace?.name ?? '',
      verdict: exam?.verdict ?? null,
      nextExaminationDueDate: exam?.nextExaminationDueDate ?? null,
      status,
    }
  })

  const summary = {
    total: rows.length,
    apt: rows.filter((r) => r.verdict === 'apt').length,
    expiringSoon: rows.filter((r) => r.status === 'expiringSoon').length,
    missing: rows.filter(
      (r) => r.status === 'noExamination' || r.status === 'expired'
    ).length,
  }

  return (
    <HrDashboardClient
      rows={rows}
      summary={summary}
      companies={companies}
    />
  )
}
