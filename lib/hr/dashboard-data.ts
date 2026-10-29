import { prisma } from '@/lib/prisma'
import { resolveExaminationDate } from '@/lib/examinations/examined-at'
import { formatWorkplaceLabel } from '@/lib/workplaces/format'
import type { HrEmployeeRow, HrVerdict } from './dashboard-aggregate'
import type { HrScope } from './scope'

/**
 * The authoritative, server-only half of the HR dashboard.
 *
 * Loads the active employees in the HR user's scope and resolves each one's
 * governing fișă into the compact, medical-data-free `HrEmployeeRow` the
 * aggregation layer counts over. The three correctness rules from
 * docs/prompt-hr-dashboard.md are enforced here:
 *
 *  1. Status comes from the latest *valid* examination's nextExaminationDueDate,
 *     else the earliest *open* recall's dueDate. Imported employees (a recall
 *     but no examination — e.g. examined before Buzomed) therefore count as a
 *     real, dated status instead of "fără examen", and their verdict is
 *     reported as unknown (`verdictKnown: false`), never as apt.
 *  2. Revoked (`revokedAt`) and unsigned (`signedAt` null) examinations are
 *     excluded — a withdrawn or unsigned fișă is not a valid aptitude document.
 *     "Latest" is by the date the fișă actually uses (resolveExaminationDate),
 *     not by completedAt alone.
 *  3. inaptTemporarUntil is carried through for the alerts.
 *
 * Only fields that appear on the fișa de aptitudine leave this function. No
 * clinical columns are ever selected.
 */
export async function loadHrDashboardRows(
  scope: Extract<HrScope, { ok: true }>
): Promise<HrEmployeeRow[]> {
  const { tenantId, companyIds } = scope

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
          workplace: { select: { id: true, name: true, workSite: { select: { name: true } } } },
        },
        take: 1,
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  if (employees.length === 0) return []

  const employeeIds = employees.map((e) => e.id)

  // Valid examinations only: completed, signed, not revoked, not deleted.
  // We sort by resolveExaminationDate in JS (a fallback chain SQL can't order
  // by directly) to pick the governing fișă per employee.
  const examinations = await prisma.examination.findMany({
    where: {
      tenantId,
      employeeId: { in: employeeIds },
      status: 'completed',
      signedAt: { not: null },
      revokedAt: null,
      deletedAt: null,
    },
    select: {
      employeeId: true,
      verdict: true,
      nextExaminationDueDate: true,
      inaptTemporarUntil: true,
      examinedAt: true,
      completedAt: true,
      createdAt: true,
    },
  })

  const latestExamByEmployee = new Map<
    string,
    {
      verdict: HrVerdict | null
      nextExaminationDueDate: Date | null
      inaptTemporarUntil: Date | null
      resolvedDate: number
    }
  >()
  for (const exam of examinations) {
    const resolvedDate = resolveExaminationDate(exam).getTime()
    const current = latestExamByEmployee.get(exam.employeeId)
    if (!current || resolvedDate > current.resolvedDate) {
      latestExamByEmployee.set(exam.employeeId, {
        verdict: (exam.verdict as HrVerdict | null) ?? null,
        nextExaminationDueDate: exam.nextExaminationDueDate,
        inaptTemporarUntil: exam.inaptTemporarUntil,
        resolvedDate,
      })
    }
  }

  // Open recalls (pending / scheduled / overdue). We track the earliest due
  // date and whether any of them is `scheduled` (control programat).
  const recalls = await prisma.recall.findMany({
    where: {
      tenantId,
      employeeId: { in: employeeIds },
      status: { in: ['pending', 'scheduled', 'overdue'] },
      deletedAt: null,
    },
    select: { employeeId: true, dueDate: true, status: true },
  })

  const recallByEmployee = new Map<
    string,
    { earliestDue: Date; hasScheduled: boolean }
  >()
  for (const recall of recalls) {
    const current = recallByEmployee.get(recall.employeeId)
    const isScheduled = recall.status === 'scheduled'
    if (!current) {
      recallByEmployee.set(recall.employeeId, {
        earliestDue: recall.dueDate,
        hasScheduled: isScheduled,
      })
    } else {
      if (recall.dueDate < current.earliestDue) current.earliestDue = recall.dueDate
      if (isScheduled) current.hasScheduled = true
    }
  }

  return employees.map((emp) => {
    const exam = latestExamByEmployee.get(emp.id)
    const recall = recallByEmployee.get(emp.id)
    const workplace = emp.workplaceAssignments[0]?.workplace ?? null

    let source: HrEmployeeRow['source'] = 'none'
    let dueDate: Date | null = null

    if (exam?.nextExaminationDueDate) {
      source = 'examination'
      dueDate = exam.nextExaminationDueDate
    } else if (recall) {
      source = 'recall'
      dueDate = recall.earliestDue
    }

    return {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      jobTitle: emp.jobTitle,
      companyId: emp.companyId,
      workplaceId: workplace?.id ?? null,
      workplaceName: workplace ? formatWorkplaceLabel(workplace) : null,
      // Verdict is known only from a signed Buzomed examination. Imported /
      // record-less employees stay "necunoscut".
      verdict: exam ? exam.verdict : null,
      verdictKnown: Boolean(exam),
      source,
      dueDate: dueDate ? dueDate.toISOString() : null,
      inaptTemporarUntil: exam?.inaptTemporarUntil
        ? exam.inaptTemporarUntil.toISOString()
        : null,
      hasScheduledRecall: recall?.hasScheduled ?? false,
    }
  })
}
