import { prisma } from '@/lib/prisma'
import type { HrExportEmployee } from './service'

/**
 * Fetches all active employees for a company with their latest signed
 * examination result. Selects ONLY non-sensitive operational fields —
 * no CNP, birthDate, address, or any clinical/medical data.
 */
export async function fetchHrExportData(
  companyId: string,
  tenantId: string
): Promise<HrExportEmployee[]> {
  const employees = await prisma.employee.findMany({
    where: {
      companyId,
      tenantId,
      isActive: true,
      deletedAt: null,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      lastName: true,
      firstName: true,
      companyEmployeeId: true,
      jobTitle: true,
      workplaceAssignments: {
        where: { isCurrent: true },
        take: 1,
        select: {
          workplace: { select: { name: true } },
        },
      },
      examinations: {
        where: { signedAt: { not: null }, deletedAt: null },
        orderBy: { signedAt: 'desc' },
        take: 1,
        select: {
          completedAt: true,
          verdict: true,
          nextExaminationDueDate: true,
        },
      },
    },
  })

  return employees.map((emp) => {
    const lastExam = emp.examinations[0] ?? null
    return {
      companyEmployeeId: emp.companyEmployeeId,
      lastName: emp.lastName,
      firstName: emp.firstName,
      jobTitle: emp.jobTitle,
      workplace: emp.workplaceAssignments[0]?.workplace?.name ?? null,
      lastExamDate: lastExam?.completedAt ?? null,
      verdict: lastExam?.verdict ?? null,
      nextDueDate: lastExam?.nextExaminationDueDate ?? null,
    }
  })
}
