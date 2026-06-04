import { prisma } from '@/lib/prisma'
import { monthBucketsForRange } from './date-ranges'
import type { DateRangeKey } from './date-ranges'

export interface ComplianceEmployee {
  id: string
  lastName: string
  firstName: string
  jobTitle: string | null
  workplaceId: string | null
  workplaceName: string | null
  lastExamDate: string | null
  lastVerdict: string | null
  nextDueDate: string | null
  status: 'valid' | 'expired' | 'never_examined'
}

export interface ComplianceData {
  company: { id: string; name: string; cui: string | null }
  tenant: { name: string }
  year: number
  generatedAt: string
  snapshot: {
    totalActiveEmployees: number
    employeesWithValidFisa: number
    employeesWithExpiredFisa: number
    employeesNeverExamined: number
    coverageRate: number | null
    expiringIn30Days: number
    expiringIn60Days: number
  }
  annual: {
    totalExaminationsYear: number
    signedExaminationsYear: number
    verdictBreakdown: { apt: number; apt_conditionat: number; inapt_temporar: number; inapt: number }
    avgDaysFromScheduledToSigned: number | null
  }
  adherence: {
    totalRecallsDue: number
    recallsCompleted: number
    recallsOverdue: number
    adherenceRate: number | null
  }
  monthlyTrend: Array<{
    month: number // 1-12
    year: number
    examinationsCompleted: number
    recallsDue: number
    recallsCompleted: number
  }>
  workplaceBreakdown: Array<{
    workplaceId: string
    workplaceName: string
    totalEmployees: number
    validFisa: number
    expired: number
    neverExamined: number
    coverageRate: number | null
  }>
  employeeList: ComplianceEmployee[]
}

export async function computeComplianceData(params: {
  companyId: string
  tenantId: string
  year: number
}): Promise<ComplianceData | null> {
  const { companyId, tenantId, year } = params

  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayPlus30 = new Date(today.getTime() + 30 * 86_400_000)
  const todayPlus60 = new Date(today.getTime() + 60 * 86_400_000)

  const [company, tenant, employees, yearExams, yearRecalls, overdueRecalls, workplaces] =
    await Promise.all([
      prisma.company.findFirst({
        where: { id: companyId, tenantId, deletedAt: null },
        select: { id: true, name: true, cui: true },
      }),
      prisma.tenant.findFirst({
        where: { id: tenantId },
        select: { name: true, legalName: true },
      }),
      prisma.employee.findMany({
        where: {
          companyId,
          tenantId,
          isActive: true,
          deletedAt: null,
          archivedAt: null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          examinations: {
            where: { deletedAt: null, signedAt: { not: null } },
            orderBy: { signedAt: 'desc' },
            take: 1,
            select: {
              signedAt: true,
              verdict: true,
              nextExaminationDueDate: true,
            },
          },
          workplaceAssignments: {
            where: { isCurrent: true },
            take: 1,
            select: {
              workplace: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      prisma.examination.findMany({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: yearStart, lt: yearEnd },
          workplace: { companyId, deletedAt: null },
        },
        select: {
          scheduledAt: true,
          signedAt: true,
          verdict: true,
          createdAt: true,
        },
      }),
      prisma.recall.findMany({
        where: {
          tenantId,
          deletedAt: null,
          dueDate: { gte: yearStart, lt: yearEnd },
          workplace: { companyId, deletedAt: null },
        },
        select: { id: true, status: true, dueDate: true },
      }),
      prisma.recall.findMany({
        where: {
          tenantId,
          deletedAt: null,
          dueDate: { lt: today },
          status: { in: ['pending', 'overdue'] },
          workplace: { companyId, deletedAt: null },
        },
        select: { id: true },
      }),
      prisma.workplace.findMany({
        where: { companyId, tenantId, isActive: true, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ])

  if (!company) return null

  // ── A. Snapshot metrics ──────────────────────────────────────────────────────

  let employeesWithValidFisa = 0
  let employeesWithExpiredFisa = 0
  let employeesNeverExamined = 0
  let expiringIn30Days = 0
  let expiringIn60Days = 0

  for (const emp of employees) {
    const latestExam = emp.examinations[0] ?? null
    if (!latestExam) {
      employeesNeverExamined++
    } else {
      const due = latestExam.nextExaminationDueDate
      if (due && due > today) {
        employeesWithValidFisa++
        if (due <= todayPlus30) expiringIn30Days++
        if (due <= todayPlus60) expiringIn60Days++
      } else {
        employeesWithExpiredFisa++
      }
    }
  }

  const totalActiveEmployees = employees.length
  const coverageRate =
    totalActiveEmployees > 0
      ? Math.round((employeesWithValidFisa / totalActiveEmployees) * 1000) / 10
      : null

  // ── B. Annual metrics ────────────────────────────────────────────────────────

  const signedYearExams = yearExams.filter((e) => e.signedAt !== null)
  const verdictBreakdown = { apt: 0, apt_conditionat: 0, inapt_temporar: 0, inapt: 0 }
  for (const e of signedYearExams) {
    if (e.verdict && e.verdict in verdictBreakdown) {
      verdictBreakdown[e.verdict as keyof typeof verdictBreakdown]++
    }
  }

  const examsWithBothDates = signedYearExams.filter((e) => e.scheduledAt && e.signedAt)
  let avgDaysFromScheduledToSigned: number | null = null
  if (examsWithBothDates.length > 0) {
    const totalDays = examsWithBothDates.reduce((acc, e) => {
      return acc + (e.signedAt!.getTime() - e.scheduledAt!.getTime()) / 86_400_000
    }, 0)
    avgDaysFromScheduledToSigned =
      Math.round((totalDays / examsWithBothDates.length) * 10) / 10
  }

  // ── C. Recall adherence ──────────────────────────────────────────────────────

  const totalRecallsDue = yearRecalls.length
  const recallsCompleted = yearRecalls.filter((r) => r.status === 'completed').length
  const recallsOverdue = overdueRecalls.length
  const adherenceRate =
    totalRecallsDue > 0
      ? Math.round((recallsCompleted / totalRecallsDue) * 1000) / 10
      : null

  // ── D. Monthly trend ─────────────────────────────────────────────────────────

  const yearRange = { key: 'thisYear' as DateRangeKey, from: yearStart, to: yearEnd }
  const buckets = monthBucketsForRange(yearRange)
  const monthlyTrend = buckets.map((bucket) => {
    const examinationsCompleted = yearExams.filter(
      (e) => e.signedAt && e.signedAt >= bucket.from && e.signedAt < bucket.to
    ).length
    const recallsDue = yearRecalls.filter(
      (r) => r.dueDate >= bucket.from && r.dueDate < bucket.to
    ).length
    const bucketRecallsCompleted = yearRecalls.filter(
      (r) =>
        r.status === 'completed' && r.dueDate >= bucket.from && r.dueDate < bucket.to
    ).length
    return {
      month: bucket.month + 1, // 0-indexed → 1-indexed
      year: bucket.year,
      examinationsCompleted,
      recallsDue,
      recallsCompleted: bucketRecallsCompleted,
    }
  })

  // ── E. Workplace breakdown ───────────────────────────────────────────────────

  const wpEmployeeMap = new Map<string, typeof employees>()
  for (const wp of workplaces) {
    wpEmployeeMap.set(wp.id, [])
  }
  for (const emp of employees) {
    const wpId = emp.workplaceAssignments[0]?.workplace?.id
    if (wpId && wpEmployeeMap.has(wpId)) {
      wpEmployeeMap.get(wpId)!.push(emp)
    }
  }

  const workplaceBreakdown = workplaces.map((wp) => {
    const wpEmps = wpEmployeeMap.get(wp.id) ?? []
    let validFisa = 0
    let expired = 0
    let neverExamined = 0
    for (const emp of wpEmps) {
      const latestExam = emp.examinations[0] ?? null
      if (!latestExam) {
        neverExamined++
      } else {
        const due = latestExam.nextExaminationDueDate
        if (due && due > today) {
          validFisa++
        } else {
          expired++
        }
      }
    }
    const total = wpEmps.length
    return {
      workplaceId: wp.id,
      workplaceName: wp.name,
      totalEmployees: total,
      validFisa,
      expired,
      neverExamined,
      coverageRate: total > 0 ? Math.round((validFisa / total) * 1000) / 10 : null,
    }
  })

  // ── Employee list ────────────────────────────────────────────────────────────

  const employeeList: ComplianceEmployee[] = employees
    .map((emp) => {
      const latestExam = emp.examinations[0] ?? null
      const wp = emp.workplaceAssignments[0]?.workplace ?? null
      let status: ComplianceEmployee['status']
      if (!latestExam) {
        status = 'never_examined'
      } else {
        const due = latestExam.nextExaminationDueDate
        status = due && due > today ? 'valid' : 'expired'
      }
      return {
        id: emp.id,
        lastName: emp.lastName,
        firstName: emp.firstName,
        jobTitle: emp.jobTitle,
        workplaceId: wp?.id ?? null,
        workplaceName: wp?.name ?? null,
        lastExamDate: latestExam?.signedAt?.toISOString() ?? null,
        lastVerdict: latestExam?.verdict ?? null,
        nextDueDate: latestExam?.nextExaminationDueDate?.toISOString() ?? null,
        status,
      }
    })
    .sort((a, b) => {
      const wpCmp = (a.workplaceName ?? '').localeCompare(b.workplaceName ?? '', 'ro')
      return wpCmp !== 0 ? wpCmp : a.lastName.localeCompare(b.lastName, 'ro')
    })

  return {
    company: { id: company.id, name: company.name, cui: company.cui },
    tenant: { name: tenant?.legalName ?? tenant?.name ?? 'Cabinet' },
    year,
    generatedAt: new Date().toISOString(),
    snapshot: {
      totalActiveEmployees,
      employeesWithValidFisa,
      employeesWithExpiredFisa,
      employeesNeverExamined,
      coverageRate,
      expiringIn30Days,
      expiringIn60Days,
    },
    annual: {
      totalExaminationsYear: yearExams.length,
      signedExaminationsYear: signedYearExams.length,
      verdictBreakdown,
      avgDaysFromScheduledToSigned,
    },
    adherence: {
      totalRecallsDue,
      recallsCompleted,
      recallsOverdue,
      adherenceRate,
    },
    monthlyTrend,
    workplaceBreakdown,
    employeeList,
  }
}
